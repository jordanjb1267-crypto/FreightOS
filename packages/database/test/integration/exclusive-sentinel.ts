import { open, readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * An overlap DETECTOR for integration test files, not a lock.
 *
 * The distinction matters. A lock would make concurrent files wait and then pass, which is exactly
 * the outcome that must not be reachable here: the point of the fixtures that call this is to FAIL
 * loudly when two integration files run at the same time. `wx` is an atomic create-if-absent, so
 * the second caller does not queue — it gets EEXIST and reports who was holding.
 *
 * Why a filesystem sentinel rather than a variable, a port or a database row: the pre-hardening
 * defect ran integration files in roughly eight separate PROCESSES. Anything held in memory is
 * per-process and would have reported "no overlap" throughout the whole broken period, which is the
 * failure mode this file exists to make impossible. A file is shared by every process on the host.
 *
 * Lives under `node_modules/` because that path is already ignored by git, by prettier, by eslint
 * and by the scope validator, so a sentinel left behind by a hard-killed run cannot be mistaken for
 * a repository change.
 */
const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const SENTINEL = join(ROOT, 'node_modules', '.freightos-file-serialization.sentinel');

/**
 * A hard kill (SIGKILL, a crashed worker, a cancelled CI job) can leave the sentinel behind, and a
 * leftover file would then fail the next run for a reason that has nothing to do with scheduling.
 * Holds are measured in hundreds of milliseconds, so anything this old cannot be a live holder and
 * reclaiming it cannot mask a real overlap.
 */
const STALE_MS = 60_000;

export interface SentinelHold {
  owner: string;
  pid: number;
  heldMs: number;
}

/**
 * Take the sentinel exclusively, hold it for `holdMs`, and prove on release that nobody else wrote
 * to it in the meantime.
 *
 * @throws if another integration file already holds it — that is the overlap being detected.
 */
export async function holdExclusively(owner: string, holdMs: number): Promise<SentinelHold> {
  const stamp = `${owner} pid=${process.pid}`;
  let handle: Awaited<ReturnType<typeof open>>;

  try {
    handle = await open(SENTINEL, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;

    const holder = await readFile(SENTINEL, 'utf8').catch(() => '(unreadable)');
    const ageMs = await stat(SENTINEL)
      .then((s) => Date.now() - s.mtimeMs)
      .catch(() => Number.POSITIVE_INFINITY);

    if (ageMs <= STALE_MS) {
      throw new Error(
        `INTEGRATION FILES OVERLAPPED: "${owner}" found the exclusive sentinel already held by ` +
          `"${holder}" (${Math.round(ageMs)}ms old). Integration files share one PostgreSQL ` +
          `cluster — roles and pg_auth_members are cluster-global — so concurrent files race on ` +
          `role provisioning and pile up on ROLE_SETUP_LOCK. The integration project must execute ` +
          `test files one at a time.`,
      );
    }

    await unlink(SENTINEL).catch(() => undefined);
    handle = await open(SENTINEL, 'wx');
  }

  const startedAt = Date.now();
  try {
    await handle.writeFile(stamp);
    await new Promise((resolve) => setTimeout(resolve, holdMs));

    // Belt and braces: EEXIST catches a second file ARRIVING, this catches one that somehow got a
    // handle anyway. Without it a sentinel implementation bug would read as a clean pass.
    const seen = await readFile(SENTINEL, 'utf8');
    if (seen !== stamp) {
      throw new Error(
        `INTEGRATION FILES OVERLAPPED: "${owner}" wrote "${stamp}" to the exclusive sentinel and ` +
          `read back "${seen}" — another file took it mid-hold.`,
      );
    }
    return { owner, pid: process.pid, heldMs: Date.now() - startedAt };
  } finally {
    await handle.close();
    await unlink(SENTINEL).catch(() => undefined);
  }
}
