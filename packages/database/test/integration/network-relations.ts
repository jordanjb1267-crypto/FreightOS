/**
 * The network relation inventory, declared by LAYER rather than discovered by name.
 *
 * WHY THIS FILE EXISTS. Several security gates used to establish "the disclosure relations" with
 * `relname LIKE 'network\_disclosure\_%'`, and one of them established "N5-A" as that pattern
 * MINUS the N5-B three. That works only for as long as the naming family and the governed set
 * happen to coincide. When 0034 shipped, five of its seven tables matched `network_disclosure_%`
 * by name alone, and the pattern silently re-scoped every assertion built on it: a gate that had
 * meant "N5-A's six" began to mean "N5-A's six plus whatever N6 added". A NAMING convention had
 * become a SECURITY authority, and nothing announced the change.
 *
 * The repair is not an exclusion — `NOT LIKE '%delivery%'` would teach the gates to ignore exactly
 * the relations they should be governing, and would re-arm the same trap for N7. The repair is to
 * say which relations belong to which layer, once, here.
 *
 * HOW TO USE THESE SETS. A prefix scan is still the right way to DISCOVER what is in the database
 * — it is what notices a table nobody declared. It is the wrong way to decide what that table is.
 * So: discover by catalog, judge against these lists. `network-disclosure-relation-inventory`
 * holds the gate that fails when the two disagree.
 *
 * ADDING A RELATION. Put it in its layer's list by hand. There is deliberately no rule that infers
 * membership from the name, because inferring membership from the name is the defect.
 */

/** N1 — participant identity. Who exists, and by what name. */
export const N1_PARTICIPANT_RELATIONS = [
  'network_alias_namespaces',
  'network_participant_aliases',
  'network_participant_relationships',
  'network_participants',
  'network_relationship_types',
] as const;

/** N2 — durable contract identity. Which schema version an artifact is pinned to. */
export const N2_SCHEMA_RELATIONS = ['network_schema_versions'] as const;

/** N3 — the canonical immutable journal. What happened. */
export const N3_JOURNAL_RELATIONS = ['network_events'] as const;

/** N4 — transport obligation. That a debt is owed. Two columns, and deliberately nothing else. */
export const N4_TRANSPORT_RELATIONS = ['network_transport_intents'] as const;

/** N5-A — recipient, purpose and field authorization. Who may be told what, and why. */
export const N5A_DISCLOSURE_RELATIONS = [
  'network_disclosure_authority_bases',
  'network_disclosure_grant_revocations',
  'network_disclosure_grants',
  'network_disclosure_projection_fields',
  'network_disclosure_projections',
  'network_disclosure_purposes',
] as const;

/** N5-B — the content-sensitivity ceiling. How sensitive the content is, whatever the grant says. */
export const N5B_SENSITIVITY_RELATIONS = [
  'network_disclosure_purpose_ceilings',
  'network_disclosure_sensitivities',
  'network_schema_disclosure_sensitivity',
] as const;

/** N6 — authorized disclosure delivery. That an authorized disclosure was attempted, and how it went. */
export const N6_DELIVERY_RELATIONS = [
  'network_delivery_attempts',
  'network_disclosure_artifacts',
  'network_disclosure_deliveries',
  'network_disclosure_inbox',
  'network_disclosure_routing_resolutions',
  'network_disclosure_subscription_revocations',
  'network_disclosure_subscriptions',
] as const;

/**
 * N7-A — external transport foundation. WHERE an already-authorized artifact may be sent, that it
 * is owed, that the authorization side permitted one attempt, and how that attempt went.
 *
 * N7-A implements no external transport. These relations are the control plane for a capability
 * that does not exist yet, which is deliberate: the boundary is reviewable before anything can
 * cross it.
 */
export const N7_TRANSPORT_RELATIONS = [
  'network_external_transport_attempts',
  'network_external_transport_permits',
  'network_external_transports',
  'network_transport_destination_revocations',
  'network_transport_destinations',
] as const;

/** Every relation in the `network_*` family, by declaration. Sorted to match `ORDER BY relname`. */
export const ALL_NETWORK_RELATIONS: readonly string[] = [
  ...N1_PARTICIPANT_RELATIONS,
  ...N2_SCHEMA_RELATIONS,
  ...N3_JOURNAL_RELATIONS,
  ...N4_TRANSPORT_RELATIONS,
  ...N5A_DISCLOSURE_RELATIONS,
  ...N5B_SENSITIVITY_RELATIONS,
  ...N6_DELIVERY_RELATIONS,
  ...N7_TRANSPORT_RELATIONS,
].sort();

/**
 * The layer each relation belongs to, for tests that need to explain an inventory line rather than
 * merely assert it.
 */
export const NETWORK_RELATION_LAYER: ReadonlyMap<string, string> = new Map([
  ...N1_PARTICIPANT_RELATIONS.map((r) => [r, 'N1'] as const),
  ...N2_SCHEMA_RELATIONS.map((r) => [r, 'N2'] as const),
  ...N3_JOURNAL_RELATIONS.map((r) => [r, 'N3'] as const),
  ...N4_TRANSPORT_RELATIONS.map((r) => [r, 'N4'] as const),
  ...N5A_DISCLOSURE_RELATIONS.map((r) => [r, 'N5-A'] as const),
  ...N5B_SENSITIVITY_RELATIONS.map((r) => [r, 'N5-B'] as const),
  ...N6_DELIVERY_RELATIONS.map((r) => [r, 'N6'] as const),
  ...N7_TRANSPORT_RELATIONS.map((r) => [r, 'N7'] as const),
]);

/** Every relation whose name lands in the disclosure/delivery family, whatever layer owns it. */
export const DISCLOSURE_FAMILY_RELATIONS: readonly string[] = [
  ...N5A_DISCLOSURE_RELATIONS,
  ...N5B_SENSITIVITY_RELATIONS,
  ...N6_DELIVERY_RELATIONS,
].sort();
