// What changed in each version, newest first. The text lives in changelog.json at the repo root,
// which the build also copies into the GitHub release notes.
import raw from '../../changelog.json';
import type { Lang } from './types';

export interface ChangelogEntry { version: string; date: string; he: string[]; en: string[] }
export const CHANGELOG: ChangelogEntry[] = raw;
export const linesOf = (e: { he: string[]; en: string[] }, lang: Lang) => (lang === 'he' ? e.he : e.en);

/** Compares "1.2.0"-style versions: negative when a is older than b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

const SEEN = 'finance-seen-version';
/** Entries the user has not been shown yet. Empty on a fresh install, where nothing "changed". */
export function unseenChanges(current: string, hasData: boolean): ChangelogEntry[] {
  let seen: string | null = null;
  try { seen = localStorage.getItem(SEEN); } catch { /* storage unavailable */ }
  if (seen === current) return [];
  // Versions before 1.3.0 did not record what was seen; someone who already has data came from one of them.
  if (!seen) return hasData ? CHANGELOG.filter((e) => e.version === current) : [];
  return CHANGELOG.filter((e) => compareVersions(e.version, seen!) > 0 && compareVersions(e.version, current) <= 0);
}
export function markChangesSeen(current: string) {
  try { localStorage.setItem(SEEN, current); } catch { /* storage unavailable */ }
}
