-- 0033 — N5-B. The disclosure sensitivity ceiling.
--
-- N5-A answers "is this recipient authorized, for this purpose, over this field set?". It cannot
-- answer "is this kind of content allowed to cross an organization boundary at all?", and a grant
-- is written by the grantor — so with N5-A alone the grantor is the only thing standing between a
-- sensitive contract and the network. N5-B is the second, independent, fail-closed condition:
--
--   AN N5-A GRANT MAY NARROW WHAT CAN LEAVE. IT MUST NEVER WIDEN WHAT N5-B ALLOWS TO LEAVE.
--
-- Three governed tables, all migration-authored and immutable, all read-only at runtime:
--
--   network_disclosure_sensitivities        the ordered vocabulary
--   network_schema_disclosure_sensitivity   exactly one assignment per exact contract version
--   network_disclosure_purpose_ceilings     the maximum a purpose may ever reach
--
-- CONTRACT-LEVEL, NOT FIELD-LEVEL, and that is a decision rather than a first step. Field-level
-- sensitivity would create a SECOND security-critical field enumeration beside
-- `network_disclosure_projection_fields`, free to disagree with it, with nothing forcing agreement.
-- The cost is stated plainly: a contract takes the highest sensitivity of anything inside it, so
-- `evidence-envelope` is never_external in its entirety even though `content_hash` alone is
-- harmless. Eight of the nine registered contracts have no projection today, so nothing in use is
-- lost, and field-level overrides remain reachable later as a purely NARROWING change.
--
-- WHAT THIS MIGRATION DOES NOT DO. No publisher, no subscription, no destination, no delivery
-- state, no wire envelope, no external egress of any kind. N5-B decides eligibility. N6 will own
-- delivery, and N6 is not authorized.
--
-- NO RECLASSIFICATION MACHINERY. There is no supersession column, no revision, no effective dating
-- and no correction path. Every registered contract gets one immutable assignment and every purpose
-- one immutable ceiling. Lowering a ceiling or raising a sensitivity later is a security-widening
-- governance decision that must arrive as its own reviewed migration, and prebuilding a convenient
-- path for it would be prebuilding the bypass.

-- ---------------------------------------------------------------------------
-- §1. The ordered sensitivity vocabulary.
--
-- A reference TABLE rather than an enum, for the reasons 0032 §1 records: `ALTER TYPE … ADD VALUE`
-- cannot be used in the transaction that references the new value, and a foreign key to a table is
-- what makes a code provably governed rather than free text.
--
-- The ORDER has machine meaning. `rank` is UNIQUE, so no two levels can compare equal, and the
-- ceiling test is `assigned.rank <= ceiling.rank`. `externally_disclosable` is carried separately
-- and is NOT derivable from the rank: the evaluator must honour both, so that a level can be made
-- non-disclosable in future without depending on it having been given the reserved rank.
--
-- Rank 99 is reserved for `never_external` and the two CHECKs below make that biconditional. That
-- is what stops a later migration from either renaming the absolute class or minting a second one.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_sensitivities (
  code                   text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  rank                   integer NOT NULL UNIQUE CHECK (rank > 0),
  externally_disclosable boolean NOT NULL,
  description            text NOT NULL CHECK (length(btrim(description)) > 0),
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL DEFAULT current_user,

  -- Rank 99 belongs to `never_external` and to nothing else.
  CONSTRAINT network_disclosure_sensitivities_rank_99_reserved
    CHECK (rank <> 99 OR code = 'never_external'),
  -- And `never_external` is exactly rank 99 and never disclosable. Together with the constraint
  -- above this is a biconditional: the absolute class cannot be renamed, re-ranked, or switched on.
  CONSTRAINT network_disclosure_sensitivities_never_external_shape
    CHECK (code <> 'never_external' OR (rank = 99 AND NOT externally_disclosable))
);

COMMENT ON TABLE network_disclosure_sensitivities IS
  'The ordered NETWORK DISCLOSURE sensitivity vocabulary. This is NOT the internal handling '
  'classification in docs/governance/DATA_CLASSIFICATION.md and shares no vocabulary with it: '
  'internal handling governs FreightOS custody (development copies, model providers, logs), while '
  'this governs whether a canonical contract version may cross an organization boundary at all. '
  'Neither axis grants recipient authority — that is N5-A.';

COMMENT ON COLUMN network_disclosure_sensitivities.rank IS
  'Total order. UNIQUE so no two levels compare equal, and the ceiling test is a plain <=.';

COMMENT ON COLUMN network_disclosure_sensitivities.externally_disclosable IS
  'Carried independently of rank. The evaluator must require BOTH this and the rank comparison, so '
  'a future non-disclosable level does not depend on holding the reserved rank.';

INSERT INTO network_disclosure_sensitivities
  (code, rank, externally_disclosable, description, created_by) VALUES
  ('execution_operational', 10, true,
   'Facts a counterparty must hold to perform operational work the parties have already agreed. '
   'This does NOT mean public and it confers nothing on its own: an N5-A grant naming the '
   'recipient, purpose and projection is still required.',
   'migration:0033'),
  ('counterparty_identifying', 20, true,
   'Participant identity, rosters, representation, relationship shape, or externally issued '
   'identifying values. Disclosable only under explicit authority. Being identifiable is not an '
   'authority signal: N1 participant attributes remain authority-inert.',
   'migration:0033'),
  ('commercial_terms', 30, true,
   'Rates, margins, terms, capacity economics and economically sensitive commercial state. '
   'Constitution Art. III.2 names customer economics as the category whose cross-customer leakage '
   'is prohibited by name, which is what places this strictly above counterparty_identifying '
   'rather than merely beside it. Not permitted under shipment_execution.',
   'migration:0033'),
  ('never_external', 99, false,
   'Absolute prohibition on disclosure through N6. Remains denied regardless of grant, purpose, '
   'authority basis, tenant relationship, administrator, operator, control plane or transport '
   'intent. No override exists anywhere in this migration or the evaluator.',
   'migration:0033');

-- ---------------------------------------------------------------------------
-- §2. Per-contract assignment.
--
-- The primary key IS `durable_schema_ref`, and that single choice carries the version-isolation
-- invariant structurally rather than by rule: `workflow-state.v2.json` is a different key with no
-- row, so it is unassigned, so it is denied. There is no lookup of a previous version, a semantic
-- predecessor or a shared base name — a v2 that adds a sensitive field CANNOT inherit v1's ceiling
-- because there is nothing to inherit through.
--
-- Refs are RESOLVED FROM THE REGISTRY rather than written out here, by joining on `artifact_class`.
-- A typo in a hand-copied URL would produce a row that satisfies its foreign key against nothing
-- and a contract that silently has no assignment; joining means an unmatched class contributes no
-- row at all and the completeness assertion in §6 fails loudly.
-- ---------------------------------------------------------------------------

CREATE TABLE network_schema_disclosure_sensitivity (
  durable_schema_ref text PRIMARY KEY
    REFERENCES network_schema_versions (durable_schema_ref),
  sensitivity_code   text NOT NULL
    REFERENCES network_disclosure_sensitivities (code),
  -- A classification without a stated reason is unreviewable, so the reason is NOT NULL. This is
  -- the field a future reviewer reads when deciding whether an assignment still holds.
  rationale          text NOT NULL CHECK (length(btrim(rationale)) > 0),
  assigned_at        timestamptz NOT NULL DEFAULT now(),
  assigned_by        text NOT NULL DEFAULT current_user
);

CREATE INDEX network_schema_disclosure_sensitivity_code_idx
  ON network_schema_disclosure_sensitivity (sensitivity_code);

COMMENT ON TABLE network_schema_disclosure_sensitivity IS
  'Exactly one immutable sensitivity per EXACT durable schema version. There is deliberately no '
  'assignment_id, superseded_by, revision, effective_from or effective_until: a correction path is '
  'a widening path, and changing a classification is a governance decision that must arrive as a '
  'reviewed migration rather than through a mechanism built in advance.';

INSERT INTO network_schema_disclosure_sensitivity
  (durable_schema_ref, sensitivity_code, rationale, assigned_by)
SELECT s.durable_schema_ref, m.sensitivity_code, m.rationale, 'migration:0033'
  FROM network_schema_versions s
  JOIN (VALUES
    ('workflow-state', 'counterparty_identifying',
     'Its authorized projection includes /participants, a roster of network participant ids, and '
     'the roster identifies counterparties beyond the immediate transaction. Because N5-B is '
     'contract-level, the contract takes the highest sensitivity it carries, so the presence of '
     'the roster — not the presence of /state — decides this. Classified from the actual schema '
     'and the actual pointer set, never from the projection description.'),
    ('event-correction', 'execution_operational',
     'Correction linkage between canonical events. Carries no participant roster, no identifying '
     'value and no commercial term.'),
    ('object-reference', 'counterparty_identifying',
     'external_aliases carries externally issued identifying values (USDOT, MC, EIN, LEI). The '
     'linkage of an alias to a network object is not public even though the issuing registry is.'),
    ('participant-identity', 'counterparty_identifying',
     'Identity, representation and assurance_level. Disclosable only under explicit authority, and '
     'assurance_level in particular must never be read as an authority signal by a recipient — '
     'disclosing it invites exactly that misreading, which is why it needs authority to leave.'),
    ('capability-advertisement', 'commercial_terms',
     'terms_ref, constraints and availability are commercial capacity economics. Above the '
     'shipment_execution ceiling, so no shipment-execution grant reaches it.'),
    ('consent-grant', 'never_external',
     'This contract IS the disclosure authorization graph. Disclosing it is a meta-disclosure: it '
     'reveals who authorized what to whom, which is precisely the policy N5-A keeps grantor-side.'),
    ('command-envelope', 'never_external',
     'approval_refs and policy_decision_ref are authority material. Disclosing an authority '
     'reference externally invites its reuse as authority.'),
    ('evidence-envelope', 'never_external',
     'storage_ref is a pointer into evidence storage. It also carries a producer-supplied '
     'classification property, which N5-B ignores entirely — sensitivity here is governed, never '
     'self-declared by the event producer.'),
    ('event-envelope', 'never_external',
     'A container, not content. What may leave is a projection of the INNER contract under its own '
     'assignment; disclosing "the envelope" as a unit would route around the inner ceiling.')
  ) AS m(artifact_class, sensitivity_code, rationale) ON m.artifact_class = s.artifact_class;

-- ---------------------------------------------------------------------------
-- §3. Purpose ceilings.
--
-- Why purposes carry a ceiling at all rather than there being one global maximum: with a global
-- maximum, the SECOND purpose — whenever it arrives — silently inherits it. That is the identical
-- implicit-inheritance failure this migration refuses for schema versions, and refusing it in one
-- place while permitting it in the other would be incoherent.
--
-- A missing ceiling therefore denies. A purpose added by a later migration without a ceiling row is
-- caught by §6 here and by the integration completeness gate, and until it has one it discloses
-- nothing.
--
-- There is deliberately NO authority-basis ceiling table. Only `bilateral_grant` exists, and a
-- table anticipating statutory or regulatory bases that do not exist would be speculative. The
-- deferral is safe because of the direction of composition: the effective ceiling is a min() over
-- its terms, so adding a basis term later can only NARROW. Nothing decided today becomes wrong.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_purpose_ceilings (
  purpose_code         text PRIMARY KEY
    REFERENCES network_disclosure_purposes (code),
  max_sensitivity_code text NOT NULL
    REFERENCES network_disclosure_sensitivities (code),
  rationale            text NOT NULL CHECK (length(btrim(rationale)) > 0),
  assigned_at          timestamptz NOT NULL DEFAULT now(),
  assigned_by          text NOT NULL DEFAULT current_user
);

COMMENT ON TABLE network_disclosure_purpose_ceilings IS
  'The maximum sensitivity a disclosure purpose may ever reach. Exactly one immutable row per '
  'governed purpose. A purpose with no ceiling discloses nothing — absence denies, it does not '
  'default to the most permissive level.';

INSERT INTO network_disclosure_purpose_ceilings
  (purpose_code, max_sensitivity_code, rationale, assigned_by) VALUES
  ('shipment_execution', 'counterparty_identifying',
   'Executing or coordinating an agreed shipment requires operational state and knowing who is '
   'involved. It does not require rates, margins or capacity economics, so commercial_terms is '
   'above this ceiling and no shipment-execution grant can reach it.',
   'migration:0033');

-- ---------------------------------------------------------------------------
-- §4. Append-only guards.
--
-- The N3/N4/N5-A convention: row-level guards for UPDATE and DELETE, a STATEMENT-level guard for
-- TRUNCATE, because row triggers never fire for TRUNCATE and it would otherwise be an unguarded
-- hole straight through the immutability guarantee.
--
-- Applied to all three, reference tables included — migration-authored data that runtime can
-- rewrite is not reference data. There is no column-scoped exception and no supersession
-- exception, because there is no supersession.
-- ---------------------------------------------------------------------------

CREATE TRIGGER network_disclosure_sensitivities_no_update
  BEFORE UPDATE ON network_disclosure_sensitivities
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_sensitivities_no_delete
  BEFORE DELETE ON network_disclosure_sensitivities
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_sensitivities_no_truncate
  BEFORE TRUNCATE ON network_disclosure_sensitivities
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_schema_disclosure_sensitivity_no_update
  BEFORE UPDATE ON network_schema_disclosure_sensitivity
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_schema_disclosure_sensitivity_no_delete
  BEFORE DELETE ON network_schema_disclosure_sensitivity
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_schema_disclosure_sensitivity_no_truncate
  BEFORE TRUNCATE ON network_schema_disclosure_sensitivity
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_purpose_ceilings_no_update
  BEFORE UPDATE ON network_disclosure_purpose_ceilings
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_purpose_ceilings_no_delete
  BEFORE DELETE ON network_disclosure_purpose_ceilings
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_purpose_ceilings_no_truncate
  BEFORE TRUNCATE ON network_disclosure_purpose_ceilings
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

-- ---------------------------------------------------------------------------
-- §5. Row-level security and privileges.
--
-- ENABLE and FORCE on all three, so the table owner is subject to policy too.
--
-- SELECT policies only. No INSERT, UPDATE or DELETE policy exists for any role, which is what keeps
-- migration-authored data migration-authored: the evaluator reads these tables and nothing writes
-- them. Governed vocabulary is not tenant data — a tenant learns nothing about another tenant from
-- a sensitivity level — so the read predicate is unconditional, exactly as it is for `permissions`,
-- `network_schema_versions` and the N5-A reference tables.
--
-- `freightos_control_plane` is revoked outright. Administrative database capability is not network
-- disclosure authority, and the control plane has no reason to read a disclosure ceiling.
-- ---------------------------------------------------------------------------

ALTER TABLE network_disclosure_sensitivities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_sensitivities        FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_schema_disclosure_sensitivity   ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_schema_disclosure_sensitivity   FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_purpose_ceilings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_purpose_ceilings     FORCE  ROW LEVEL SECURITY;

CREATE POLICY network_disclosure_sensitivities_read ON network_disclosure_sensitivities
  FOR SELECT USING (true);
CREATE POLICY network_schema_disclosure_sensitivity_read ON network_schema_disclosure_sensitivity
  FOR SELECT USING (true);
CREATE POLICY network_disclosure_purpose_ceilings_read ON network_disclosure_purpose_ceilings
  FOR SELECT USING (true);

GRANT SELECT ON network_disclosure_sensitivities      TO freightos_app;
GRANT SELECT ON network_schema_disclosure_sensitivity TO freightos_app;
GRANT SELECT ON network_disclosure_purpose_ceilings   TO freightos_app;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_sensitivities      FROM freightos_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_schema_disclosure_sensitivity FROM freightos_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_purpose_ceilings   FROM freightos_app;

REVOKE ALL PRIVILEGES ON network_disclosure_sensitivities      FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_schema_disclosure_sensitivity FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_purpose_ceilings   FROM freightos_control_plane;

REVOKE ALL PRIVILEGES ON network_disclosure_sensitivities      FROM freightos_event_writer;
REVOKE ALL PRIVILEGES ON network_schema_disclosure_sensitivity FROM freightos_event_writer;
REVOKE ALL PRIVILEGES ON network_disclosure_purpose_ceilings   FROM freightos_event_writer;

-- ---------------------------------------------------------------------------
-- §6. Self-assertions.
--
-- The migration proves its own resulting catalog state, by exact name and by relational
-- completeness. Counts alone are not assertions: three tables with the wrong columns is still
-- three tables, and "nine assignments" is still nine if two of them name the same contract twice
-- and another has none.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_text text;
  v_int  integer;
BEGIN
  -- (a) Exactly the three N5-B tables, by name.
  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN ('network_disclosure_sensitivities',
                       'network_schema_disclosure_sensitivity',
                       'network_disclosure_purpose_ceilings');
  IF v_text IS DISTINCT FROM
     'network_disclosure_purpose_ceilings,network_disclosure_sensitivities,'
     'network_schema_disclosure_sensitivity' THEN
    RAISE EXCEPTION '0033: expected exactly the three N5-B tables, found: %', coalesce(v_text, '(none)');
  END IF;

  -- (b) The assignment table's exact column set, in order. This is what stops an assignment_id, a
  -- superseded_by, an effective_from or a runtime status column appearing later without review.
  SELECT string_agg(attname, ',' ORDER BY attnum) INTO v_text
    FROM pg_attribute
   WHERE attrelid = 'public.network_schema_disclosure_sensitivity'::regclass
     AND attnum > 0 AND NOT attisdropped;
  IF v_text IS DISTINCT FROM
     'durable_schema_ref,sensitivity_code,rationale,assigned_at,assigned_by' THEN
    RAISE EXCEPTION '0033: network_schema_disclosure_sensitivity column set is wrong: %', v_text;
  END IF;

  -- (c) Identity is the exact durable schema ref. This is the version-isolation invariant: a new
  -- contract version is a different key with no row, so it cannot inherit anything.
  SELECT pg_get_constraintdef(oid) INTO v_text
    FROM pg_constraint
   WHERE conrelid = 'public.network_schema_disclosure_sensitivity'::regclass AND contype = 'p';
  IF v_text IS DISTINCT FROM 'PRIMARY KEY (durable_schema_ref)' THEN
    RAISE EXCEPTION '0033: assignment primary key must be (durable_schema_ref), found %',
      coalesce(v_text, '(none)');
  END IF;

  -- (d) The vocabulary, exactly four codes in exactly this rank order.
  SELECT string_agg(code || '=' || rank || '/' || externally_disclosable, ',' ORDER BY rank)
    INTO v_text FROM network_disclosure_sensitivities;
  IF v_text IS DISTINCT FROM
     'execution_operational=10/true,counterparty_identifying=20/true,'
     'commercial_terms=30/true,never_external=99/false' THEN
    RAISE EXCEPTION '0033: sensitivity vocabulary is wrong: %', coalesce(v_text, '(none)');
  END IF;

  -- (e) The order is total: four distinct ranks, all positive.
  SELECT count(DISTINCT rank) INTO v_int FROM network_disclosure_sensitivities;
  IF v_int <> 4 THEN
    RAISE EXCEPTION '0033: sensitivity ranks are not distinct, found % distinct of 4', v_int;
  END IF;

  -- (f) Exactly one non-disclosable level, and it is `never_external`.
  SELECT string_agg(code, ',' ORDER BY code) INTO v_text
    FROM network_disclosure_sensitivities WHERE NOT externally_disclosable;
  IF v_text IS DISTINCT FROM 'never_external' THEN
    RAISE EXCEPTION '0033: expected never_external to be the only non-disclosable level, found: %',
      coalesce(v_text, '(none)');
  END IF;

  -- (g) SCHEMA COMPLETENESS, relationally. Every registered durable schema has an assignment.
  -- Not a count: a count of nine is still nine when one contract is assigned twice and another
  -- not at all, and the primary key already makes the duplicate half impossible.
  SELECT string_agg(s.durable_schema_ref, ', ' ORDER BY s.durable_schema_ref) INTO v_text
    FROM network_schema_versions s
    LEFT JOIN network_schema_disclosure_sensitivity a
           ON a.durable_schema_ref = s.durable_schema_ref
   WHERE a.durable_schema_ref IS NULL;
  IF v_text IS NOT NULL THEN
    RAISE EXCEPTION
      '0033: registered durable schema has no N5-B sensitivity assignment, so it would be '
      'undisclosable by omission rather than by decision: %', v_text;
  END IF;

  -- (h) And nothing assigned that is not registered. The foreign key already guarantees this; the
  -- assertion states the invariant so a future migration that drops the key is caught here.
  SELECT count(*) INTO v_int
    FROM network_schema_disclosure_sensitivity a
    LEFT JOIN network_schema_versions s ON s.durable_schema_ref = a.durable_schema_ref
   WHERE s.durable_schema_ref IS NULL;
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0033: % assignment(s) name an unregistered durable schema', v_int;
  END IF;

  -- (i) PURPOSE COMPLETENESS, relationally. Every governed purpose has exactly one ceiling.
  SELECT string_agg(p.code, ', ' ORDER BY p.code) INTO v_text
    FROM network_disclosure_purposes p
    LEFT JOIN network_disclosure_purpose_ceilings c ON c.purpose_code = p.code
   WHERE c.purpose_code IS NULL;
  IF v_text IS NOT NULL THEN
    RAISE EXCEPTION
      '0033: disclosure purpose has no N5-B ceiling, and a purpose without a ceiling discloses '
      'nothing rather than everything: %', v_text;
  END IF;

  -- (j) The frozen workflow-state ruling. Its projection includes /participants, so the contract
  -- is counterparty_identifying and NOT execution_operational. Asserted by name because it is the
  -- one assignment whose correctness is not obvious from the contract name alone.
  SELECT a.sensitivity_code INTO v_text
    FROM network_schema_disclosure_sensitivity a
    JOIN network_schema_versions s ON s.durable_schema_ref = a.durable_schema_ref
   WHERE s.artifact_class = 'workflow-state';
  IF v_text IS DISTINCT FROM 'counterparty_identifying' THEN
    RAISE EXCEPTION '0033: workflow-state must be counterparty_identifying, found %',
      coalesce(v_text, '(none)');
  END IF;

  -- (k) The frozen shipment_execution ceiling.
  SELECT max_sensitivity_code INTO v_text
    FROM network_disclosure_purpose_ceilings WHERE purpose_code = 'shipment_execution';
  IF v_text IS DISTINCT FROM 'counterparty_identifying' THEN
    RAISE EXCEPTION '0033: shipment_execution ceiling must be counterparty_identifying, found %',
      coalesce(v_text, '(none)');
  END IF;

  -- (l) The four never_external contracts, by name. Under a contract-level model this is the set
  -- that no grant can ever reach, so it is pinned rather than left to the rationale text.
  SELECT string_agg(s.artifact_class, ',' ORDER BY s.artifact_class) INTO v_text
    FROM network_schema_disclosure_sensitivity a
    JOIN network_schema_versions s ON s.durable_schema_ref = a.durable_schema_ref
   WHERE a.sensitivity_code = 'never_external';
  IF v_text IS DISTINCT FROM
     'command-envelope,consent-grant,event-envelope,evidence-envelope' THEN
    RAISE EXCEPTION '0033: never_external contract set is wrong: %', coalesce(v_text, '(none)');
  END IF;

  -- (m) RLS enabled AND forced on all three.
  SELECT count(*) INTO v_int
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('network_disclosure_sensitivities',
                       'network_schema_disclosure_sensitivity',
                       'network_disclosure_purpose_ceilings')
     AND c.relrowsecurity AND c.relforcerowsecurity;
  IF v_int <> 3 THEN
    RAISE EXCEPTION '0033: expected 3 N5-B tables with RLS enabled and forced, found %', v_int;
  END IF;

  -- (n) Exactly three policies, all SELECT. No write policy exists anywhere in N5-B.
  SELECT string_agg(p.polname || ':' || p.polcmd::text, ',' ORDER BY p.polname) INTO v_text
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('network_disclosure_sensitivities',
                       'network_schema_disclosure_sensitivity',
                       'network_disclosure_purpose_ceilings');
  IF v_text IS DISTINCT FROM
     'network_disclosure_purpose_ceilings_read:r,network_disclosure_sensitivities_read:r,'
     'network_schema_disclosure_sensitivity_read:r' THEN
    RAISE EXCEPTION '0033: N5-B policy inventory is wrong: %', coalesce(v_text, '(none)');
  END IF;

  -- (o) Nine immutability triggers, three per table.
  SELECT count(*) INTO v_int
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND p.proname = 'reject_mutation'
     AND c.relname IN ('network_disclosure_sensitivities',
                       'network_schema_disclosure_sensitivity',
                       'network_disclosure_purpose_ceilings');
  IF v_int <> 9 THEN
    RAISE EXCEPTION '0033: expected 9 N5-B immutability triggers, found %', v_int;
  END IF;

  -- (p) The runtime reader holds SELECT and nothing else on all three.
  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_text
    FROM information_schema.role_table_grants
   WHERE grantee = 'freightos_app'
     AND table_name IN ('network_disclosure_sensitivities',
                        'network_schema_disclosure_sensitivity',
                        'network_disclosure_purpose_ceilings');
  IF v_text IS DISTINCT FROM 'SELECT' THEN
    RAISE EXCEPTION '0033: freightos_app must hold SELECT alone on the N5-B tables, holds: %',
      coalesce(v_text, '(none)');
  END IF;

  -- (q) And no other role holds anything on them. Disclosure ceilings are read by the evaluator
  -- and by nothing else; the control plane in particular is not a disclosure authority.
  SELECT string_agg(DISTINCT grantee, ',' ORDER BY grantee) INTO v_text
    FROM information_schema.role_table_grants
   WHERE table_name IN ('network_disclosure_sensitivities',
                        'network_schema_disclosure_sensitivity',
                        'network_disclosure_purpose_ceilings')
     AND grantee <> 'freightos_app';
  IF v_text IS DISTINCT FROM pg_get_userbyid(
       (SELECT relowner FROM pg_class WHERE oid = 'public.network_disclosure_sensitivities'::regclass)) THEN
    RAISE EXCEPTION '0033: unexpected grantee on the N5-B tables: %', coalesce(v_text, '(none)');
  END IF;

  -- (r) N5-B adds no function at all, so it adds no SECURITY DEFINER.
  SELECT count(*) INTO v_int
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('app', 'admin', 'authn')
     AND (p.proname LIKE '%disclosure_sensitivit%' OR p.proname LIKE '%purpose_ceiling%');
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0033: N5-B must add no database function, found %', v_int;
  END IF;

  -- (s) The N5-A surface is untouched: still six tables, still one purpose, one basis, one
  -- projection. N5-B composes with N5-A; it does not edit it.
  SELECT count(*) INTO v_int
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname LIKE 'network\_disclosure\_%'
     AND c.relname NOT IN ('network_disclosure_sensitivities', 'network_disclosure_purpose_ceilings');
  IF v_int <> 6 THEN
    RAISE EXCEPTION '0033: expected the six N5-A tables to be untouched, found %', v_int;
  END IF;

  -- (t) Zero unqualified authority reads. N5-B adds three RLS-enabled relations, which extends the
  -- catalog-derived protected set 0027 guards.
  SELECT count(*) INTO v_int FROM app.unqualified_authority_reads();
  IF v_int <> 0 THEN
    SELECT string_agg(format('%s→%s', signature, relation), ', ') INTO v_text
      FROM app.unqualified_authority_reads();
    RAISE EXCEPTION '0033: unqualified authority reads introduced: %', v_text;
  END IF;

  RAISE NOTICE '0033: N5-B disclosure sensitivity ceiling installed and asserted';
END
$$;
