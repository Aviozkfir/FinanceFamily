// The personal classifier. It has no fixed knowledge beyond a short built-in list: everything
// else is worked out, each time, from the transactions this user classified by hand.
//
// For a merchant the user already classified:
//   - the answer is what they chose most recently;
//   - it is 'learned' when the last two months agree (or there is only one month);
//   - it is a 'guess' when they changed their mind recently, or split the merchant between
//     categories in the same month — so the app asks instead of assuming.
// For a merchant never seen before, in order:
//   - a known merchant with a very similar name ("שופרסל דיל" → "שופרסל אונליין");
//   - a word that the user's own merchants agree on ("מסעדת …" → wants);
//   - the built-in list of common Israeli merchants.
// Transfers through payment apps are the exception: always left for the user (see isTransfer).
// All of those are a 'guess'. Guesses are never used as evidence, so the model cannot talk
// itself into a mistake: only choices the user made or confirmed count.
import type { DB, Tx } from './types';
import { merchantKey } from './format';
import { guessPreset } from './heuristics';
import { presetBucket, presetCategoryId } from './presets';

/** Who decided a transaction's category. */
export type Source = 'user' | 'learned' | 'guess';
export const sourceOf = (t: Pick<Tx, 'categoryId' | 'by'>): Source | null => (t.categoryId ? t.by ?? 'user' : null);

/**
 * Payment apps and transfers (Bit, PayBox): the name says how the money moved, not what it paid
 * for, and that differs every time. They are never classified automatically and never learned.
 */
export const isTransfer = (merchant: string) => /(^|[\s-])(bit|ביט|paybox|פייבוקס|pay box)([\s-]|$)|העברה/i.test(merchantKey(merchant));

export interface Suggestion { categoryId: string; by: 'learned' | 'guess'; hint?: string }

interface Known { key: string; name: string; categoryId: string; steady: boolean; tokens: string[]; grams: Set<string> }
export interface Model {
  known: Map<string, Known>;
  /** word → category → how many different merchants carry that word in that category */
  words: Map<string, Map<string, number>>;
  valid: Set<string>;
}

const STOP = new Set(['בעמ', 'ישראל', 'סניף', 'חברת', 'חברה', 'בית', 'של', 'ltd', 'inc', 'israel', 'www', 'com', 'the', 'בע', 'מ']);
const tokensOf = (key: string) => key.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w));
function gramsOf(key: string): Set<string> {
  const s = ` ${key.replace(/\d+/g, '').replace(/\s+/g, ' ').trim()} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}
function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const g of a) if (b.has(g)) both++;
  return (2 * both) / (a.size + b.size);
}
/** The category that appears most in a list; on a tie, the one seen last. */
function majority(cats: string[]): string {
  const n = new Map<string, number>();
  let best = cats[cats.length - 1];
  for (const c of cats) { n.set(c, (n.get(c) ?? 0) + 1); if (n.get(c)! >= n.get(best)!) best = c; }
  return best;
}

export function buildModel(db: DB): Model {
  const valid = new Set(db.categories.filter((c) => c.bucket !== 'invest').map((c) => c.id));
  // merchant → month → the categories the user chose there, months in order
  const decisions = new Map<string, { name: string; months: Map<string, string[]> }>();
  for (const key of Object.keys(db.months).sort()) {
    for (const t of db.months[key].txs) {
      if (sourceOf(t) !== 'user' || !valid.has(t.categoryId!) || isTransfer(t.merchant)) continue;
      const k = merchantKey(t.merchant);
      const d = decisions.get(k) ?? { name: t.merchant, months: new Map() };
      d.months.set(key, [...(d.months.get(key) ?? []), t.categoryId!]);
      decisions.set(k, d);
    }
  }

  const known = new Map<string, Known>();
  const put = (key: string, name: string, categoryId: string, steady: boolean) =>
    known.set(key, { key, name, categoryId, steady, tokens: tokensOf(key), grams: gramsOf(key) });
  for (const [k, d] of decisions) {
    const months = [...d.months.values()];
    const last = months[months.length - 1];
    const lastCat = majority(last);
    const prevCat = months.length > 1 ? majority(months[months.length - 2]) : lastCat;
    put(k, d.name, lastCat, new Set(last).size === 1 && prevCat === lastCat);
  }
  // Rules remembered by earlier versions of the app, for merchants with no history left.
  for (const [k, cat] of Object.entries(db.merchantRules ?? {})) if (!known.has(k) && valid.has(cat)) put(k, k, cat, true);

  const words = new Map<string, Map<string, number>>();
  for (const m of known.values()) {
    for (const w of new Set(m.tokens)) {
      const cats = words.get(w) ?? new Map<string, number>();
      cats.set(m.categoryId, (cats.get(m.categoryId) ?? 0) + 1);
      words.set(w, cats);
    }
  }
  return { known, words, valid };
}

export function suggest(model: Model, merchant: string): Suggestion | null {
  if (isTransfer(merchant)) return null;
  const key = merchantKey(merchant);
  const exact = model.known.get(key);
  if (exact) return { categoryId: exact.categoryId, by: exact.steady ? 'learned' : 'guess' };

  // A known merchant with nearly the same name.
  const tokens = tokensOf(key), grams = gramsOf(key);
  let best: Known | null = null, bestScore = 0;
  for (const m of model.known.values()) {
    const sameBrand = tokens.length > 0 && m.tokens.length > 0 && tokens[0] === m.tokens[0] && tokens[0].length >= 4;
    const score = Math.max(dice(grams, m.grams), sameBrand ? 0.75 : 0);
    if (score > bestScore) { best = m; bestScore = score; }
  }
  if (best && bestScore >= 0.62) return { categoryId: best.categoryId, by: 'guess', hint: best.name };

  // A word that this user's merchants agree on.
  let word = '', wordCat = '', wordCount = 0;
  for (const w of tokens) {
    const cats = model.words.get(w);
    if (!cats) continue;
    const total = [...cats.values()].reduce((s, n) => s + n, 0);
    const [cat, n] = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
    if (total >= 2 && n / total >= 0.8 && n > wordCount) { word = w; wordCat = cat; wordCount = n; }
  }
  if (word) return { categoryId: wordCat, by: 'guess', hint: word };

  const preset = guessPreset(merchant);
  if (!preset) return null;
  // The ready-made category if the user still has it, otherwise plain needs / wants.
  const ids = preset === 'ignore' ? ['ignore'] : [presetCategoryId(preset), presetBucket(preset)];
  const categoryId = ids.find((id) => model.valid.has(id));
  return categoryId ? { categoryId, by: 'guess' } : null;
}
