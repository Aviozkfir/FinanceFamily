// Pure month analysis: everything the analysis screen and the AI assistant need.
import type { BucketId, Category, DB, MonthData, SpendBucket, Split, Tx } from '../types';
import { SPEND_BUCKETS } from '../types';
import { merchantKey, shiftMonth } from '../format';
import { DEFAULT_SPLIT, sumItems } from '../store';

export interface MerchantRow { name: string; total: number; count: number; bucket: BucketId | null; categoryId: string | null }
export interface CategoryRow { id: string; bucket: BucketId; total: number; count: number }
export interface InstallmentRow { merchant: string; amount: number; n: number; of: number; remaining: number; remainingTotal: number }

export interface MonthAnalysis {
  key: string;
  hasData: boolean;
  income: number;
  /** What the targets are based on: the goal set in advance, or actual income. */
  basis: 'goal' | 'income' | 'none';
  goalIncome: number | null;
  split: Split;
  target: Record<SpendBucket, number>;
  spent: Record<SpendBucket, number>;
  ignored: number;
  unclassified: { total: number; count: number };
  totalSpent: number;
  /** Income minus everything spent or put aside. */
  leftover: number;
  /** Share of income that was saved: explicit savings plus what was left over. */
  savingsRate: number | null;
  categories: CategoryRow[];
  merchants: MerchantRow[];
  daily: { date: string; total: number }[];
  standing: { merchant: string; amount: number }[];
  installments: InstallmentRow[];
  small: { count: number; total: number };
  refunds: { count: number; total: number };
  abroad: { count: number; total: number };
  largest: Tx[];
  cardTotal: number;
  manualExpense: number;
  txCount: number;
}

export const SMALL_PURCHASE = 30;

export function effectiveSplit(month: MonthData | undefined, db: DB): Split {
  return month?.goal?.split ?? db.settings.split ?? DEFAULT_SPLIT;
}

export function analyzeMonth(month: MonthData, db: DB): MonthAnalysis {
  const cats = new Map<string, Category>(db.categories.map((c) => [c.id, c]));
  const bucketOf = (categoryId: string | null): BucketId | null => (categoryId ? cats.get(categoryId)?.bucket ?? null : null);

  const manualIncome = sumItems(month.manual.filter((m) => m.kind === 'income'));
  const income = sumItems(month.incomes) + manualIncome;
  const goalIncome = month.goal ? sumItems(month.goal.incomes) : null;
  const split = effectiveSplit(month, db);
  const basis: MonthAnalysis['basis'] = goalIncome ? 'goal' : income > 0 ? 'income' : 'none';
  const base = goalIncome || income;
  const target = { needs: (base * split.needs) / 100, wants: (base * split.wants) / 100, invest: (base * split.invest) / 100 };

  const spent = { needs: 0, wants: 0, invest: 0 };
  const catRows = new Map<string, CategoryRow>();
  const merchantRows = new Map<string, MerchantRow>();
  const dailyMap = new Map<string, number>();
  let ignored = 0, unTotal = 0, unCount = 0;

  const add = (amount: number, categoryId: string | null) => {
    const bucket = bucketOf(categoryId);
    if (!bucket) { unTotal += amount; unCount++; return; }
    if (bucket === 'ignore') { ignored += amount; return; }
    spent[bucket] += amount;
    const row = catRows.get(categoryId!) ?? { id: categoryId!, bucket, total: 0, count: 0 };
    row.total += amount; row.count++;
    catRows.set(categoryId!, row);
  };

  for (const t of month.txs) {
    add(t.amount, t.categoryId);
    const bucket = bucketOf(t.categoryId);
    if (bucket === 'ignore') continue;
    const k = merchantKey(t.merchant);
    const row = merchantRows.get(k) ?? { name: t.merchant, total: 0, count: 0, bucket, categoryId: t.categoryId };
    row.total += t.amount; row.count++;
    merchantRows.set(k, row);
    dailyMap.set(t.date, (dailyMap.get(t.date) ?? 0) + t.amount);
  }
  const manualExpenses = month.manual.filter((m) => m.kind === 'expense');
  for (const m of manualExpenses) add(Number(m.amount) || 0, m.categoryId);

  const counted = month.txs.filter((t) => bucketOf(t.categoryId) !== 'ignore');
  const totalSpent = spent.needs + spent.wants + spent.invest + unTotal;
  const leftover = income - totalSpent;
  const small = counted.filter((t) => t.amount > 0 && t.amount < SMALL_PURCHASE);
  const refunds = counted.filter((t) => t.amount < 0);
  const abroad = counted.filter((t) => t.abroad && t.amount > 0);

  return {
    key: month.key,
    hasData: month.txs.length > 0 || month.manual.length > 0 || income > 0,
    income, basis, goalIncome, split, target, spent, ignored,
    unclassified: { total: unTotal, count: unCount },
    totalSpent, leftover,
    savingsRate: income > 0 ? (spent.invest + Math.max(leftover, 0)) / income : null,
    categories: [...catRows.values()].sort((a, b) => b.total - a.total),
    merchants: [...merchantRows.values()].sort((a, b) => b.total - a.total),
    daily: [...dailyMap.entries()].map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date)),
    standing: counted.filter((t) => t.standing && t.amount > 0).map((t) => ({ merchant: t.merchant, amount: t.amount })).sort((a, b) => b.amount - a.amount),
    installments: counted.filter((t) => t.installment).map((t) => {
      const remaining = t.installment!.of - t.installment!.n;
      return { merchant: t.merchant, amount: t.amount, n: t.installment!.n, of: t.installment!.of, remaining, remainingTotal: remaining * t.amount };
    }).sort((a, b) => b.remainingTotal - a.remainingTotal),
    small: { count: small.length, total: small.reduce((s, t) => s + t.amount, 0) },
    refunds: { count: refunds.length, total: refunds.reduce((s, t) => s + t.amount, 0) },
    abroad: { count: abroad.length, total: abroad.reduce((s, t) => s + t.amount, 0) },
    largest: [...counted].sort((a, b) => b.amount - a.amount).slice(0, 5),
    cardTotal: month.txs.reduce((s, t) => s + t.amount, 0),
    manualExpense: sumItems(manualExpenses),
    txCount: month.txs.length,
  };
}

/** Months that hold real data, oldest first. */
export const filledMonths = (db: DB): string[] =>
  Object.values(db.months).filter((m) => m.txs.length || m.manual.length || m.incomes.length).map((m) => m.key).sort();

export function previousAnalysis(key: string, db: DB): MonthAnalysis | null {
  const prev = db.months[shiftMonth(key, -1)];
  return prev && (prev.txs.length || prev.manual.length) ? analyzeMonth(prev, db) : null;
}

export { SPEND_BUCKETS };
