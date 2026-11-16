import type { Lang } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const loc = (lang: Lang) => (lang === 'he' ? 'he-IL' : 'en-IL');

/** ₪1,234 — whole shekels by default; pass `agorot` for exact amounts. */
export function money(n: number, lang: Lang, agorot = false): string {
  const digits = agorot && !Number.isInteger(n) ? 2 : 0;
  const s = new Intl.NumberFormat(loc(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(n));
  // Sign and symbol are placed by hand so they read the same in RTL and LTR.
  // Wrapped in a left-to-right isolate so the sign stays in front of the number inside Hebrew text.
  return `⁦${n < 0 ? '−' : ''}₪${s}⁩`;
}

/** Compact axis label: 0 / 500 / 1,000 / 12K */
export function moneyCompact(n: number, compact: boolean): string {
  if (compact) return n === 0 ? '0' : `${+(n / 1000).toFixed(1)}K`;
  return new Intl.NumberFormat('en-US').format(n);
}

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

// ----- months -----
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const currentMonth = () => monthKey(new Date());
export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
}
export function monthLabel(key: string, lang: Lang, short = false): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(loc(lang), { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric' }).format(new Date(y, m - 1, 1));
}
export function dayLabel(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(loc(lang), { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
}
export const isMonthKey = (s: string | undefined): s is string => !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** Round a chart maximum up to a clean tick step. Returns [max, step]. */
export function niceScale(max: number, ticks = 4): [number, number] {
  if (max <= 0) return [1, 1];
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  return [Math.ceil(max / step) * step, step];
}

/** Merchant key for rules: lower-cased, punctuation and extra spaces removed. */
export const merchantKey = (name: string) =>
  name.toLowerCase().replace(/[‎‏‪-‮]/g, '').replace(/["'׳״.,\-()*]/g, ' ').replace(/\s+/g, ' ').trim();
