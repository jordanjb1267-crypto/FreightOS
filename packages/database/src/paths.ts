import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Reviewed implementation migrations (ADR-0017). Never db/reference/, which is never executed. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export const REFERENCE_DDL_DIR = join(MIGRATIONS_DIR, '..', '..', '..', 'db', 'reference');
