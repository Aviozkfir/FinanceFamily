export type Lang = 'he' | 'en';
export type Theme = 'dark' | 'light';
/**
 * needs and wants are spending. 'invest' is savings: it is not something a card transaction is
 * classified as, but what is left of the income after spending (a manual entry can mark money
 * already put aside). 'ignore' is for things that should not count at all.
 */
export type BucketId = 'needs' | 'wants' | 'invest' | 'ignore';
export type SpendBucket = Exclude<BucketId, 'ignore'>;
export const SPEND_BUCKETS: SpendBucket[] = ['needs', 'wants', 'invest'];

export interface Split { needs: number; wants: number; invest: number }

export interface Category {
  id: string;
  name: string;
  /** Which bucket this category counts toward in the 50/30/20 analysis. */
  bucket: BucketId;
  builtin?: boolean;
}

export interface Tx {
  id: string;
  fileId: string;
  card: string;
  /** Purchase date, YYYY-MM-DD. */
  date: string;
  merchant: string;
  /** Amount charged this month in ILS. Negative = refund. */
  amount: number;
  /** Original deal amount/currency when different from the charge (installments, foreign currency). */
  origAmount?: number;
  origCurrency?: string;
  voucher?: string;
  note?: string;
  installment?: { n: number; of: number };
  standing?: boolean;
  abroad?: boolean;
  /** Charged outside the monthly billing date (immediate debit). */
  offCycle?: boolean;
  categoryId: string | null;
  /** Who chose the category: the user, the classifier from a steady habit, or a guess. Absent = the user. */
  by?: 'user' | 'learned' | 'guess';
  /** For a guess: the known merchant or word it was based on. */
  hint?: string;
}

export interface IncomeItem { id: string; label: string; amount: number }

export interface ManualItem {
  id: string;
  kind: 'income' | 'expense';
  label: string;
  amount: number;
  categoryId: string | null;
}

export interface ImportedFile {
  id: string;
  name: string;
  card: string;
  /** Statement month detected in the file, YYYY-MM. */
  statementMonth?: string;
  count: number;
  total: number;
  /** Total printed in the statement, when found — used to verify the parse. */
  statedTotal?: number;
  importedAt: string;
}

export interface Goal { incomes: IncomeItem[]; split: Split; setAt: string }

export interface MonthData {
  key: string; // YYYY-MM
  goal?: Goal;
  incomes: IncomeItem[];
  files: ImportedFile[];
  txs: Tx[];
  manual: ManualItem[];
  analyzedAt?: string;
}

export interface Settings {
  lang: Lang;
  theme: Theme;
  split: Split;
}

export interface DB {
  version: 1;
  settings: Settings;
  categories: Category[];
  /** Merchant → category remembered by earlier versions. Read by the classifier (learn.ts), no longer written. */
  merchantRules: Record<string, string>;
  months: Record<string, MonthData>;
}
