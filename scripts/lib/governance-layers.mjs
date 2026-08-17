/**
 * The governance-layer registry, read once and shared — AWE-0.
 *
 * `governance-layers.json` is read by two gates that ask different questions of it:
 *
 *   check-network-governance.mjs      does every declared layer still match its manifest?
 *   check-architecture-governance.mjs is every accepted architecture package BOUND to the
 *                                     repository's ADR, module-state and Horizon authority?
 *
 * Both need the same loader, the same manifest parsers and the same anchored expectations. Two
 * gates each carrying their own copy of "how a layer is declared" is the duplicated-identity defect
 * `check-egress-allowlist.mjs` documents at its head: both lists individually valid, nothing forcing
 * them to agree, and the drift invisible until one of them is the only thing still looking. Only the
 * POLICY differs.
 *
 * WHY SO MUCH LIVES HERE RATHER THAN IN THE REGISTRY. An independent review of the first AWE-0
 * candidate broke it by editing the registry: a security layer demoted itself out of the
 * anti-inversion rule, an unresolved-authority inventory deleted itself, a seventh package declared
 * itself out of the binding obligation. A validator whose expectations live entirely inside the
 * document it is validating can always be satisfied by editing that document. The constants below
 * are the anchor, and they follow the precedent already set by `scripts/validate-scope.mjs`, whose
 * `MODULE_EXPECTATIONS` hard-codes the module states CI must still see — for exactly this reason.
 *
 * Two manifest formats exist in this repository and both are load-bearing:
 *
 *   sha256sums    `<64 hex><two spaces><path>` — v1.2, v1.3.0, v1.4.0, v1.8.1
 *   manifest-json `{"files":[{"path","sha256","bytes"}]}` — v1.5.0, FacilityOS, v1.6.0, v1.7.0,
 *                 v1.8.0
 *
 * The second format is why the five packages installed after v1.4.0 went unverified for so long:
 * the original validator parsed only the first and silently had nothing to say about the rest.
 * Format is DECLARED per layer rather than inferred from the filename, so a package that renames
 * its manifest cannot quietly change which parser reads it.
 *
 * No network access. Pure reads.
 */

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, posix as pathPosix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export const REPO_ROOT =
  process.env.GOVERNANCE_REPO_ROOT ?? fileURLToPath(new URL('../..', import.meta.url));
export const LAYERS_FILE = join(REPO_ROOT, 'governance-layers.json');
export const PROVENANCE_FILE = join(REPO_ROOT, 'handoff-provenance.json');
export const HANDOFF_TREE = join(REPO_ROOT, 'docs', 'production-handoff');
export const WORKFLOW_FILE = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');

export const MANIFEST_FORMATS = Object.freeze(['sha256sums', 'manifest-json']);
export const LAYER_ROLES = Object.freeze(['base', 'controlling', 'additive-subordinate']);
export const ANCHORED_CI_REQUIRED_GATES = Object.freeze([
  'scripts/check-network-governance.mjs',
  'scripts/check-architecture-governance.mjs',
  'scripts/check-ccep-governance.mjs',
  'scripts/validate-scope.mjs',
]);

export const CCEP_CONTROL_SURFACE = Object.freeze([
  Object.freeze({
    path: 'scripts/check-ccep-governance.mjs',
    sha256: '835fdd4da5c3a50ce1571f8d856947b39f35edc4469819e4f15e48cfe78bae6c',
  }),
  Object.freeze({
    path: 'scripts/lib/ccep-policy.mjs',
    sha256: '370a50b768493b6b04b775fb05d38eed81bda7b65cce3485820a1d415c111cb9',
  }),
  Object.freeze({
    path: 'docs/governance/ccep-policy.json',
    sha256: '3463dad6f1df7c4e49a2da54ade75d6312185d6dd6411072073ae6457b499f92',
  }),
  Object.freeze({
    path: 'scripts/test/ccep-governance.test.ts',
    sha256: '2b35d1761406e0bf6949903d6bc029b231a522ba6eaf657c6d1df83d676c948e',
  }),
]);

export const REQUIRED_SUBORDINATION =
  'Network architecture is ADDITIVE and SUBORDINATE to the production handoff and to the security, privacy, tenant-isolation, authority, resilience and non-regression requirements that precede it. Where a network requirement and a security requirement conflict, the stricter restriction wins and the network requirement yields. No layer below may be weakened to simplify a layer above.';

export const AUTHORITY_MODEL_CONTRACT = Object.freeze({
  classes: LAYER_ROLES,
  precedenceEdges: Object.freeze([
    Object.freeze({ higher: 'controlling', lower: 'additive-subordinate' }),
    Object.freeze({ higher: 'base', lower: 'additive-subordinate' }),
  ]),
  incomparable: Object.freeze([Object.freeze(['additive-subordinate', 'additive-subordinate'])]),
  strictestWinsSubjects: Object.freeze([
    'security',
    'tenant-isolation',
    'authority',
    'privacy',
    'legal',
    'resilience',
    'certification',
  ]),
  conflictDisposition: 'record-in-unresolvedAuthority',
  classAnchor: 'root-path',
  resolution: Object.freeze([
    'A controlling requirement beats any additive-subordinate requirement.',
    'A base requirement beats any additive-subordinate requirement.',
    'Two additive-subordinate packages are INCOMPARABLE. Being installed later confers nothing. Where two of them overlap on a module and genuinely disagree, that is a conflict to record in unresolvedAuthority, not a tie to break by version order.',
    'Regardless of class, the stricter accepted restriction wins. Security, tenant-isolation, authority, privacy, legal, resilience and certification constraints fail closed.',
    "Class is anchored to the layer's root path in scripts/lib/governance-layers.mjs and cannot be changed by editing this file. A layer cannot demote its own authority out of the rules that bind it.",
  ]),
});

/**
 * ANCHORED ROLES — the fix for "a controlling security layer can demote itself".
 *
 * The first candidate computed its anti-inversion rule from the same mutable `role` field it was
 * validating: it collected the layers calling themselves base/controlling and required the rest to
 * rank below them. Changing v1.3.0's role from `controlling` to `additive-subordinate` therefore
 * removed v1.3.0 from the set that constrained everything else, and the gate passed.
 *
 * These three roles are properties of the repository, not declarations of the registry. Keyed by
 * ROOT PATH rather than by layer id, because id is itself a registry field and would move the same
 * hole one level down. The registry must AGREE with this table; it does not get to define it.
 *
 * Every other layer is `additive-subordinate` by construction — there is nothing to enumerate, so
 * adding a package cannot require editing this table.
 */
export const ANCHORED_LAYER_ROLES = Object.freeze({
  'docs/production-handoff/v1.2': 'base',
  'docs/production-handoff/v1.3.0-security-resilience': 'controlling',
  'docs/production-handoff/v1.4.0-network-architecture': 'additive-subordinate',
});

/**
 * How a layer may be exempt from carrying an architecture binding.
 *
 * The first candidate enumerated the six governed packages by id and declared
 * `expectedGovernedPackages: 6`. A seventh package could then be registered with no binding and
 * both gates passed. The obligation has to derive from position, and the exemption has to be EARNED
 * and PROVABLE — not carried in a list that has to be edited every time the truth changes.
 *
 * A layer under `docs/production-handoff/` must carry `architecture` unless it claims one of these
 * anchors, each of which the validator verifies against repository facts rather than accepting on
 * the registry's word:
 *
 *   base-provenance           handoff-provenance.json's handoffSource IS this layer's root.
 *                             True only for v1.2, and it is what `sha256sum -c SHA256SUMS.txt`
 *                             plus check-handoff-provenance.mjs already anchor in CI.
 *   controlling-security      ANCHORED_LAYER_ROLES gives this root the `controlling` role. True
 *                             only for v1.3.0, and it cannot be claimed by editing the registry.
 *   accepted-network-decision At least one ACCEPTED record in docs/decisions/ cites this layer's
 *                             root path. True only for v1.4.0 (ADR-N0014); measured across all
 *                             nine layers, every other root scores zero.
 *
 * A new package can satisfy none of these, so it must be bound. That is the point.
 */
export const EXEMPTION_ANCHORS = Object.freeze([
  'base-provenance',
  'controlling-security',
  'accepted-network-decision',
]);

/**
 * The unresolved-authority inventory — the fix for "deleting all twelve entries leaves both gates
 * green".
 *
 * `unresolvedAuthority` is the mechanism that keeps an architecture claim with no accepted ADR
 * behind it VISIBLE. A mechanism whose whole job is preserving a record has to be protected against
 * the record being quietly emptied, and it cannot protect itself from inside the file it lives in.
 *
 * The rule the validator enforces:
 *
 *   declared ⊇ (KNOWN − RESOLVED)
 *
 * Recording MORE openness is always safe, so extra entries pass. Removing a known item fails unless
 * it has been moved into RESOLVED_AUTHORITY with a citation — a deliberate two-file change that a
 * reviewer sees, which is the "explicit change control" half of the requirement.
 *
 * Package roots are the stable join key. Layer ids are registry metadata; rereview proved that
 * renaming one could otherwise erase a known-open item after reaccepting the binding digest.
 */
export const KNOWN_UNRESOLVED_AUTHORITY_BY_ROOT = Object.freeze({
  'docs/production-handoff/v1.5.0-enterprise-agent-operations': Object.freeze([
    'action-command-vocabulary',
  ]),
  'docs/production-handoff/facilityos-v1.0.0-enterprise-agent-operations': Object.freeze([
    'action-command-vocabulary',
  ]),
  'docs/production-handoff/v1.6.0-brokerage-enterprise-agent-operations': Object.freeze([
    'action-command-vocabulary',
  ]),
  'docs/production-handoff/v1.7.0-agentic-logistics-network-coherence': Object.freeze([
    'artifact-vocabulary',
    'action-command-vocabulary',
  ]),
  'docs/production-handoff/v1.8.0-agent-workforce-engineering-certification': Object.freeze([
    'workforce-roster-of-record',
    'job-certification-approving-authority',
    'artifact-vocabulary',
  ]),
  'docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture': Object.freeze([
    'workunit-graph-agent-runtime-substrate',
    'first-governed-egress-channel',
    'commercial-activation-flags',
    'provisional-job-books-and-graphs',
  ]),
});

/**
 * Unresolved items that a later governed act has genuinely closed.
 *
 * Empty today: AWE-0 resolves none of them. An entry here must name the authority that resolved the
 * item, and the validator requires that authority to exist and be Accepted — resolution is a
 * governed act, not a deletion.
 *
 * Shape: `'<packageRoot>:<itemId>': { resolvedBy: '<authority id>', note: '<what closed it>' }`
 */
export const RESOLVED_AUTHORITY = Object.freeze({});

/**
 * How an accepted package relates to accepted authority.
 *
 * `unresolved` is deliberately NOT a member. An architecture claim with no accepted authority behind
 * it is recorded in a separate `unresolvedAuthority` array that cannot name an authority at all, so
 * a gap cannot be dressed up as a relation and become authoritative by being registered.
 */
export const AUTHORITY_RELATIONS = Object.freeze([
  'governed-by', // the record rules the matter; where they differ the record wins
  'constrained-by', // the record bounds the package without deciding its content
  'additive-beneath', // the package adds detail under the record and does not touch its decision
]);

/**
 * Authority namespaces — the fix for the ADR identifier collision.
 *
 * `adr/NNNN-*.md` and `docs/decisions/NNNN-*.md` reuse all eighteen numbers 0001..0018. Keying the
 * index on a bare four-digit number meant a reference intended for a PROPOSED network decision
 * resolved silently to a DIFFERENT Accepted ADR — `ADR-0018` is the autonomy ceiling in one
 * namespace and the N7 external transport boundary in the other.
 *
 * The repository already disambiguates them and AWE-0 simply failed to use it: every record under
 * docs/decisions/ declares its own `**ADR ID:** N00NN` and is cited across the corpus as
 * `ADR-N0007`, `ADR-N0012`, `ADR-N0018` — 203 occurrences of ADR-N0007 alone. So the canonical form
 * is the repository's own, not an invention:
 *
 *   source `adr`              ids `ADR-NNNN`   from adr/NNNN-*.md
 *   source `network-decision` ids `ADR-NNNNN`  from docs/decisions/NNNN-*.md, N-prefixed
 *
 * A relation must declare BOTH the id and its source, and the two must agree with each other and
 * with where the id actually resolves. An unqualified reference is refused rather than guessed.
 */
export const AUTHORITY_SOURCES = Object.freeze({
  adr: Object.freeze({
    dir: 'adr',
    idPattern: /^ADR-\d{4}$/,
    label: 'accepted repository ADR',
  }),
  'network-decision': Object.freeze({
    dir: 'docs/decisions',
    idPattern: /^ADR-N\d{4}$/,
    label: 'accepted network decision record',
  }),
});

/**
 * Is this layer a governed architecture package — derived, never enumerated.
 *
 * The first candidate held a frozen list of six ids plus `expectedGovernedPackages: 6`. A seventh
 * package could then be registered with NO binding and both gates passed, while registering it
 * correctly additionally required editing that count — an obligation list wearing a completeness
 * check's clothes. Membership is a property of the layer:
 *
 *   additive-subordinate  +  a root under docs/production-handoff/  +  no exemption claim
 *
 * That is a structural description of exactly what AWE-0 binds — design shipped as an installed
 * handoff package, claiming no base or controlling authority of its own, whose authority must
 * therefore come from somewhere else. A package that arrives after AWE-0 acquires the obligation by
 * existing, and no edit to this file avoids it. `role` is itself anchored by ANCHORED_LAYER_ROLES,
 * so a package cannot escape the class by calling itself controlling either.
 *
 * The exemption is only a CLAIM here; check-architecture-governance.mjs proves or rejects it.
 */
export function isGovernedArchitectureLayer(layer) {
  return (
    layer?.role === 'additive-subordinate' &&
    typeof layer.root === 'string' &&
    layer.root.startsWith('docs/production-handoff/') &&
    (layer.architectureExemption === undefined || layer.architectureExemption === null)
  );
}

/**
 * REVIEWED BINDING DIGESTS — the deterministic half of "content cannot be validated".
 *
 * An independent review confirmed what no validator can fix by trying harder: removing
 * `digital_brokerage` from the brokerage package's scope, repointing ADR-0018 to ADR-0001 with
 * fabricated evidence, flipping governed-by to additive-beneath, setting maxHorizon to 99 and
 * replacing rationale with lorem ipsum all passed a gate that checked FORM. Semantic truth of an
 * evidence string is an architecture-review obligation, not a computable property.
 *
 * So the property made deterministic is a different and honest one: THE BINDING A REVIEWER ACCEPTED
 * IS THE BINDING STILL IN THE FILE. Any edit to a package's `architecture` block — scope, relation,
 * kind, evidence, Horizon — changes its digest and fails the gate until a reviewer re-accepts it
 * here. That is the shape handoff-provenance.json already uses for `overrides`, which pin an
 * authorised divergence by {adr, reason, sha256} rather than trying to prove it correct.
 *
 * To update: change the block, run the gate, and copy the digest it prints into this table in the
 * same reviewed change.
 */
export const REVIEWED_BINDING_DIGESTS = Object.freeze({
  'enterprise-agent-operations': 'fbcd630e17deb710fbcc8f70edd464409349bc33da8f0ecb96a3828e76254c57',
  'facilityos-enterprise-agent-operations':
    '9fd03f7659ff2bb0d68b3326cfcfab324c3c7882428497eb5b5b35abeb972401',
  'brokerage-enterprise-agent-operations':
    '871bc08ab3ff2dd99ff5b87c065efe8b61c0006b4821164ae1f55f375d6172b4',
  'agentic-logistics-network-coherence':
    'ab056781d26ba0891e192f32734076089ae6414265e90d5c013d30c821a2b865',
  'agent-workforce-engineering-certification':
    '720a66fcf05654e427d202049fd0b3e85977c99604926c610549354c72dd27fb',
  'revenueos-commercial-capability-architecture':
    '638d411956de9bc3ddc70dc66b5654934aac869961deaa3ef59df89a93976baa',
});

/** Key-sorted JSON, so a digest depends on the binding's content and not on its key order. */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonicalize(value[k])]),
    );
  }
  return value;
}

/** SHA-256 over a package's canonicalized `architecture` block. */
export function bindingDigest(architecture) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(architecture)))
    .digest('hex');
}

export function sha256(absolutePath) {
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
}

export function canonicalManifestPath(declaredPath) {
  if (typeof declaredPath !== 'string' || declaredPath.length === 0) {
    return { error: 'manifest path is empty' };
  }
  if (declaredPath.includes('\0')) {
    return { error: 'manifest path contains a NUL byte' };
  }
  if (declaredPath.includes('\\')) {
    return {
      error: `manifest path must use canonical POSIX separators, not backslashes: ${declaredPath}`,
    };
  }
  if (isAbsolute(declaredPath) || /^[A-Za-z]:[\\/]/.test(declaredPath)) {
    return { error: `manifest path is absolute: ${declaredPath}` };
  }

  const normalized = pathPosix.normalize(declaredPath);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized === ''
  ) {
    return { error: `manifest path escapes the package root: ${declaredPath}` };
  }
  if (normalized !== declaredPath) {
    return {
      error: `manifest path is not canonical: ${declaredPath} resolves as ${normalized}`,
    };
  }
  return { path: normalized };
}

/**
 * Commands a GitHub workflow actually RUNS, from the parsed document rather than its bytes.
 *
 * The first candidate asserted only that ci.yml CONTAINED a validator's filename. Every construct
 * that separates "the string appears" from "the command executes and its failure blocks the job"
 * walked through it: a YAML comment, `run: echo "node scripts/x.mjs"`, `run: true # node
 * scripts/x.mjs`, the string sitting in the step's own `name:`, `if: false`, and
 * `continue-on-error: true`.
 *
 * Returns `{ commands, steps, jobs, problems }`. A command is `{ job, argv }` where argv is the
 * whitespace-split, quote-stripped token list of ONE shell command — so `echo` and `true` are
 * visible as the command name and can be refused. Steps that are conditional or non-blocking are
 * deliberately NOT collected: a gate that might not run, or whose failure does not fail the job, is
 * not enforcement.
 *
 * This is a shell-shaped tokenizer, not a shell. It handles the forms this repository's workflow
 * uses — one command per line, `&&`/`||`/`;`/`|` separators, trailing comments, quoted arguments —
 * and it errs toward NOT counting an invocation, which fails the gate rather than passing it.
 */
export function workflowRunCommands(workflowText) {
  const problems = [];
  let doc;
  try {
    doc = parseYaml(workflowText);
  } catch (error) {
    return {
      commands: [],
      steps: 0,
      jobs: 0,
      problems: [`workflow is not valid YAML: ${error.message}`],
    };
  }
  if (!doc || typeof doc !== 'object') {
    return { commands: [], steps: 0, jobs: 0, problems: ['workflow parsed to no document'] };
  }

  // `on:` is a YAML 1.1 boolean; the `yaml` package's 1.2 core schema keeps it a string, but both
  // are checked so a parser change cannot silently drop the reachability test.
  const triggers = doc.on ?? doc[true];
  if (!triggers) {
    problems.push('workflow declares no `on:` triggers, so no step ever runs');
  } else {
    const names = Array.isArray(triggers)
      ? triggers
      : typeof triggers === 'string'
        ? [triggers]
        : Object.keys(triggers);
    if (!names.includes('pull_request') && !names.includes('push')) {
      problems.push(
        `workflow triggers are [${names.join(', ')}] — neither pull_request nor push, so these ` +
          `gates do not run on a change`,
      );
    }
    const triggerEntries =
      triggers && typeof triggers === 'object' && !Array.isArray(triggers)
        ? Object.entries(triggers)
        : [];
    for (const [triggerName, trigger] of triggerEntries) {
      if (!['pull_request', 'push'].includes(triggerName)) continue;
      if (!trigger || typeof trigger !== 'object') continue;
      if ('paths' in trigger || 'paths-ignore' in trigger) {
        problems.push(
          `workflow trigger "${triggerName}" declares path filters, so governed changes can make ` +
            `required governance gates unreachable`,
        );
      }
    }
  }

  const jobs = doc.jobs && typeof doc.jobs === 'object' ? doc.jobs : {};
  const commands = [];
  let steps = 0;
  let jobCount = 0;

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') continue;
    jobCount += 1;
    // A conditional or non-blocking JOB cannot be relied on to enforce anything.
    if (job.if !== undefined) {
      problems.push(
        `job "${jobName}" is conditional (\`if:\`); its steps are not counted as enforcement`,
      );
      continue;
    }
    if (job['continue-on-error'] !== undefined) {
      problems.push(`job "${jobName}" sets continue-on-error; its steps do not block`);
      continue;
    }
    if (!Array.isArray(job.steps)) continue;

    for (const step of job.steps) {
      if (!step || typeof step !== 'object' || typeof step.run !== 'string') continue;
      if (step.if !== undefined) {
        problems.push(
          `job "${jobName}" has a conditional run step; conditional steps are not enforcement`,
        );
        continue;
      }
      if (step['continue-on-error'] !== undefined) {
        problems.push(
          `job "${jobName}" has a run step with continue-on-error; its failure does not block`,
        );
        continue;
      }
      steps += 1;
      if (
        /(^|\n)\s*(if|for|while|case)\b/.test(step.run) ||
        /\w+\s*\(\)\s*\{/.test(step.run) ||
        /<</.test(step.run)
      ) {
        problems.push(
          `job "${jobName}" has a run step with shell control structure, function or heredoc; ` +
            `required governance gates must be direct blocking commands`,
        );
        continue;
      }

      for (const raw of step.run.split('\n')) {
        // Strip a trailing comment. `#` only starts one at the beginning of a token, so a `#` inside
        // a word or a URL fragment is left alone. This is what turns `true # node x` into `true`.
        const line = raw.replace(/(^|\s)#.*$/, '$1').trim();
        if (line.length === 0) continue;
        if (/&&|\|\||[;|]/.test(line)) {
          problems.push(
            `job "${jobName}" run command uses shell control operators; required governance gates ` +
              `must be direct blocking commands`,
          );
          continue;
        }
        const argv = line
          .trim()
          .split(/\s+/)
          .filter((t) => t.length > 0)
          .map((t) => t.replace(/^['"]|['"]$/g, ''));
        if (argv.length === 0) continue;
        commands.push({ job: jobName, argv });
      }
    }
  }

  return { commands, steps, jobs: jobCount, problems };
}

/**
 * Command names that consume their arguments as DATA rather than executing them.
 *
 * `echo "node scripts/check-architecture-governance.mjs"` prints the gate's name and runs nothing;
 * `true # node …` runs the no-op. Both satisfied the old substring test.
 */
export const NON_EXECUTING_COMMANDS = Object.freeze(
  new Set(['echo', 'true', 'false', ':', 'printf', 'cat', 'comment', '#']),
);

/** Does `argv` actually invoke `gate`, as an argument of a command that executes it? */
export function invokes(argv, gate) {
  if (argv.length === 0) return false;
  if (NON_EXECUTING_COMMANDS.has(argv[0])) return false;
  return argv[0] === 'node' && argv.length === 2 && argv[1] === gate;
}

/**
 * Every file under `dir`, repo-relative to it, POSIX-separated, sorted.
 *
 * `lstat`, never `stat`. Following a symlinked directory made the walk unbounded: a link pointing
 * at its own ancestor produced an ELOOP or a RangeError out of the recursion rather than a
 * governance failure, and a link pointing outside the package silently enrolled another tree's
 * files as if they were this package's. A symlink is reported to the caller as an entry so the
 * integrity check can refuse it explicitly, rather than being followed or skipped.
 */
export function walk(dir, base = dir, found = []) {
  for (const entry of readdirSync(dir).sort()) {
    const abs = join(dir, entry);
    const stats = lstatSync(abs);
    if (stats.isDirectory()) walk(abs, base, found);
    else found.push(relative(base, abs).split(sep).join('/'));
  }
  return found;
}

/**
 * Resolve a manifest-declared path against its package root, or explain why it cannot be.
 *
 * Returns `{ abs }` on success, `{ error }` otherwise. A manifest entry is a path chosen by the
 * package being verified, so it is untrusted input to the gate that verifies it. Before this check
 * existed, an entry reading
 *
 *   contracts/../../v1.4.0-network-architecture/MANIFEST.sha256
 *
 * resolved outside its own package, hashed correctly, PASSED, and incremented the verified-artifact
 * counter — so one package could satisfy its integrity using another package's files and make the
 * global anti-vacuity total look healthier while doing it. `walk()` never enumerates such a path,
 * so the unlisted-extra check has nothing to subtract and never notices.
 *
 * Four refusals, in order: absolute paths, traversal that escapes after normalisation, symlinks
 * anywhere on the resolved path, and anything that is not a regular file.
 */
export function resolveManifestEntry(rootAbs, declaredPath) {
  const canonical = canonicalManifestPath(declaredPath);
  if (canonical.error) return canonical;
  const normalized = canonical.path;

  const abs = resolve(rootAbs, normalized);
  const rel = relative(rootAbs, abs);
  if (rel.length === 0 || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return { error: `manifest path resolves outside the package root: ${declaredPath}` };
  }

  // Every segment between the root and the target must be a real directory, not a link. Checking
  // only the leaf would let `linkdir/file.md` reach outside while `lstat` on the leaf looked normal.
  let cursor = rootAbs;
  for (const segment of rel.split(sep)) {
    cursor = join(cursor, segment);
    let stats;
    try {
      stats = lstatSync(cursor);
    } catch {
      return { error: `manifest lists a file that is missing: ${declaredPath}` };
    }
    if (stats.isSymbolicLink()) {
      return {
        error: `manifest path traverses a symlink, which is not an allowed form: ${declaredPath}`,
      };
    }
  }

  if (!lstatSync(abs).isFile()) {
    return { error: `manifest path is not a regular file: ${declaredPath}` };
  }
  return { abs, path: normalized };
}

/**
 * Read and JSON-parse the registry.
 *
 * Returns `{ registry }` or `{ error }`. A missing or unparseable registry is fatal for every
 * caller, but each gate prints its own banner, so the decision to exit stays with the gate.
 */
export function loadRegistry() {
  if (!existsSync(LAYERS_FILE)) {
    return { error: 'governance-layers.json is missing. It declares the controlling layers.' };
  }
  try {
    return { registry: JSON.parse(readFileSync(LAYERS_FILE, 'utf8')) };
  } catch (error) {
    return { error: `governance-layers.json is not valid JSON: ${error.message}` };
  }
}

/**
 * Parse a `sha256sum` manifest into `path -> {sha256, bytes}`.
 *
 * The format is `<hex><two spaces><path>`, and the path may itself contain spaces, so the split is
 * on the first separator only rather than on whitespace generally. A line that does not parse is a
 * failure rather than something to skip: a manifest this check cannot read is a manifest it cannot
 * enforce, and silently ignoring the line would be the quiet pass this gate exists to prevent.
 */
export function parseSha256Sums(absolutePath, layerId, fail) {
  const entries = new Map();
  const lines = readFileSync(absolutePath, 'utf8').split('\n');
  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd();
    if (line.length === 0) continue;
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    if (!match) {
      fail(`${layerId}: unparseable manifest line ${index + 1}: ${JSON.stringify(line)}`);
      continue;
    }
    const canonical = canonicalManifestPath(match[2]);
    if (canonical.error) {
      fail(`${layerId}: ${canonical.error}`);
      continue;
    }
    const path = canonical.path;
    if (entries.has(path)) fail(`${layerId}: manifest lists ${path} more than once`);
    entries.set(path, { sha256: match[1], bytes: null });
  }
  return entries;
}

/**
 * Parse a JSON manifest into `path -> {sha256, bytes}`.
 *
 * `bytes` is carried because all five JSON manifests in this repository ship it and all five are
 * accurate. A size that disagrees with a matching hash is not possible by accident, so checking it
 * costs nothing and turns a hand-edited manifest entry into a second, independent failure.
 *
 * Unreadable JSON fails closed here rather than returning an empty map: an empty map would verify
 * nothing and, without the per-layer floor downstream, would read as a clean package.
 */
export function parseJsonManifest(absolutePath, layerId, fail) {
  const entries = new Map();
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    fail(`${layerId}: manifest is not valid JSON: ${error.message}`);
    return entries;
  }
  if (!Array.isArray(manifest.files)) {
    fail(`${layerId}: manifest has no "files" array`);
    return entries;
  }
  for (const [index, file] of manifest.files.entries()) {
    if (!file || typeof file.path !== 'string' || file.path.length === 0) {
      fail(`${layerId}: manifest entry ${index} has no "path"`);
      continue;
    }
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      fail(`${layerId}: manifest entry ${file.path} has no valid "sha256"`);
      continue;
    }
    const canonical = canonicalManifestPath(file.path);
    if (canonical.error) {
      fail(`${layerId}: ${canonical.error}`);
      continue;
    }
    const path = canonical.path;
    if (entries.has(path)) fail(`${layerId}: manifest lists ${path} more than once`);
    entries.set(path, {
      sha256: file.sha256,
      bytes: typeof file.bytes === 'number' ? file.bytes : null,
    });
  }
  return entries;
}

/** The declared manifest format's parser, or `null` if the format is not one this build knows. */
export function manifestParser(format) {
  if (format === 'sha256sums') return parseSha256Sums;
  if (format === 'manifest-json') return parseJsonManifest;
  return null;
}

/**
 * Directories under `docs/production-handoff/` that hold at least one file.
 *
 * An empty directory is not a package. Git does not track empty directories, so one can only be a
 * local working-tree residue of a branch switch — the two accepted audits both record exactly such
 * a residue — and treating it as an undeclared package would fail CI for a condition CI can never
 * see. The moment a file lands in one it becomes a package and must be declared, which is the
 * fail-closed half of the same rule. Nothing inside is read.
 */
export function handoffPackageDirectories() {
  if (!existsSync(HANDOFF_TREE)) return [];
  return readdirSync(HANDOFF_TREE)
    .sort()
    .filter((entry) => statSync(join(HANDOFF_TREE, entry)).isDirectory())
    .map((entry) => ({
      name: entry,
      root: `docs/production-handoff/${entry}`,
      fileCount: walk(join(HANDOFF_TREE, entry)).length,
    }));
}

/**
 * Parse the status line of a decision record.
 *
 * Two header shapes exist and both are load-bearing:
 *
 *   **Status:** Accepted (owner ruling, Phase 0)      — adr/ 0001-0010, 0014-0027; docs/decisions/
 *   ## Status\n\nAccepted.                            — adr/ 0011, 0012, 0013
 *
 * Reading only the first would silently treat three accepted ADRs as unaccepted, and reading
 * neither would let any string through. Anything matching no shape returns null and is reported as
 * unknown rather than assumed Accepted.
 */
export function decisionStatus(text) {
  const inline = /^\*\*Status:\*\*\s*(.+)$/m.exec(text);
  if (inline) return inline[1].trim();
  const listed = /^[-*]\s+\*\*Status:\*\*\s*(.+)$/m.exec(text);
  if (listed) return listed[1].trim();
  const sectioned = /^##\s+Status\s*\n+([^\n]+)/m.exec(text);
  if (sectioned) return sectioned[1].trim();
  return null;
}

/** `Accepted`, `Accepted (owner ruling, Phase 0)`, `Accepted — owner decisions D1-D4` all count. */
export const isAccepted = (status) => typeof status === 'string' && /^accepted\b/i.test(status);

/**
 * Build the authority index across both namespaces.
 *
 * Returns `{ index, counts, errors }` where index maps a canonical id to
 * `{ id, source, file, status, accepted }`.
 *
 * docs/decisions/ records are keyed by the `**ADR ID:**` they declare, cross-checked against their
 * filename number: a record claiming N0012 from a file numbered 0013 is a governance defect, not
 * something to resolve silently. The two Phase decision RECORDS (0001, 0002) declare no ADR ID and
 * are deliberately not citable authority — they are logs of rulings, not rulings addressable by id.
 * They are counted so an empty index cannot be mistaken for a clean one.
 */
export function buildAuthorityIndex() {
  const index = new Map();
  const errors = [];
  const counts = { adr: 0, 'network-decision': 0, unkeyedDecisionRecords: 0 };

  for (const [source, spec] of Object.entries(AUTHORITY_SOURCES)) {
    const dirAbs = join(REPO_ROOT, spec.dir);
    if (!existsSync(dirAbs)) {
      errors.push(`${spec.dir}/ is missing — the ${spec.label} namespace cannot be resolved`);
      continue;
    }
    for (const file of readdirSync(dirAbs).sort()) {
      const match = /^(\d{4})-.*\.md$/.exec(file);
      if (!match) continue;
      const number = match[1];
      const rel = `${spec.dir}/${file}`;
      const text = readFileSync(join(dirAbs, file), 'utf8');
      const status = decisionStatus(text);

      let id;
      if (source === 'adr') {
        id = `ADR-${number}`;
      } else {
        const declared = /^[-*]?\s*\*\*ADR ID:\*\*\s*(\S+)\s*$/m.exec(text);
        if (!declared) {
          counts.unkeyedDecisionRecords += 1;
          continue;
        }
        id = `ADR-${declared[1].trim()}`;
        if (!spec.idPattern.test(id)) {
          errors.push(`${rel} declares an ADR ID this build cannot key: ${JSON.stringify(id)}`);
          continue;
        }
        if (id !== `ADR-N${number}`) {
          errors.push(`${rel} declares ${id} but its filename numbers it ${number}`);
          continue;
        }
      }

      if (index.has(id)) {
        errors.push(`duplicate authority id ${id}: ${index.get(id).file} and ${rel}`);
        continue;
      }
      index.set(id, { id, source, file: rel, status, accepted: isAccepted(status) });
      counts[source] += 1;
    }
  }

  return { index, counts, errors };
}
