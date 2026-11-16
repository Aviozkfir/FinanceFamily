// Next-month forecast from the months already filled in.
import type { DB, SpendBucket } from '../types';
import { SPEND_BUCKETS } from '../types';
import { shiftMonth } from '../format';
import { analyzeMonth, type MonthAnalysis } from './compute';

export interface Forecast {
  /** The month being predicted. */
  month: string;
  basedOn: string[];
  byBucket: Record<SpendBucket, { expected: number; low: number; high: number }>;
  total: number;
  income: number;
  /** Charges already known for next month. */
  committed: { installments: { merchant: string; amount: number; n: number; of: number }[]; standing: { merchant: string; amount: number }[]; total: number };
  /** Monthly change in total spending (₪ per month), when there are 3+ months. */
  trend: number | null;
}

/** Recent months weigh more: weights 1, 2, 3 … with the newest last. */
function weightedAvg(values: number[]): number {
  let sum = 0, wsum = 0;
  values.forEach((v, i) => { sum += v * (i + 1); wsum += i + 1; });
  return wsum ? sum / wsum : 0;
}

function slope(values: number[]): number {
  const n = values.length;
  const mx = (n - 1) / 2, my = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  values.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  return den ? num / den : 0;
}

export function buildForecast(analyses: MonthAnalysis[], db: DB): Forecast | null {
  const months = analyses.filter((a) => a.totalSpent > 0).sort((a, b) => a.key.localeCompare(b.key)).slice(-6);
  if (!months.length) return null;
  const last = months[months.length - 1];

  const byBucket = {} as Forecast['byBucket'];
  for (const b of SPEND_BUCKETS) {
    const vals = months.map((m) => m.spent[b]);
    byBucket[b] = { expected: weightedAvg(vals), low: Math.min(...vals), high: Math.max(...vals) };
  }
  // Unclassified spending still happens next month; fold it into the total.
  const unclassified = weightedAvg(months.map((m) => m.unclassified.total));
  const incomes = months.map((m) => m.income).filter((v) => v > 0);

  const lastMonth = db.months[last.key];
  const ignore = new Set(db.categories.filter((c) => c.bucket === 'ignore' || c.bucket === 'invest').map((c) => c.id));
  const counted = (lastMonth?.txs ?? []).filter((t) => !t.categoryId || !ignore.has(t.categoryId));
  const installments = counted
    .filter((t) => t.installment && t.installment.n < t.installment.of)
    .map((t) => ({ merchant: t.merchant, amount: t.amount, n: t.installment!.n + 1, of: t.installment!.of }));
  const standing = counted.filter((t) => t.standing && t.amount > 0).map((t) => ({ merchant: t.merchant, amount: t.amount }));

  return {
    month: shiftMonth(last.key, 1),
    basedOn: months.map((m) => m.key),
    byBucket,
    total: byBucket.needs.expected + byBucket.wants.expected + unclassified,
    income: incomes.length ? weightedAvg(incomes) : 0,
    committed: { installments, standing, total: [...installments, ...standing].reduce((s, x) => s + x.amount, 0) },
    trend: months.length >= 3 ? slope(months.map((m) => m.totalSpent)) : null,
  };
}

export const analyzeMany = (keys: string[], db: DB): MonthAnalysis[] =>
  keys.filter((k) => db.months[k]).sort().map((k) => analyzeMonth(db.months[k], db));
