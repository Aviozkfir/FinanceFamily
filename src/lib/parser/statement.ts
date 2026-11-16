// Parses credit card statements exported to Excel/CSV.
// Verified against Isracard exports ("1234_11_2026.xlsx" = card 1234, statement of November 2026).
// Headers are matched by text, so Max / Cal style sheets with the same columns work too.
import * as XLSX from 'xlsx';
import type { Tx } from '../types';
import { uid } from '../format';

export interface ParsedStatement {
  fileName: string;
  card: string;
  statementMonth?: string;
  txs: Omit<Tx, 'fileId' | 'categoryId'>[];
  /** Total printed in the statement for the regular billing table. */
  statedTotal?: number;
}

type Cell = string | number | Date | null | undefined;

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const clean = (v: Cell) => (v == null ? '' : String(v)).replace(/[‎‏‪-‮ ]/g, ' ').replace(/\s+/g, ' ').trim();

const COLS: Record<string, RegExp> = {
  date: /תאריך (ה?רכישה|ה?עסקה)/,
  merchant: /שם (ה?בית ה?עסק|בית עסק)/,
  dealAmount: /סכום (ה?עסקה|מקורי)/,
  dealCurrency: /מטבע (ה?עסקה|מקור)/,
  charge: /סכום (ה?חיוב|לחיוב)/,
  voucher: /שובר/,
  note: /פירוט נוסף|הערות|פרטים/,
};

function parseDate(v: Cell): string | null {
  if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const m = clean(v).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mo = Number(m[2]), day = Number(m[1]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseAmount(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = clean(v).replace(/[₪$€£,\s]/g, '').replace(/−/g, '-');
  if (!s || !/^-?\d+(\.\d+)?-?$/.test(s)) return null;
  const n = s.endsWith('-') ? -parseFloat(s) : parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function fromFileName(name: string): { card?: string; month?: string } {
  const m = name.match(/(\d{4})[_-](\d{1,2})[_-](\d{4})/);
  if (!m) return {};
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? { card: m[1], month: `${m[3]}-${String(mo).padStart(2, '0')}` } : { card: m[1] };
}

export function parseRows(rows: Cell[][], fileName: string): ParsedStatement {
  const fn = fromFileName(fileName);
  let card = fn.card ?? '';
  let statementMonth = fn.month;
  let statedTotal: number | undefined;
  const txs: ParsedStatement['txs'] = [];

  // Card number and statement month from the heading lines.
  for (const row of rows.slice(0, 15)) {
    for (const cell of row) {
      const s = clean(cell);
      if (!s) continue;
      if (!card) {
        const c = s.match(/(?:-|כרטיס|מספר)\s*(\d{4})$/);
        if (c) card = c[1];
      }
      if (!statementMonth) {
        const mm = s.match(new RegExp(`^(${HE_MONTHS.join('|')})\\s+(\\d{4})$`));
        if (mm) statementMonth = `${mm[2]}-${String(HE_MONTHS.indexOf(mm[1]) + 1).padStart(2, '0')}`;
      }
    }
  }

  for (let r = 0; r < rows.length; r++) {
    const header = rows[r].map(clean);
    const col: Record<string, number> = {};
    for (const [key, re] of Object.entries(COLS)) {
      const i = header.findIndex((h) => re.test(h));
      if (i >= 0) col[key] = i;
    }
    if (col.date == null || col.merchant == null || col.charge == null) continue;

    // The title above the table tells regular charges from immediate ("off-cycle") ones.
    const title = [rows[r - 1], rows[r - 2]].map((row) => (row ?? []).map(clean).join(' ')).join(' ');
    const offCycle = /מחוץ למועד|חיוב מיידי|חיוב מידי/.test(title);

    let i = r + 1;
    for (; i < rows.length; i++) {
      const row = rows[i];
      const date = parseDate(row[col.date]);
      const amount = parseAmount(row[col.charge]);
      const merchant = clean(row[col.merchant]);
      if (!date || amount == null || !merchant) {
        if (/סה"כ|סך הכל|סה״כ/.test(merchant) && amount != null && !offCycle) statedTotal = (statedTotal ?? 0) + amount;
        break;
      }
      const note = col.note != null ? clean(row[col.note]) : '';
      const inst = note.match(/תשלום (\d+) מתוך (\d+)/);
      const dealAmount = col.dealAmount != null ? parseAmount(row[col.dealAmount]) : null;
      const dealCurrency = col.dealCurrency != null ? clean(row[col.dealCurrency]) : '';
      const differs = dealAmount != null && Math.abs(dealAmount - amount) > 0.005;
      txs.push({
        id: uid(),
        card,
        date,
        merchant,
        amount,
        ...(differs ? { origAmount: dealAmount!, origCurrency: dealCurrency || '₪' } : {}),
        ...(col.voucher != null && clean(row[col.voucher]) ? { voucher: clean(row[col.voucher]) } : {}),
        ...(note ? { note } : {}),
        ...(inst ? { installment: { n: Number(inst[1]), of: Number(inst[2]) } } : {}),
        ...(/הוראת קבע/.test(note) ? { standing: true } : {}),
        ...(/חו"ל|חו״ל/.test(note) ? { abroad: true } : {}),
        ...(offCycle ? { offCycle: true } : {}),
      });
    }
    r = i - 1;
  }

  return { fileName, card: card || '????', statementMonth, txs, statedTotal };
}

/** Decodes CSV bytes: UTF-8 / UTF-16 by BOM, plain UTF-8, or Hebrew Windows-1255 as exported by older bank sites. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  // UTF-16 without a BOM: every other byte of the ASCII parts is zero.
  const head = bytes.subarray(0, 400);
  let zerosOdd = 0, zerosEven = 0;
  head.forEach((b, i) => { if (b === 0) { if (i % 2) zerosOdd++; else zerosEven++; } });
  if (zerosOdd > head.length / 8 && zerosEven < zerosOdd / 4) return new TextDecoder('utf-16le').decode(bytes);
  if (zerosEven > head.length / 8 && zerosOdd < zerosEven / 4) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1255').decode(bytes);
  }
}

/** Splits delimited text into rows of cells. Handles quotes, doubled quotes, line breaks inside quotes and Excel's ="..." cells. */
export function parseCsv(text: string): string[][] {
  // The delimiter is whichever candidate appears most outside quotes.
  const counts: Record<string, number> = { ',': 0, '\t': 0, ';': 0, '|': 0 };
  let quoted = false;
  for (let i = 0; i < text.length && i < 20000; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => { endCell(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else inQuotes = false;
    } else if (ch === '"' && (cell === '' || cell === '=')) {
      cell = '';
      inQuotes = true;
    } else if (ch === delim) endCell();
    else if (ch === '\n') endRow();
    else if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow(); }
    else cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

const isCsv = (file: File) => /\.(csv|tsv|txt)$/i.test(file.name) || /csv|comma-separated|tab-separated|text\/plain/i.test(file.type);
// Excel files are zip archives ("PK") or OLE containers; some sites name them .csv anyway, and the other way round.
const looksLikeExcel = (b: Uint8Array) => (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0);

export async function parseStatementFile(file: File): Promise<ParsedStatement> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // CSV is read as text by us, so Hebrew encodings and day/month dates are not guessed by the Excel reader.
  const parseAsCsv = () => parseRows(parseCsv(decodeText(bytes)), file.name);
  if (isCsv(file) && !looksLikeExcel(bytes)) return parseAsCsv();
  if (!looksLikeExcel(bytes)) {
    // An ".xls" that is really text (some exports are): try it as CSV first.
    const asCsv = parseAsCsv();
    if (asCsv.txs.length) return asCsv;
  }
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  const rows: Cell[][] = [];
  for (const name of wb.SheetNames) {
    rows.push(...XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }), []);
  }
  return parseRows(rows, file.name);
}

/** Identity of a transaction inside one month — used to skip duplicates on re-import. */
export const txIdentity = (t: Pick<Tx, 'card' | 'date' | 'merchant' | 'amount' | 'voucher'>) =>
  `${t.card}|${t.voucher ?? t.merchant}|${t.date}|${t.amount.toFixed(2)}`;
