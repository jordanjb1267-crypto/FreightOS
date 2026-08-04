/**
 * Transaction-scoped session context.
 *
 * Every consequential database interaction runs inside `withLegalContext`, which sets the session
 * variables the RLS policies read and clears them when the transaction ends. `SET LOCAL` is what
 * makes that safe under connection pooling: context cannot leak to the next borrower of the
 * connection.
 *
 * Constitution Art. I.1 / I.2 — execute only within explicit context; missing or inconsistent
 * context fails closed.
 */

import type { Client, PoolClient } from 'pg';
import {
  type LegalContext,
  assertLegalContext,
  type ValidationOptions,
} from '../../context/src/legal.ts';

export type Queryable = Client | PoolClient;

export const HORIZON_1_VALIDATION: ValidationOptions = Object.freeze({ brokerageEnabled: false });

/**
 * `set_config(..., true)` is the function form of SET LOCAL — it is scoped to the surrounding
 * transaction. Parameterised rather than interpolated, so context values cannot inject SQL.
 */
export async function applyLegalContext(
  client: Queryable,
  context: LegalContext,
  options: ValidationOptions = HORIZON_1_VALIDATION,
): Promise<void> {
  assertLegalContext(context, options);

  await client.query(
    `SELECT set_config('app.tenant_id', $1, true),
            set_config('app.actor_id', $2, true),
            set_config('app.legal_authority_class', $3, true),
            set_config('app.operating_context', $4, true),
            set_config('app.legal_entity_id', $5, true)`,
    [
      context.tenantId,
      context.actorId,
      context.legalAuthorityClass,
      context.operatingContext,
      context.legalEntityId ?? '',
    ],
  );
}

/**
 * Run `work` inside a transaction carrying `context`. Commits on success, rolls back on any
 * throw. The context is never set outside a transaction, so there is no window in which a
 * connection carries stale authority.
 */
export async function withLegalContext<T>(
  client: Queryable,
  context: LegalContext,
  work: (client: Queryable) => Promise<T>,
  options: ValidationOptions = HORIZON_1_VALIDATION,
): Promise<T> {
  assertLegalContext(context, options);

  await client.query('BEGIN');
  try {
    await applyLegalContext(client, context, options);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** Read back what the database believes the current context is. Used by tests and diagnostics. */
export async function currentContext(client: Queryable): Promise<{
  tenantId: string | null;
  actorId: string | null;
  legalAuthorityClass: string | null;
  operatingContext: string | null;
  isControlPlane: boolean;
}> {
  const result = await client.query<{
    tenant_id: string | null;
    actor_id: string | null;
    legal_authority_class: string | null;
    operating_context: string | null;
    is_control_plane: boolean;
  }>(
    `SELECT app.current_tenant_id()::text            AS tenant_id,
            app.current_actor_id()                   AS actor_id,
            app.current_legal_authority_class()::text AS legal_authority_class,
            app.current_operating_context()::text     AS operating_context,
            app.is_control_plane()                    AS is_control_plane`,
  );

  const row = result.rows[0]!;
  return {
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    legalAuthorityClass: row.legal_authority_class,
    operatingContext: row.operating_context,
    isControlPlane: row.is_control_plane,
  };
}
