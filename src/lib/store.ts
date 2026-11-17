import { create } from 'zustand';
import type { BucketId, Category, DB, IncomeItem, ImportedFile, Lang, ManualItem, MonthData, Settings, Split, Tx } from './types';
import { presetBucket, presetCategories, presetCategoryId, presetName } from './presets';
import { guessPreset } from './heuristics';
import { merchantKey, uid } from './format';
import { txIdentity, type ParsedStatement } from './parser/statement';
import { isNative } from './platform';
import { buildModel, suggest } from './learn';

export const DEFAULT_SPLIT: Split = { needs: 50, wants: 30, invest: 20 };

const BUILTIN: Category[] = [
  { id: 'needs', name: 'needs', bucket: 'needs', builtin: true },
  { id: 'wants', name: 'wants', bucket: 'wants', builtin: true },
  { id: 'invest', name: 'invest', bucket: 'invest', builtin: true },
  { id: 'ignore', name: 'ignore', bucket: 'ignore', builtin: true },
];

const emptyDb = (): DB => ({
  version: 1,
  settings: { lang: 'he', theme: 'dark', split: DEFAULT_SPLIT, billingDay: 10, subcategories: true, smartClassify: false },
  categories: [...BUILTIN, ...presetCategories()],
  merchantRules: {},
  months: {},
  recurring: [],
  presetsAdded: true,
  cardNames: {},
});

export const emptyMonth = (key: string): MonthData => ({ key, incomes: [], files: [], txs: [], manual: [] });

/**
 * Brings data saved by an earlier version up to date:
 * - card transactions can no longer be "savings" (savings is what is left of the income), so
 *   ones marked that way become "don't count" — which keeps them out of spending, as before;
 * - whatever the removed AI assistant stored is dropped.
 */
function normalize(raw: DB): DB {
  const base = emptyDb();
  const { aiProvider: _p, aiModel: _m, ...settings } = { ...base.settings, ...raw.settings } as Settings & { aiProvider?: unknown; aiModel?: unknown };
  let categories = raw.categories?.length ? raw.categories : base.categories;
  // First run of a version with ready-made categories: add them, and move what the built-in list
  // can place (a supermarket under plain "needs" becomes "groceries"). The bucket never changes,
  // so no total moves.
  const addPresets = !raw.presetsAdded;
  if (addPresets) categories = [...categories, ...presetCategories().filter((p) => !categories.some((c) => c.id === p.id))];
  const refine = (merchant: string, categoryId: string | null): string | null => {
    if (!addPresets || (categoryId !== 'needs' && categoryId !== 'wants')) return categoryId;
    const preset = guessPreset(merchant);
    return preset && preset !== 'ignore' && presetBucket(preset) === categoryId ? presetCategoryId(preset) : categoryId;
  };
  const savings = new Set(categories.filter((c) => c.bucket === 'invest').map((c) => c.id));
  const months = Object.fromEntries(Object.entries(raw.months ?? {}).map(([k, month]) => {
    const { ai: _ai, ...m } = month as MonthData & { ai?: unknown };
    return [k, { ...m, txs: (m.txs ?? []).map((t) => (t.categoryId && savings.has(t.categoryId) ? { ...t, categoryId: 'ignore' } : { ...t, categoryId: refine(t.merchant, t.categoryId) })) }];
  }));
  const merchantRules = Object.fromEntries(Object.entries(raw.merchantRules ?? {}).map(([k, c]) => [k, savings.has(c) ? 'ignore' : refine(k, c)!]));
  return { version: 1, settings, categories, merchantRules, months, recurring: raw.recurring ?? [], presetsAdded: true, cardNames: raw.cardNames ?? {} };
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Store {
  db: DB;
  ready: boolean;
  offline: boolean;
  saveState: SaveState;
  load: () => Promise<void>;
  setSettings: (patch: Partial<Settings>) => void;
  updateMonth: (key: string, fn: (m: MonthData) => MonthData) => void;
  setGoal: (key: string, incomes: IncomeItem[], split: Split) => void;
  clearGoal: (key: string) => void;
  importStatements: (key: string, parsed: ParsedStatement[]) => { added: number; skipped: number };
  removeFile: (key: string, fileId: string) => void;
  moveFile: (from: string, fileId: string, to: string) => void;
  /** The user puts transactions in a category (or back in the pool with null). This is what the classifier learns from. */
  assign: (key: string, txIds: string[], categoryId: string | null) => void;
  /** The user accepts the classifier's choice for these transactions as it is. */
  confirm: (key: string, txIds: string[]) => void;
  /** Runs the classifier on the month's unclassified transactions; returns how many it placed. */
  suggestRest: (key: string) => number;
  addCategory: (name: string, bucket: BucketId) => string;
  updateCategory: (id: string, patch: Partial<Pick<Category, 'name' | 'bucket'>>) => void;
  removeCategory: (id: string) => void;
  setManual: (key: string, items: ManualItem[]) => void;
  /** Makes a manual line a standing order (it is then added to every later month), or stops it being one. */
  setRepeat: (key: string, itemId: string, on: boolean) => void;
  /** Copies into a month the standing orders it does not have yet. Safe to call any time. */
  applyRecurring: (key: string) => void;
  setIncomes: (key: string, items: IncomeItem[]) => void;
  /** Gives a card a name; an empty name goes back to its last four digits. */
  setCardName: (card: string, name: string) => void;
  deleteMonth: (key: string) => void;
  replaceDb: (db: DB) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<Store>((set, get) => {
  const persist = () => {
    clearTimeout(saveTimer);
    set({ saveState: 'saving' });
    saveTimer = setTimeout(async () => {
      const db = get().db;
      let local = true;
      try { localStorage.setItem('finance-db', JSON.stringify(db)); } catch { local = false; /* quota */ }
      if (isNative()) return set({ saveState: local ? 'saved' : 'error' }); // on the phone the device copy is the only copy
      try {
        const res = await fetch('/api/db', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db) });
        if (!res.ok) throw new Error(String(res.status));
        set({ saveState: 'saved', offline: false });
      } catch {
        set({ saveState: 'error', offline: true });
      }
    }, 400);
  };
  const mutate = (fn: (db: DB) => DB) => { set((s) => ({ db: fn(s.db) })); persist(); };
  const withMonth = (db: DB, key: string, fn: (m: MonthData) => MonthData): DB => ({
    ...db,
    months: { ...db.months, [key]: fn(db.months[key] ?? emptyMonth(key)) },
  });

  const pendingRecurring = (db: DB, key: string) => {
    const applied = new Set(db.months[key]?.recurringApplied ?? []);
    return db.recurring.filter((r) => r.since <= key && !applied.has(r.id));
  };
  const withRecurring = (db: DB, key: string): DB => {
    const pending = pendingRecurring(db, key);
    if (!pending.length) return db;
    return withMonth(db, key, (m) => ({
      ...m,
      manual: [...m.manual, ...pending.map((r) => ({ id: uid(), kind: r.kind, label: r.label, amount: r.amount, categoryId: r.categoryId, repeat: r.id }))],
      recurringApplied: [...(m.recurringApplied ?? []), ...pending.map((r) => r.id)],
    }));
  };

  return {
    db: emptyDb(),
    ready: false,
    offline: false,
    saveState: 'idle',

    load: async () => {
      let db: DB | null = null, offline = false;
      try {
        if (isNative()) throw new Error('no server on the phone');
        const res = await fetch('/api/db');
        if (!res.ok) throw new Error();
        db = await res.json();
      } catch {
        offline = true;
        try { db = JSON.parse(localStorage.getItem('finance-db') ?? 'null'); } catch { db = null; }
      }
      try { localStorage.removeItem('finance-api-key'); } catch { /* key of the removed AI assistant */ }
      set({ db: db ? normalize(db) : emptyDb(), ready: true, offline: offline && !isNative() });
    },

    setSettings: (patch) => mutate((db) => ({ ...db, settings: { ...db.settings, ...patch } })),
    updateMonth: (key, fn) => mutate((db) => withMonth(db, key, fn)),

    setGoal: (key, incomes, split) =>
      mutate((db) => withMonth(db, key, (m) => ({ ...m, goal: { incomes, split, setAt: new Date().toISOString() } }))),
    clearGoal: (key) => mutate((db) => withMonth(db, key, ({ goal: _g, ...m }) => m)),

    importStatements: (key, parsed) => {
      let added = 0, skipped = 0;
      mutate((db) => {
        const month = db.months[key] ?? emptyMonth(key);
        const seen = new Set(month.txs.map(txIdentity));
        const model = buildModel(db);
        const files: ImportedFile[] = [...month.files];
        const txs: Tx[] = [...month.txs];
        for (const p of parsed) {
          const fileId = uid();
          const fresh: Tx[] = [];
          for (const t of p.txs) {
            const idKey = txIdentity(t);
            if (seen.has(idKey)) { skipped++; continue; }
            seen.add(idKey);
            // Only smart classification places anything by itself; otherwise every transaction waits for the user.
            const s = db.settings.smartClassify ? suggest(model, t.merchant) : null;
            fresh.push({ ...t, fileId, categoryId: s?.categoryId ?? null, ...(s ? { by: s.by, ...(s.hint ? { hint: s.hint } : {}) } : {}) });
          }
          if (!fresh.length) continue;
          added += fresh.length;
          txs.push(...fresh);
          files.push({
            id: fileId, name: p.fileName, card: p.card, statementMonth: p.statementMonth,
            count: fresh.length, total: fresh.reduce((s, t) => s + t.amount, 0),
            statedTotal: p.statedTotal, importedAt: new Date().toISOString(),
          });
        }
        return withRecurring(withMonth(db, key, (m) => ({ ...m, files, txs })), key);
      });
      return { added, skipped };
    },

    removeFile: (key, fileId) =>
      mutate((db) => withMonth(db, key, (m) => ({
        ...m, files: m.files.filter((f) => f.id !== fileId), txs: m.txs.filter((t) => t.fileId !== fileId),
      }))),

    moveFile: (from, fileId, to) =>
      mutate((db) => {
        const src = db.months[from];
        const file = src?.files.find((f) => f.id === fileId);
        if (!src || !file || from === to) return db;
        const moving = src.txs.filter((t) => t.fileId === fileId);
        let next = withMonth(db, from, (m) => ({ ...m, files: m.files.filter((f) => f.id !== fileId), txs: m.txs.filter((t) => t.fileId !== fileId) }));
        next = withMonth(next, to, (m) => {
          const seen = new Set(m.txs.map(txIdentity));
          const fresh = moving.filter((t) => !seen.has(txIdentity(t)));
          return { ...m, files: [...m.files, { ...file, count: fresh.length, total: fresh.reduce((s, t) => s + t.amount, 0) }], txs: [...m.txs, ...fresh] };
        });
        return next;
      }),

    assign: (key, txIds, categoryId) =>
      mutate((db) => {
        const ids = new Set(txIds);
        // A merchant the user sends back to the pool should not come back from an old remembered rule.
        const rules = { ...db.merchantRules };
        return { ...withMonth(db, key, (m) => ({
          ...m,
          txs: m.txs.map((t) => {
            if (!ids.has(t.id)) return t;
            const { by: _by, hint: _hint, ...rest } = t;
            if (!categoryId) delete rules[merchantKey(t.merchant)];
            return categoryId ? { ...rest, categoryId, by: 'user' as const } : { ...rest, categoryId: null };
          }),
        })), merchantRules: rules };
      }),

    confirm: (key, txIds) =>
      mutate((db) => {
        const ids = new Set(txIds);
        return withMonth(db, key, (m) => ({
          ...m,
          txs: m.txs.map((t) => {
            if (!ids.has(t.id) || !t.categoryId) return t;
            const { hint: _hint, ...rest } = t;
            return { ...rest, by: 'user' as const };
          }),
        }));
      }),

    suggestRest: (key) => {
      let n = 0;
      mutate((db) => {
        const model = buildModel(db);
        return withMonth(db, key, (m) => ({
          ...m,
          txs: m.txs.map((t) => {
            if (t.categoryId) return t;
            const s = suggest(model, t.merchant);
            if (!s) return t;
            n++;
            return { ...t, categoryId: s.categoryId, by: s.by, ...(s.hint ? { hint: s.hint } : {}) };
          }),
        }));
      });
      return n;
    },

    addCategory: (name, bucket) => {
      const id = uid();
      mutate((db) => ({ ...db, categories: [...db.categories, { id, name: name.trim(), bucket }] }));
      return id;
    },
    updateCategory: (id, patch) =>
      mutate((db) => ({ ...db, categories: db.categories.map((c) => (c.id === id && !c.builtin ? { ...c, ...patch } : c)) })),
    removeCategory: (id) =>
      mutate((db) => {
        if (db.categories.find((c) => c.id === id)?.builtin) return db;
        const months = Object.fromEntries(Object.entries(db.months).map(([k, m]) => [k, {
          ...m,
          txs: m.txs.map((t) => { if (t.categoryId !== id) return t; const { by: _by, hint: _hint, ...rest } = t; return { ...rest, categoryId: null }; }),
          manual: m.manual.map((x) => (x.categoryId === id ? { ...x, categoryId: null } : x)),
        }]));
        const merchantRules = Object.fromEntries(Object.entries(db.merchantRules).filter(([, c]) => c !== id));
        return { ...db, categories: db.categories.filter((c) => c.id !== id), months, merchantRules };
      }),

    // Editing a standing order's line also updates the standing order, so later months get the new values.
    setManual: (key, items) => mutate((db) => {
      const byId = new Map(items.filter((x) => x.repeat).map((x) => [x.repeat!, x]));
      const recurring = db.recurring.map((r) => { const x = byId.get(r.id); return x ? { ...r, kind: x.kind, label: x.label, amount: x.amount, categoryId: x.categoryId } : r; });
      return { ...withMonth(db, key, (m) => ({ ...m, manual: items })), recurring };
    }),
    setRepeat: (key, itemId, on) => mutate((db) => {
      const item = db.months[key]?.manual.find((x) => x.id === itemId);
      if (!item) return db;
      if (!on) {
        return { ...withMonth(db, key, (m) => ({ ...m, manual: m.manual.map((x) => { if (x.id !== itemId) return x; const { repeat: _r, ...rest } = x; return rest; }) })),
          recurring: db.recurring.filter((r) => r.id !== item.repeat) };
      }
      const id = uid();
      return { ...withMonth(db, key, (m) => ({ ...m, manual: m.manual.map((x) => (x.id === itemId ? { ...x, repeat: id } : x)), recurringApplied: [...(m.recurringApplied ?? []), id] })),
        recurring: [...db.recurring, { id, kind: item.kind, label: item.label, amount: item.amount, categoryId: item.categoryId, since: key }] };
    }),
    applyRecurring: (key) => { if (pendingRecurring(get().db, key).length) mutate((db) => withRecurring(db, key)); },
    setIncomes: (key, items) => mutate((db) => withMonth(db, key, (m) => ({ ...m, incomes: items }))),
    setCardName: (card, name) => mutate((db) => {
      const cardNames = { ...db.cardNames };
      if (name.trim()) cardNames[card] = name.trim(); else delete cardNames[card];
      return { ...db, cardNames };
    }),
    deleteMonth: (key) => mutate((db) => { const { [key]: _gone, ...months } = db.months; return { ...db, months }; }),
    replaceDb: (db) => mutate(() => normalize(db)),
  };
});

// ----- language helpers -----
export const useLang = (): Lang => useStore((s) => s.db.settings.lang);
/** Returns a picker: L('עברית', 'English'). */
export function useL() {
  const lang = useLang();
  return (he: string, en: string) => (lang === 'he' ? he : en);
}

const BUCKET_NAMES: Record<BucketId, [string, string]> = {
  needs: ['צרכים', 'Needs'],
  wants: ['רצונות', 'Wants'],
  invest: ['חיסכון', 'Savings'],
  ignore: ['לא לספור', "Don't count"],
};
export const bucketName = (b: BucketId, lang: Lang) => BUCKET_NAMES[b][lang === 'he' ? 0 : 1];
const OTHER: Partial<Record<BucketId, [string, string]>> = { needs: ['צרכים אחרים', 'Other needs'], wants: ['רצונות אחרים', 'Other wants'] };
/** Plain "needs" and "wants" read as "other needs / wants": what did not fit a more specific category. */
export const categoryName = (c: Category | undefined, lang: Lang) =>
  !c ? (lang === 'he' ? 'לא מסווג' : 'Unclassified')
    : c.builtin ? OTHER[c.bucket]?.[lang === 'he' ? 0 : 1] ?? bucketName(c.bucket, lang)
      : c.name || (c.preset && presetName(c.preset, lang)) || '';
export const sumItems = (items: { amount: number }[]) => items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

/** A card as people know it: the name they gave it, or its last four digits. */
export const cardLabel = (names: Record<string, string> | undefined, card: string) => names?.[card] || `•••• ${card}`;
export const useCardLabel = () => {
  const names = useStore((s) => s.db.cardNames);
  return (card: string) => cardLabel(names, card);
};

/**
 * The categories offered for classifying, in display order: needs, wants, "don't count", the
 * plain one of each bucket last. Without sub-categories only the plain ones are offered.
 */
export function offeredCategories(db: DB): Category[] {
  return (['needs', 'wants', 'ignore'] as BucketId[]).flatMap((b) => {
    const inB = db.categories.filter((c) => c.bucket === b);
    return db.settings.subcategories ? [...inB.filter((c) => !c.builtin), ...inB.filter((c) => c.builtin)] : inB.filter((c) => c.builtin);
  });
}
/** Without sub-categories, a transaction filed under one is shown under its bucket. */
export const shownCategoryId = (db: DB, id: string | null): string | null => {
  if (!id || db.settings.subcategories) return id;
  return db.categories.find((c) => c.id === id)?.bucket ?? id;
};
/** The name of a category as shown: without sub-categories the plain ones read "Needs", not "Other needs". */
export const shownCategoryName = (db: DB, c: Category | undefined, lang: Lang) =>
  c && c.builtin && !db.settings.subcategories ? bucketName(c.bucket, lang) : categoryName(c, lang);
