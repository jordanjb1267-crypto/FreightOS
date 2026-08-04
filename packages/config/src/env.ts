/**
 * Environment validation — PHASE_0_FOUNDATION requires it.
 *
 * Fails closed. A missing or malformed value throws at startup rather than defaulting to
 * something permissive, matching Constitution Art. I.2 ("missing or inconsistent legal context
 * fails closed") applied to configuration.
 *
 * The eight deferred-module flags are parsed as literal `false`. They are not booleans that
 * happen to default false — a `true` value is a validation error, so no environment file can turn
 * one on. 16_CLAUDE_MASTER_BUILD_PROMPT:91: "No feature flag alone may activate Brokerage Mode or
 * live autonomous-vehicle operations."
 */

import { z } from 'zod';
import { MANDATORY_FALSE_FLAGS } from './scope.ts';

const mustBeFalse = z
  .enum(['false'])
  .describe('mandatory deferred-module default; only "false" is accepted')
  .transform(() => false as const);

const optionalUrl = z.string().url();

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FREIGHTOS_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  DATABASE_MIGRATOR_URL: optionalUrl,
  DATABASE_APP_URL: optionalUrl,
  DATABASE_CONTROL_PLANE_URL: optionalUrl.optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(200).default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  OTEL_SERVICE_NAME: z.string().min(1).default('freightos'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

  OBJECT_STORAGE_ENDPOINT: z.string().optional(),
  OBJECT_STORAGE_BUCKET: z.string().optional(),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().optional(),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  OBJECT_STORAGE_REGION: z.string().optional(),

  TEMPORAL_ADDRESS: z.string().optional(),
  TEMPORAL_NAMESPACE: z.string().optional(),
  TEMPORAL_TASK_QUEUE: z.string().optional(),

  // Phase 0 selects no provider. Disabled means a model call fails closed rather than reaching
  // an unconfigured provider.
  MODEL_GATEWAY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const deferredFlagsSchema = z.object(
  Object.fromEntries(MANDATORY_FALSE_FLAGS.map((f) => [f, mustBeFalse])) as {
    [K in (typeof MANDATORY_FALSE_FLAGS)[number]]: typeof mustBeFalse;
  },
);

export const envSchema = baseSchema.merge(deferredFlagsSchema).superRefine((env, ctx) => {
  // A production deployment must not run on the development defaults.
  if (env.FREIGHTOS_ENV === 'production' && env.MODEL_GATEWAY_ENABLED) {
    if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OTEL_EXPORTER_OTLP_ENDPOINT'],
        message:
          'a production model gateway requires a telemetry endpoint — 12_OBSERVABILITY requires ' +
          'model latency and cost telemetry',
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export interface EnvResult {
  readonly ok: boolean;
  readonly env?: Env;
  readonly errors: readonly string[];
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): EnvResult {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return { ok: true, env: parsed.data, errors: [] };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

/** Throwing variant for application startup. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = parseEnv(source);
  if (!result.ok || !result.env) {
    throw new Error(`environment validation failed:\n  ${result.errors.join('\n  ')}`);
  }
  return result.env;
}
