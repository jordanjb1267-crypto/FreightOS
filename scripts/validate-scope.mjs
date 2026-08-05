#!/usr/bin/env node
// Application-side anti-overbuilding validator — closes audit finding G11.
//
// scripts/validate_handoff.py guards the handoff PACKAGE. Nothing guarded the application, which
// is where overbuilding would actually happen. This encodes the nine failure conditions from
// 21_SEQUENCING_DOCTRINE §11, the prohibited-directory list from §10 including its anti-rename
// clause, the eight mandatory-false defaults, and the Horizon 1 autonomy ceiling.
//
// 14_TEST_AND_ACCEPTANCE_STRATEGY:44 — "CI must scan application, service, worker, route,
// deployment, secret, and billing registries for prohibited deferred implementations. Equivalent
// functionality is prohibited even when directory or feature names differ."
//
// Exit 0 = clean, 1 = a scope violation.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from './handoff-sources.mjs';

const errors = [];
const notes = [];

const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');
const exists = (rel) => existsSync(join(REPO_ROOT, rel));

// ---------------------------------------------------------------------------
// 1. Scope registry must still authorise Horizon 1 and stop there.
// ---------------------------------------------------------------------------
const scope = parse(read('config/scope/module_states.yaml'));

if (scope.horizon_authorized !== 1) {
  errors.push(
    `horizon_authorized is ${scope.horizon_authorized}; Horizon 1 is the authorized scope`,
  );
}
if (scope.stop_after_horizon !== 1) {
  errors.push(`stop_after_horizon is ${scope.stop_after_horizon}; must be 1`);
}

// 21_...:189-199 — "Claude advances beyond Horizon 1 without a signed decision."
const MODULE_EXPECTATIONS = {
  freightos_shared_core: 'ACTIVE_BUILD',
  road_ftl_carrier_operations: 'ACTIVE_BUILD',
  carrier_core: 'ACTIVE_BUILD',
  carrier_copilot: 'ACTIVE_BUILD',
  rigreceipts_economics_boundary: 'ACTIVE_BUILD',
  rigdesk_maintenance_hooks: 'ACTIVE_BUILD',
  minimum_facility_primitives: 'FOUNDATION_ONLY',
  carrier_autonomous_a4_a5: 'PROMOTION_GATED',
  shipper_control_tower: 'PROMOTION_GATED',
  facilityos_lite: 'PROMOTION_GATED',
  facilityos_full: 'CUSTOMER_GATED',
  digital_brokerage: 'LEGAL_AND_MARKET_GATED',
  freight_exchange: 'LIQUIDITY_GATED',
  autonomous_vehicle_gateway: 'INTERFACE_AND_SIMULATION_ONLY',
  live_autonomous_vehicle_missions: 'PARTNER_AND_SAFETY_GATED',
  rail_adapter: 'INTERFACE_AND_SIMULATION_ONLY',
  ocean_adapter: 'INTERFACE_AND_SIMULATION_ONLY',
  air_adapter: 'DORMANT',
};

for (const [id, expected] of Object.entries(MODULE_EXPECTATIONS)) {
  const actual = scope.modules?.[id]?.state;
  if (actual !== expected) {
    errors.push(
      `module state changed without a promotion gate: ${id} is ${actual}, expected ${expected}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. The eight mandatory-false defaults, in the registry AND in .env.example.
// ---------------------------------------------------------------------------
const MANDATORY_FALSE = [
  'FACILITYOS_STANDALONE_ENABLED',
  'AUTONOMOUS_DISPATCH_A4_ENABLED',
  'BROKERAGE_EXECUTION_ENABLED',
  'FREIGHT_EXCHANGE_ENABLED',
  'AUTONOMOUS_VEHICLE_LIVE_MISSIONS_ENABLED',
  'RAIL_OPERATIONS_ENABLED',
  'OCEAN_OPERATIONS_ENABLED',
  'AIR_OPERATIONS_ENABLED',
];

for (const flag of MANDATORY_FALSE) {
  if (scope.mandatory_defaults?.[flag] !== false) {
    errors.push(`mandatory deferred flag must be false in module_states.yaml: ${flag}`);
  }
}

const envExample = read('.env.example');
for (const flag of MANDATORY_FALSE) {
  const match = new RegExp(`^${flag}=(.*)$`, 'm').exec(envExample);
  if (!match) errors.push(`.env.example is missing mandatory flag ${flag}`);
  else if (match[1].trim() !== 'false') {
    errors.push(`.env.example sets ${flag}=${match[1].trim()}; must be false`);
  }
}

// ---------------------------------------------------------------------------
// 3. Prohibited directories — 21_...:173-185, including the anti-rename clause.
// ---------------------------------------------------------------------------
const PROHIBITED_PATHS = [
  'apps/facility-control-tower',
  'services/autonomous-mission-executor',
  'services/brokerage-allocation',
  'services/exchange-clearing',
  'services/rail-operations',
  'services/ocean-booking',
  'services/air-operations',
];

for (const path of PROHIBITED_PATHS) {
  if (exists(path)) errors.push(`prohibited directory exists: ${path}/`);
}

// "Equivalent directories, services, workers, public routes, or deployment units are prohibited
// even if named differently." Name matching alone cannot catch a rename, so this flags any
// deployable unit whose name suggests a deferred capability and requires it to be justified.
const DEFERRED_CAPABILITY_WORDS = [
  'facility-control',
  'facilityos',
  'autonomous-mission',
  'autonomous-dispatch',
  'brokerage',
  'exchange-clearing',
  'freight-exchange',
  'rail-operations',
  'ocean-booking',
  'air-operations',
  'remote-driving',
];

const DEPLOYABLE_ROOTS = ['apps', 'services', 'workers', 'functions', 'deploy'];

for (const root of DEPLOYABLE_ROOTS) {
  const abs = join(REPO_ROOT, root);
  if (!existsSync(abs)) continue;
  for (const entry of readdirSync(abs)) {
    if (!statSync(join(abs, entry)).isDirectory()) continue;
    const lower = entry.toLowerCase();
    const hit = DEFERRED_CAPABILITY_WORDS.find((w) => lower.includes(w));
    if (hit) {
      errors.push(
        `deployable unit "${root}/${entry}" names a deferred capability ("${hit}"). ` +
          `21_SEQUENCING_DOCTRINE:185 prohibits equivalent units even under a different name.`,
      );
    }
  }
}

// Deferred contract packages may exist, but only as contracts — no worker or route entrypoints.
const CONTRACT_ONLY_PACKAGES = [
  'facility-contracts',
  'autonomous-vehicle-contracts',
  'mode-rail-contracts',
  'mode-ocean-contracts',
  'brokerage-contracts',
  'exchange-contracts',
];

const packagesDir = join(REPO_ROOT, 'packages');
if (existsSync(packagesDir)) {
  for (const pkg of readdirSync(packagesDir)) {
    if (!CONTRACT_ONLY_PACKAGES.includes(pkg)) continue;
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry);
        if (statSync(abs).isDirectory()) {
          walk(abs);
          continue;
        }
        if (!/\.(ts|mts|js|mjs)$/.test(entry)) continue;
        const source = readFileSync(abs, 'utf8');
        const rel = relative(REPO_ROOT, abs).split(sep).join('/');
        // 21_...:105 — scaffold code must not open network connections to real providers,
        // emit live external writes, create public routes, or start production workers.
        for (const [pattern, what] of [
          [/\bfetch\s*\(/, 'a network call'],
          [/from\s+['"](node:)?(http|https|net|undici)['"]/, 'a network client import'],
          [/\.listen\s*\(/, 'a server listener'],
          [/new\s+Worker\s*\(/, 'a worker'],
        ]) {
          if (pattern.test(source)) {
            errors.push(`scaffold package ${pkg} contains ${what} in ${rel}; contracts only`);
          }
        }
      }
    };
    walk(join(packagesDir, pkg));
  }
}

// ---------------------------------------------------------------------------
// 3b. Package layering — ADR-0024 §Enforcement.
//
// "Dependency direction is asserted in CI, not merely documented. A check reads each package's
// package.json workspace dependencies, maps them to layers, and fails on any same-layer or upward
// edge — which also makes a cycle impossible to introduce."
//
// Only the roots ADR-0024 authorizes may exist. `packages/facility-contracts/` and the five other
// paths 21_...:161-171 permits are deliberately absent: the doctrine allows them, and ADR-0024 §
// "Authorized Phase 1 package roots" does not commission them.
// ---------------------------------------------------------------------------
const PACKAGE_LAYERS = {
  config: 0,
  schemas: 0,
  context: 1,
  database: 2,
  'rigreceipts-contracts': 3,
  'rigdesk-contracts': 3,
  identity: 4,
  parties: 4,
  carrier: 5,
  'modal-core': 5,
  'mode-road': 6,
  'facility-primitives': 6,
};

// L3 is a leaf on purpose: an external contract package importing a domain type would put tenant
// domain types inside a package whose whole purpose is to model something FreightOS does not own.
const LEAF_LAYERS = new Set([3]);

// ---------------------------------------------------------------------------
// The check reads IMPORTS, not only manifests — F-11.
//
// It used to read package.json alone, which meant it enforced the dependency graph a package
// DECLARED rather than the one it had. Three ways of taking an undeclared edge went straight past
// it, and the repository contained all three:
//
//   packages/schemas/src/index.ts     -> ../../config/src/paths.ts       (a same-layer edge)
//   packages/database/src/session.ts  -> ../../context/src/legal.ts      (undeclared)
//   packages/database/test/**         -> ../../../identity/src/*.ts      (an upward edge)
//
// Every one of them declared nothing in any package.json, so the validator reported
// PACKAGE_LAYERING=PASS while the layering it describes did not hold. A relative path that walks
// out of its own package is the whole trick, and it is invisible to a manifest reader by
// construction.
//
// So three rules, and the third is what makes the first two enforceable:
//
//   1. A RUNTIME edge — `dependencies` or `peerDependencies`, and anything imported from src/ —
//      must go strictly downward. No same-layer edge, no upward edge.
//   2. A TEST edge — `devDependencies`, and anything imported from test/ — may go upward. A test
//      asserting that the database and the identity package agree about a vocabulary is inherently
//      cross-layer and ships to nobody. It must still be DECLARED, so the edge is visible in the
//      manifest rather than buried in a path.
//   3. A relative import may not leave its own package, in either directory. Reaching sideways
//      through the filesystem is how rules 1 and 2 were avoided.
// ---------------------------------------------------------------------------

const IMPORT_RE =
  /(?:^|[^\w$])(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|(?:^|[^\w$])import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[^\w$])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Every .ts/.mts/.js file under `dir`, recursively. */
function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      found.push(...sourceFiles(full));
    } else if (/\.(m?ts|m?js|tsx)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

function importSpecifiers(file) {
  const text = readFileSync(file, 'utf8');
  const specifiers = [];
  for (const match of text.matchAll(IMPORT_RE)) {
    specifiers.push(match[1] ?? match[2] ?? match[3]);
  }
  return specifiers.filter(Boolean);
}

/**
 * TypeScript path aliases resolve at compile time and leave no trace in package.json, so an alias
 * mapping one package's name onto another's source would take an edge this check never sees.
 * Rather than resolve them, they are refused outright: nothing in this repository needs one, and a
 * future one must arrive with its own decision about what it does to the layering rule.
 */
const typescriptConfigs = [
  ...readdirSync(REPO_ROOT)
    .filter((entry) => /^tsconfig(\..+)?\.json$/.test(entry))
    .map((entry) => join(REPO_ROOT, entry)),
  ...(existsSync(join(REPO_ROOT, 'packages'))
    ? readdirSync(join(REPO_ROOT, 'packages'))
        .map((pkg) => join(REPO_ROOT, 'packages', pkg))
        .filter((dir) => statSync(dir).isDirectory())
        .flatMap((dir) =>
          readdirSync(dir)
            .filter((entry) => /^tsconfig(\..+)?\.json$/.test(entry))
            .map((entry) => join(dir, entry)),
        )
    : []),
];

for (const configPath of typescriptConfigs) {
  if (/"paths"\s*:/.test(readFileSync(configPath, 'utf8'))) {
    errors.push(
      `${relative(REPO_ROOT, configPath)} defines compilerOptions.paths. A path alias can map one ` +
        `package onto another's source without any package.json edge, which makes ADR-0024's ` +
        `layering unenforceable. Use workspace dependencies.`,
    );
  }
}

if (existsSync(packagesDir)) {
  for (const pkg of readdirSync(packagesDir)) {
    if (!statSync(join(packagesDir, pkg)).isDirectory()) continue;

    const layer = PACKAGE_LAYERS[pkg];
    if (layer === undefined) {
      errors.push(
        `packages/${pkg}/ is not an authorized package root. ADR-0024 names the preserved Phase 0 ` +
          `packages and the eight Phase 1 roots; creating another requires its own decision.`,
      );
      continue;
    }

    const manifestPath = join(packagesDir, pkg, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    const workspaceNames = (record) =>
      Object.keys(record ?? {})
        .filter((d) => d.startsWith('@freightos/'))
        .map((d) => d.slice('@freightos/'.length));

    const runtimeDeps = new Set([
      ...workspaceNames(manifest.dependencies),
      ...workspaceNames(manifest.peerDependencies),
    ]);
    const testDeps = new Set(workspaceNames(manifest.devDependencies));

    // --- 1. Declared runtime edges must go strictly downward. ---
    for (const name of runtimeDeps) {
      const dependencyLayer = PACKAGE_LAYERS[name];
      if (dependencyLayer === undefined) {
        errors.push(`packages/${pkg} depends on unknown workspace package @freightos/${name}`);
        continue;
      }
      if (LEAF_LAYERS.has(layer)) {
        errors.push(
          `packages/${pkg} is an external-contract leaf (ADR-0024 L${layer}) and may depend only ` +
            `on L0; it depends on @freightos/${name}`,
        );
      } else if (dependencyLayer >= layer) {
        errors.push(
          `packages/${pkg} (L${layer}) depends on @freightos/${name} (L${dependencyLayer}). ` +
            `ADR-0024 permits only strictly lower layers — no same-layer edge and no upward edge.`,
        );
      }
    }

    // --- 2. Declared test edges must at least name a real package. ---
    for (const name of testDeps) {
      if (PACKAGE_LAYERS[name] === undefined) {
        errors.push(`packages/${pkg} devDepends on unknown workspace package @freightos/${name}`);
      }
    }

    // --- 3. Every import in the package, checked against what it declared. ---
    const packageRoot = join(packagesDir, pkg);
    for (const area of ['src', 'test']) {
      const isRuntime = area === 'src';
      for (const file of sourceFiles(join(packageRoot, area))) {
        const where = relative(REPO_ROOT, file);

        for (const specifier of importSpecifiers(file)) {
          if (specifier.startsWith('.')) {
            // A relative import that leaves the package is a cross-package edge wearing a path.
            const resolved = join(file, '..', specifier);
            if (!relative(packageRoot, resolved).startsWith(`..${sep}`)) continue;
            errors.push(
              `${where} imports "${specifier}", which leaves packages/${pkg}. A cross-package ` +
                `import must name the workspace package so the edge is declared and checkable.`,
            );
            continue;
          }

          if (!specifier.startsWith('@freightos/')) continue;
          const name = specifier.slice('@freightos/'.length).split('/')[0];

          if (isRuntime) {
            if (!runtimeDeps.has(name)) {
              errors.push(
                `${where} imports @freightos/${name} but packages/${pkg} does not declare it as a ` +
                  `runtime dependency. ${testDeps.has(name) ? 'It is a devDependency, which is a test-only edge and may not be imported from src/.' : 'Add it to dependencies.'}`,
              );
            }
          } else if (!runtimeDeps.has(name) && !testDeps.has(name)) {
            errors.push(
              `${where} imports @freightos/${name} but packages/${pkg} declares no dependency on ` +
                `it. A test edge still has to be declared — add it to devDependencies.`,
            );
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. No future product is billable or sale-enabled — 21_...:191.
// ---------------------------------------------------------------------------
const products = parse(read('config/pricing/products.yaml'));
for (const product of products.products ?? []) {
  if (product.billing_enabled !== false) {
    errors.push(
      `product ${product.id} has billing_enabled=${product.billing_enabled}; must be false`,
    );
  }
  if (product.customer_sale_allowed !== false) {
    errors.push(
      `product ${product.id} has customer_sale_allowed=${product.customer_sale_allowed}; must be false`,
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Autonomy ceiling — owner ruling 6 and ADR-0018.
// ---------------------------------------------------------------------------
const AUTONOMY = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const rank = (level) => AUTONOMY.indexOf(level);
const IMPLEMENTABLE = new Set(['ACTIVE_BUILD', 'FOUNDATION_ONLY']);

function effectiveAutonomy(declared, moduleEntry, authorizedHorizon) {
  const horizonMax = authorizedHorizon <= 1 ? 'A3' : 'A5';
  const horizon = moduleEntry?.horizon ?? moduleEntry?.earliest_horizon;
  let moduleMax = 'A0';
  if (
    IMPLEMENTABLE.has(moduleEntry?.state) &&
    horizon !== undefined &&
    horizon <= authorizedHorizon
  ) {
    moduleMax = moduleEntry.autonomy_max ?? horizonMax;
  }
  return [declared, moduleMax, horizonMax].reduce((a, b) => (rank(a) <= rank(b) ? a : b));
}

const agentRegistry = parse(read('config/agents/registry.yaml'));
let clampedCount = 0;

for (const agent of agentRegistry.agents ?? []) {
  const moduleEntry = scope.modules?.[agent.module];
  if (!moduleEntry) {
    errors.push(`agent ${agent.id} names unknown module "${agent.module}"`);
    continue;
  }

  const effective = effectiveAutonomy(
    agent.maximum_autonomy,
    moduleEntry,
    scope.horizon_authorized,
  );
  if (effective !== agent.maximum_autonomy) clampedCount += 1;

  if (rank(effective) > rank('A3')) {
    errors.push(`agent ${agent.id} resolves to ${effective}; Horizon 1 permits at most A3`);
  }

  if (agent.legal_authority_class === 'carrier_agent' && rank(effective) > rank('A3')) {
    errors.push(
      `carrier agent ${agent.id} resolves to ${effective}; owner ruling 6 requires A3 or lower`,
    );
  }

  // 14_...:31 — agents cannot call unlisted tools. No tool registry exists in Phase 0, so any
  // non-empty allowlist would point at tools that have no definition.
  if ((agent.allowed_tools ?? []).length > 0) {
    errors.push(
      `agent ${agent.id} declares allowed_tools but no tool registry exists yet (Phase 2 deliverable)`,
    );
  }

  // Constitution Art. X.6 — no agent may change its own module state or autonomy ceiling.
  const selfPromotion = ['module_state.change', 'horizon.promote', 'agent_self_promotion'];
  if (selfPromotion.some((a) => (agent.allowed_tools ?? []).includes(a))) {
    errors.push(`agent ${agent.id} is granted a self-promotion capability`);
  }
}

// ---------------------------------------------------------------------------
// 6. Safety boundary — no physical-control surface anywhere in application code.
// 21_...:194 "Autonomous vehicle control tools exist." / 02_GOVERNANCE, Constitution Art. IX.
// ---------------------------------------------------------------------------
const FORBIDDEN_CONTROL = [
  'vehicle.steer',
  'vehicle.accelerate',
  'vehicle.brake',
  'vehicle.change_lane',
  'vehicle.reverse',
  'remote_drive',
  'plc.write',
  'safety_interlock.override',
  'conveyor.control',
  'dock_restraint.control',
  'robot.move',
  'forklift.move',
];

function scanSource(dir) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', '.turbo', 'coverage'].includes(entry)) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      scanSource(abs);
      continue;
    }
    if (!/\.(ts|mts|js|mjs|sql)$/.test(entry)) continue;

    const rel = relative(REPO_ROOT, abs).split(sep).join('/');
    // The policy denylist and this validator necessarily name the forbidden verbs.
    if (
      rel.startsWith('scripts/') ||
      rel.startsWith('config/') ||
      rel.startsWith('db/reference/')
    ) {
      continue;
    }

    const source = readFileSync(abs, 'utf8');
    for (const verb of FORBIDDEN_CONTROL) {
      // Only flag a verb used as an identifier or call, not one named inside a comment.
      const active = new RegExp(`['"\`]${verb.replace('.', '\\.')}['"\`]`);
      if (active.test(source)) {
        errors.push(
          `physical-control verb "${verb}" appears in ${rel}; Constitution Art. IX forbids it`,
        );
      }
    }
  }
}

for (const dir of ['packages', 'apps', 'services']) {
  if (exists(dir)) scanSource(join(REPO_ROOT, dir));
}

// ---------------------------------------------------------------------------
// 7. No live credential for a deferred capability — 21_...:192.
// ---------------------------------------------------------------------------
const DEFERRED_CREDENTIAL_HINTS = [
  'BROKERAGE_API_KEY',
  'ADS_PROVIDER_KEY',
  'RAIL_API_KEY',
  'OCEAN_API_KEY',
  'FACILITY_AUTOMATION_KEY',
  'AV_PROVIDER_TOKEN',
];
for (const hint of DEFERRED_CREDENTIAL_HINTS) {
  if (envExample.includes(hint)) {
    errors.push(`.env.example references a deferred-capability credential: ${hint}`);
  }
}

// ---------------------------------------------------------------------------
// 8. Phase boundary — Phase 0 must not have produced domain schema.
// ---------------------------------------------------------------------------
const migrationsDir = join(REPO_ROOT, 'packages/database/migrations');
if (existsSync(migrationsDir)) {
  const DOMAIN_TABLES = [
    'shipments',
    'consignments',
    'transport_journeys',
    'transport_legs',
    'facilities',
    'appointments',
    'autonomous_missions',
  ];
  for (const file of readdirSync(migrationsDir)) {
    if (!file.endsWith('.up.sql')) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    for (const table of DOMAIN_TABLES) {
      if (new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?${table}\\b`, 'i').test(sql)) {
        errors.push(
          `migration ${file} creates domain table "${table}"; that is Phase 1 scope, not Phase 0`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report. Silent truncation reads as "covered everything" when it did not, so state what was
// checked as well as what failed.
// ---------------------------------------------------------------------------
notes.push(`modules checked: ${Object.keys(MODULE_EXPECTATIONS).length}`);
notes.push(`mandatory-false flags: ${MANDATORY_FALSE.length}`);
notes.push(`prohibited paths: ${PROHIBITED_PATHS.length}`);
notes.push(`authorized package roots: ${Object.keys(PACKAGE_LAYERS).length}`);
notes.push(`products checked: ${(products.products ?? []).length}`);
notes.push(
  `agents checked: ${(agentRegistry.agents ?? []).length} (${clampedCount} clamped below declared ceiling)`,
);
notes.push(`forbidden control verbs: ${FORBIDDEN_CONTROL.length}`);

if (errors.length > 0) {
  console.error('SCOPE_VALIDATION=FAIL');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log('SCOPE_VALIDATION=PASS');
console.log('HORIZON_1_ONLY=PASS');
console.log('DEFERRED_MODULES_DISABLED=PASS');
console.log('AUTONOMY_CEILING=PASS');
console.log('SAFETY_BOUNDARY=PASS');
console.log('BILLING_DISABLED=PASS');
console.log('PACKAGE_LAYERING=PASS');
for (const n of notes) console.log(`  ${n}`);
