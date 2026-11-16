// Getting a file out of the app: a download in the browser, Android's share sheet on the phone
// (deploy/android/.../AppFilesPlugin.java), where the user picks where to save or send it.
import { registerPlugin } from '@capacitor/core';
import type { DB } from './types';
import { isNative } from './platform';
import { bucketName, categoryName } from './store';

const AppFiles = registerPlugin<{ share(o: { name: string; text: string; mime: string }): Promise<void> }>('AppFiles');

export async function saveFile(name: string, text: string, mime: string): Promise<void> {
  if (isNative()) return AppFiles.share({ name, text, mime });
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

/** Everything the app holds, as one file that "Restore from backup" reads back. */
export const exportBackup = (db: DB) => saveFile(`finance-backup-${today()}.json`, JSON.stringify(db, null, 2), 'application/json');

/** Every card transaction of every month as a spreadsheet (CSV that Excel and Sheets open). */
export function exportTransactions(db: DB, lang: 'he' | 'en'): Promise<void> {
  const cats = new Map(db.categories.map((c) => [c.id, c]));
  const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = lang === 'he' ? ['חודש', 'תאריך', 'בית עסק', 'סכום', 'קטגוריה', 'סוג', 'כרטיס', 'הערה'] : ['Month', 'Date', 'Merchant', 'Amount', 'Category', 'Type', 'Card', 'Note'];
  const rows = Object.keys(db.months).sort().flatMap((key) =>
    [...db.months[key].txs].sort((a, b) => a.date.localeCompare(b.date)).map((t) => {
      const c = t.categoryId ? cats.get(t.categoryId) : undefined;
      return [key, t.date, t.merchant, t.amount.toFixed(2), categoryName(c, lang), c ? bucketName(c.bucket, lang) : '', t.card, t.note ?? ''];
    }));
  // The leading mark makes Excel read Hebrew correctly.
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  return saveFile(`finance-transactions-${today()}.csv`, csv, 'text/csv');
}
