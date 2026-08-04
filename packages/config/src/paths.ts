import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Walk upward for the workspace marker rather than counting `../` segments, so this keeps working
 * whether the module runs from source, from dist, or from a test runner's temp directory.
 */
export function repositoryRoot(from: string = fileURLToPath(import.meta.url)): string {
  let dir = dirname(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('repository root not found: no pnpm-workspace.yaml above');
    dir = parent;
  }
}

export const MODULE_STATES_PATH = 'config/scope/module_states.yaml';
export const AGENT_REGISTRY_PATH = 'config/agents/registry.yaml';
export const BASE_POLICY_PATH = 'config/policy/base_policy.yaml';
export const PRODUCTS_PATH = 'config/pricing/products.yaml';
