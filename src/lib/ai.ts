// Client side of the AI assistant: builds the data context and streams answers.
import type { ChatMsg, DB, Lang, MonthData } from './types';
import { categoryName } from './store';
import { analyzeMonth, type MonthAnalysis } from './analysis/compute';
import type { Forecast } from './analysis/forecast';
import { API_KEY_STORAGE, isNative } from './platform';
import { buildSystem, DEFAULT_API_MODEL } from '../../shared/ai-prompt.mjs';

const r = (n: number) => Math.round(n * 100) / 100;

function summary(a: MonthAnalysis, db: DB, lang: Lang) {
  const cat = (id: string) => categoryName(db.categories.find((c) => c.id === id), lang);
  return {
    month: a.key,
    income: r(a.income),
    targets_based_on: a.basis === 'goal' ? `goal set in advance (expected income ${r(a.goalIncome ?? 0)})` : 'actual income',
    split_percent: a.split,
    target: { needs: r(a.target.needs), wants: r(a.target.wants), savings_investing: r(a.target.invest) },
    spent: { needs: r(a.spent.needs), wants: r(a.spent.wants), savings_investing: r(a.spent.invest), unclassified: r(a.unclassified.total) },
    total_spent: r(a.totalSpent),
    leftover_income_minus_spending: r(a.leftover),
    savings_rate: a.savingsRate == null ? null : r(a.savingsRate),
    excluded_from_analysis: r(a.ignored),
    categories: a.categories.map((c) => ({ category: cat(c.id), bucket: c.bucket, total: r(c.total), count: c.count })),
    standing_orders: a.standing.map((s) => ({ merchant: s.merchant, amount: r(s.amount) })),
    installments: a.installments.map((i) => ({ merchant: i.merchant, monthly: r(i.amount), payment: `${i.n}/${i.of}`, remaining_total: r(i.remainingTotal) })),
    small_purchases_under_30: a.small,
    refunds: a.refunds,
  };
}

export function monthContext(month: MonthData, db: DB, lang: Lang): string {
  const a = analyzeMonth(month, db);
  const cat = (id: string | null) => categoryName(db.categories.find((c) => c.id === id), lang);
  return JSON.stringify({
    ...summary(a, db, lang),
    income_items: [...month.incomes, ...month.manual.filter((m) => m.kind === 'income')].map((i) => ({ label: i.label, amount: r(Number(i.amount) || 0) })),
    manual_expenses: month.manual.filter((m) => m.kind === 'expense').map((m) => ({ label: m.label, amount: r(Number(m.amount) || 0), category: cat(m.categoryId) })),
    // date, merchant, amount charged, category, flags
    transactions: month.txs.map((t) => [
      t.date, t.merchant, r(t.amount), cat(t.categoryId),
      [t.standing && 'standing-order', t.installment && `installment ${t.installment.n}/${t.installment.of}`, t.abroad && 'abroad', t.amount < 0 && 'refund'].filter(Boolean).join(',') || undefined,
    ].filter((x) => x !== undefined)),
  });
}

export function trendContext(analyses: MonthAnalysis[], forecast: Forecast | null, db: DB, lang: Lang): string {
  return JSON.stringify({
    months: analyses.map((a) => ({ ...summary(a, db, lang), top_merchants: a.merchants.slice(0, 25).map((m) => ({ merchant: m.name, total: r(m.total), count: m.count, bucket: m.bucket })) })),
    forecast_next_month: forecast && {
      month: forecast.month,
      expected: { needs: r(forecast.byBucket.needs.expected), wants: r(forecast.byBucket.wants.expected), savings_investing: r(forecast.byBucket.invest.expected), total: r(forecast.total) },
      already_committed: forecast.committed,
      monthly_trend_in_total_spending: forecast.trend == null ? null : r(forecast.trend),
    },
  });
}

export interface AiStatus { cli: boolean; cliVersion: string | null; hasApiKey: boolean; defaultModel: string }
export const fetchAiStatus = async (): Promise<AiStatus | null> => {
  if (isNative()) return { cli: false, cliVersion: null, hasApiKey: Boolean(localStorage.getItem(API_KEY_STORAGE)), defaultModel: DEFAULT_API_MODEL };
  try { const res = await fetch('/api/ai/status'); return res.ok ? await res.json() : null; } catch { return null; }
};

export function aiErrorText(code: string, lang: Lang): string {
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  if (code === 'CLI_NOT_FOUND') return L('Claude Code לא נמצא במחשב. אפשר להזין מפתח API בהגדרות.', 'Claude Code was not found on this computer. You can enter an API key in Settings.');
  if (code === 'NO_API_KEY') return isNative() ? L('לא הוגדר מפתח API. הזן מפתח בהגדרות.', 'No API key is set. Enter one in Settings.') : L('לא הוגדר מפתח API. הזן מפתח בהגדרות, או בחר בהתחברות דרך Claude Code.', 'No API key is set. Enter one in Settings, or choose the Claude Code sign-in.');
  if (code === 'BAD_API_KEY') return L('מפתח ה-API נדחה. בדוק אותו בהגדרות.', 'The API key was rejected. Check it in Settings.');
  if (code === 'RATE_LIMITED') return L('הגעת למגבלת הקצב. נסה שוב בעוד רגע.', 'Rate limit reached. Try again in a moment.');
  if (code === 'REFUSED') return L('המודל סירב לענות על הבקשה הזו.', 'The model declined this request.');
  if (code === 'NO_NETWORK') return L('אין חיבור לאינטרנט, או שהחיבור ל-Claude נחסם. נסה שוב.', 'No internet connection, or the connection to Claude was blocked. Try again.');
  if (code === 'OFFLINE') return L('השרת המקומי לא זמין. ודא שהאפליקציה רצה (npm run dev או start.bat).', 'The local server is not reachable. Make sure the app is running (npm run dev or start.bat).');
  if (/not logged in|login|authenticat/i.test(code)) return L('Claude Code לא מחובר. פתח טרמינל, הרץ claude והתחבר — ואז נסה שוב.', 'Claude Code is not signed in. Open a terminal, run claude and sign in — then try again.');
  return code;
}

/** Streams an answer; `onText` gets the accumulated text. Resolves with the full answer. */
export async function askAi(
  opts: { context: string; messages: ChatMsg[]; db: DB; signal?: AbortSignal },
  onText: (full: string) => void,
): Promise<string> {
  if (isNative()) return askDirect(opts, onText);
  const { lang, aiProvider, aiModel } = opts.db.settings;
  let res: Response;
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: opts.context, messages: opts.messages, lang, provider: aiProvider, model: aiModel }),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) return '';
    throw new Error('OFFLINE');
  }
  if (!res.ok || !res.body) throw new Error('OFFLINE');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const ev = JSON.parse(line) as { t: 'd' | 'e' | 'done'; v?: string };
      if (ev.t === 'd') { full += ev.v ?? ''; onText(full); }
      else if (ev.t === 'e') throw new Error(ev.v || 'error');
    }
  }
  return full;
}

/** Phone build: no local server, so call the Anthropic API straight from the app with the key saved on the device. */
async function askDirect(
  opts: { context: string; messages: ChatMsg[]; db: DB; signal?: AbortSignal },
  onText: (full: string) => void,
): Promise<string> {
  const apiKey = localStorage.getItem(API_KEY_STORAGE);
  if (!apiKey) throw new Error('NO_API_KEY');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // The key belongs to the person using this private app on their own device.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { lang, aiModel } = opts.db.settings;
  let full = '';
  try {
    const stream = client.beta.messages.stream({
      model: aiModel || DEFAULT_API_MODEL,
      max_tokens: 32000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: buildSystem(opts.context, lang), cache_control: { type: 'ephemeral' } }],
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    }, { signal: opts.signal });
    stream.on('text', (delta) => { full += delta; onText(full); });
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new Error('REFUSED');
    return full;
  } catch (err) {
    if (opts.signal?.aborted) return '';
    if (err instanceof Anthropic.AuthenticationError) throw new Error('BAD_API_KEY');
    if (err instanceof Anthropic.RateLimitError) throw new Error('RATE_LIMITED');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('NO_NETWORK');
    if (err instanceof Anthropic.APIError) throw new Error(`API ${err.status ?? ''}: ${err.message}`);
    throw err;
  }
}
