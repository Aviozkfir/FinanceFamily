import { create } from 'zustand';
import type { AiState, BucketId, Category, DB, IncomeItem, ImportedFile, Lang, ManualItem, MonthData, Settings, Split, Tx } from './types';
import { merchantKey, uid } from './format';
import { txIdentity, type ParsedStatement } from './parser/statement';
import { isNative } from './platform';

export const DEFAULT_SPLIT: Split = { needs: 50, wants: 30, invest: 20 };

const BUILTIN: Category[] = [
  { id: 'needs', name: 'needs', bucket: 'needs', builtin: true },
  { id: 'wants', name: 'wants', bucket: 'wants', builtin: true },
  { id: 'invest', name: 'invest', bucket: 'invest', builtin: true },
  { id: 'ignore', name: 'ignore', bucket: 'ignore', builtin: true },
];

const emptyDb = (): DB => ({
  version: 1,
  settings: { lang: 'he', theme: 'dark', split: DEFAULT_SPLIT, aiProvider: 'auto', aiModel: '' },
  categories: BUILTIN,
  merchantRules: {},
  months: {},
  trendAi: {},
});

export const emptyMonth = (key: string): MonthData => ({ key, incomes: [], files: [], txs: [], manual: [], ai: { chat: [] } });

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
  assign: (key: string, txIds: string[], categoryId: string | null) => void;
  applyRules: (key: string, extra?: Record<string, string>) => number;
  addCategory: (name: string, bucket: BucketId) => string;
  updateCategory: (id: string, patch: Partial<Pick<Category, 'name' | 'bucket'>>) => void;
  removeCategory: (id: string) => void;
  setManual: (key: string, items: ManualItem[]) => void;
  setIncomes: (key: string, items: IncomeItem[]) => void;
  setMonthAi: (key: string, fn: (ai: AiState) => AiState) => void;
  setTrendAi: (key: string, fn: (ai: AiState) => AiState) => void;
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
      const base = emptyDb();
      const merged: DB = db ? { ...base, ...db, settings: { ...base.settings, ...db.settings } } : base;
      set({ db: merged, ready: true, offline: offline && !isNative() });
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
        const files: ImportedFile[] = [...month.files];
        const txs: Tx[] = [...month.txs];
        for (const p of parsed) {
          const fileId = uid();
          const fresh: Tx[] = [];
          for (const t of p.txs) {
            const idKey = txIdentity(t);
            if (seen.has(idKey)) { skipped++; continue; }
            seen.add(idKey);
            const rule = db.merchantRules[merchantKey(t.merchant)];
            const known = rule && db.categories.some((c) => c.id === rule);
            fresh.push({ ...t, fileId, categoryId: known ? rule : null });
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
        return withMonth(db, key, (m) => ({ ...m, files, txs }));
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
        const rules = { ...db.merchantRules };
        const month = db.months[key] ?? emptyMonth(key);
        const txs = month.txs.map((t) => {
          if (!ids.has(t.id)) return t;
          const k = merchantKey(t.merchant);
          if (categoryId) rules[k] = categoryId; else delete rules[k];
          return { ...t, categoryId };
        });
        return { ...withMonth(db, key, (m) => ({ ...m, txs })), merchantRules: rules };
      }),

    applyRules: (key, extra = {}) => {
      let n = 0;
      mutate((db) => {
        const valid = new Set(db.categories.map((c) => c.id));
        const rules = { ...db.merchantRules };
        const txs = (db.months[key]?.txs ?? []).map((t) => {
          if (t.categoryId) return t;
          const k = merchantKey(t.merchant);
          const cat = rules[k] ?? extra[k];
          if (!cat || !valid.has(cat)) return t;
          n++;
          return { ...t, categoryId: cat };
        });
        return withMonth(db, key, (m) => ({ ...m, txs }));
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
          txs: m.txs.map((t) => (t.categoryId === id ? { ...t, categoryId: null } : t)),
          manual: m.manual.map((x) => (x.categoryId === id ? { ...x, categoryId: null } : x)),
        }]));
        const merchantRules = Object.fromEntries(Object.entries(db.merchantRules).filter(([, c]) => c !== id));
        return { ...db, categories: db.categories.filter((c) => c.id !== id), months, merchantRules };
      }),

    setManual: (key, items) => mutate((db) => withMonth(db, key, (m) => ({ ...m, manual: items }))),
    setIncomes: (key, items) => mutate((db) => withMonth(db, key, (m) => ({ ...m, incomes: items }))),
    setMonthAi: (key, fn) => mutate((db) => withMonth(db, key, (m) => ({ ...m, ai: fn(m.ai ?? { chat: [] }) }))),
    setTrendAi: (key, fn) => mutate((db) => ({ ...db, trendAi: { ...db.trendAi, [key]: fn(db.trendAi[key] ?? { chat: [] }) } })),
    deleteMonth: (key) => mutate((db) => { const { [key]: _gone, ...months } = db.months; return { ...db, months }; }),
    replaceDb: (db) => mutate(() => ({ ...emptyDb(), ...db })),
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
  invest: ['חיסכון והשקעות', 'Savings & investing'],
  ignore: ['לא לספור', "Don't count"],
};
export const bucketName = (b: BucketId, lang: Lang) => BUCKET_NAMES[b][lang === 'he' ? 0 : 1];
export const categoryName = (c: Category | undefined, lang: Lang) =>
  !c ? (lang === 'he' ? 'לא מסווג' : 'Unclassified') : c.builtin ? bucketName(c.bucket, lang) : c.name;
export const sumItems = (items: { amount: number }[]) => items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
