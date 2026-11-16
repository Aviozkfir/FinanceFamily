// Rule-based insights — work with no AI at all.
import type { Lang, SpendBucket } from '../types';
import { money, pct } from '../format';
import { bucketName } from '../store';
import { SMALL_PURCHASE, type MonthAnalysis } from './compute';

export type Tone = 'good' | 'warn' | 'bad' | 'info';
export interface Insight { id: string; tone: Tone; title: string; body: string; /** Shekels involved — how much this matters. */ weight?: number }

export function buildInsights(a: MonthAnalysis, prev: MonthAnalysis | null, lang: Lang): Insight[] {
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  const $ = (n: number) => money(n, lang);
  const out: Insight[] = [];
  if (!a.hasData) return out;

  if (a.unclassified.count) {
    out.push({
      id: 'unclassified', tone: 'warn',
      title: L(`${a.unclassified.count} עסקאות עדיין לא סווגו`, `${a.unclassified.count} transactions are not classified yet`),
      body: L(`${$(a.unclassified.total)} לא משויכים לאף קטגוריה, ולכן התמונה חלקית. סווג אותם כדי לקבל ניתוח מדויק.`,
        `${$(a.unclassified.total)} is not assigned to any category, so the picture is partial. Classify them for an accurate analysis.`),
    });
  }

  if (a.guessed.count) {
    out.push({
      id: 'guessed', tone: 'warn',
      title: L(`${a.guessed.count} עסקאות סווגו לפי ניחוש`, `${a.guessed.count} transactions were classified by a guess`),
      body: L(`${$(a.guessed.total)} שויכו אוטומטית ועדיין לא אישרת. עבור עליהן בלוח הסיווג כדי שהמספרים יהיו מדויקים.`,
        `${$(a.guessed.total)} was placed automatically and not confirmed yet. Review it on the classification board so the numbers are exact.`),
    });
  }

  if (a.basis !== 'none') {
    // Overall balance
    if (a.income > 0) {
      out.push(a.leftover >= 0
        ? {
          id: 'balance', tone: 'good',
          title: L(`סיימת את החודש עם עודף של ${$(a.leftover)}`, `You finished the month ${$(a.leftover)} ahead`),
          body: L(`הוצאת ${pct(a.totalSpent / a.income)} מההכנסה, וחסכת ${pct(a.savingsRate ?? 0)} ממנה.`,
            `You spent ${pct(a.totalSpent / a.income)} of your income and saved ${pct(a.savingsRate ?? 0)} of it.`),
        }
        : {
          id: 'balance', tone: 'bad',
          title: L(`הוצאת ${$(-a.leftover)} יותר ממה שהכנסת`, `You spent ${$(-a.leftover)} more than you earned`),
          body: L(`סך ההוצאות ${$(a.totalSpent)} מול הכנסה של ${$(a.income)}. הפער הזה ממומן מחיסכון או ממינוס.`,
            `Total spending ${$(a.totalSpent)} against income of ${$(a.income)}. That gap is funded by savings or overdraft.`),
        });
    }

    for (const b of ['needs', 'wants'] as SpendBucket[]) {
      const diff = a.spent[b] - a.target[b];
      if (a.target[b] <= 0) continue;
      const name = bucketName(b, lang);
      if (diff > a.target[b] * 0.03) {
        const top = a.merchants.filter((m) => m.bucket === b).slice(0, 3).map((m) => `${m.name} (${$(m.total)})`).join(', ');
        out.push({
          id: `over-${b}`, tone: diff > a.target[b] * 0.15 ? 'bad' : 'warn',
          title: L(`${name}: חריגה של ${$(diff)} מהיעד`, `${name}: ${$(diff)} over target`),
          body: L(`הוצאת ${$(a.spent[b])} מול יעד של ${$(a.target[b])} (${pct(a.spent[b] / a.target[b])}).${top ? ` ההוצאות הגדולות: ${top}.` : ''}`,
            `You spent ${$(a.spent[b])} against a target of ${$(a.target[b])} (${pct(a.spent[b] / a.target[b])}).${top ? ` Biggest items: ${top}.` : ''}`),
        });
      } else if (a.spent[b] > 0) {
        out.push({
          id: `ok-${b}`, tone: 'good',
          title: L(`${name}: בתוך היעד`, `${name}: within target`),
          body: L(`הוצאת ${$(a.spent[b])} מתוך ${$(a.target[b])} — נשארו ${$(Math.max(-diff, 0))}.`,
            `You spent ${$(a.spent[b])} of ${$(a.target[b])} — ${$(Math.max(-diff, 0))} to spare.`),
        });
      }
    }

    // Savings: what was left of the income, against the target
    if (a.income > 0 && a.target.invest > 0) {
      const saved = Math.max(a.leftover, 0);
      const gap = a.target.invest - saved;
      const aside = a.setAside > 0 ? L(` מתוכם ${$(a.setAside)} כבר סומנו כהפקדה.`, ` ${$(a.setAside)} of it is already marked as deposited.`) : '';
      out.push(gap > 0
        ? {
          id: 'savings', tone: 'warn',
          title: L(`חסרים ${$(gap)} כדי להגיע ליעד החיסכון`, `${$(gap)} short of the savings target`),
          body: L(`היעד הוא ${$(a.target.invest)} (${a.split.invest}%). אחרי ההוצאות נשארו ${$(saved)}.${aside}`,
            `The target is ${$(a.target.invest)} (${a.split.invest}%). After spending, ${$(saved)} was left.${aside}`),
        }
        : {
          id: 'savings', tone: 'good',
          title: L('עמדת ביעד החיסכון', 'You met the savings target'),
          body: L(`אחרי ההוצאות נשארו ${$(saved)} — מעל היעד של ${$(a.target.invest)}.${aside}`,
            `After spending, ${$(saved)} was left — above the ${$(a.target.invest)} target.${aside}`),
        });
    }
  }

  // Concentration
  const top = a.merchants[0];
  if (top && a.totalSpent > 0 && top.total / a.totalSpent > 0.08) {
    out.push({
      id: 'top-merchant', tone: 'info',
      title: L(`${top.name} — ההוצאה הגדולה של החודש`, `${top.name} — the biggest spend of the month`),
      body: L(`${$(top.total)} ב-${top.count} עסקאות, ${pct(top.total / a.totalSpent)} מכל ההוצאות.`,
        `${$(top.total)} across ${top.count} transactions, ${pct(top.total / a.totalSpent)} of all spending.`),
    });
  }

  const frequent = a.merchants.filter((m) => m.count >= 4).sort((x, y) => y.count - x.count)[0];
  if (frequent && frequent !== top) {
    out.push({
      id: 'frequent', tone: 'info',
      title: L(`${frequent.count} ביקורים ב${frequent.name}`, `${frequent.count} visits to ${frequent.name}`),
      body: L(`סך הכול ${$(frequent.total)}, ממוצע ${$(frequent.total / frequent.count)} לביקור. הרגלים קטנים שחוזרים על עצמם הם המקום הקל ביותר לחסוך בו.`,
        `${$(frequent.total)} in total, ${$(frequent.total / frequent.count)} per visit on average. Small repeated habits are the easiest place to save.`),
    });
  }

  if (a.standing.length) {
    const total = a.standing.reduce((s, x) => s + x.amount, 0);
    out.push({
      id: 'standing', tone: 'info',
      title: L(`${a.standing.length} הוראות קבע ומנויים: ${$(total)} בחודש`, `${a.standing.length} standing orders & subscriptions: ${$(total)} a month`),
      body: L(`${a.standing.slice(0, 6).map((s) => `${s.merchant} ${$(s.amount)}`).join(' · ')}. זה ${$(total * 12)} בשנה — שווה לוודא שכל מנוי עדיין בשימוש.`,
        `${a.standing.slice(0, 6).map((s) => `${s.merchant} ${$(s.amount)}`).join(' · ')}. That is ${$(total * 12)} a year — worth checking each one is still used.`),
    });
  }

  const open = a.installments.filter((i) => i.remaining > 0);
  if (open.length) {
    const monthly = open.reduce((s, i) => s + i.amount, 0);
    const debt = open.reduce((s, i) => s + i.remainingTotal, 0);
    out.push({
      id: 'installments', tone: 'warn',
      title: L(`התחייבות עתידית בתשלומים: ${$(debt)}`, `Future installment commitments: ${$(debt)}`),
      body: L(`${open.length} עסקאות בתשלומים ימשיכו לרדת בחודשים הבאים — ${$(monthly)} כבר "תפוסים" בחודש הבא. ${open.slice(0, 3).map((i) => `${i.merchant}: עוד ${i.remaining} × ${$(i.amount)}`).join(' · ')}.`,
        `${open.length} installment purchases keep charging in coming months — ${$(monthly)} of next month is already committed. ${open.slice(0, 3).map((i) => `${i.merchant}: ${i.remaining} more × ${$(i.amount)}`).join(' · ')}.`),
    });
  }

  if (a.small.count >= 8) {
    out.push({
      id: 'small', tone: 'info',
      title: L(`${a.small.count} קניות קטנות הצטברו ל-${$(a.small.total)}`, `${a.small.count} small purchases added up to ${$(a.small.total)}`),
      body: L(`עסקאות של פחות מ-${$(SMALL_PURCHASE)} — קפה, מכונות, קיוסק. כל אחת זניחה, ביחד זה סכום ששווה לשים אליו לב.`,
        `Transactions under ${$(SMALL_PURCHASE)} — coffee, vending, kiosks. Each is negligible; together they are worth noticing.`),
    });
  }

  if (a.refunds.count) {
    out.push({
      id: 'refunds', tone: 'good',
      title: L(`קיבלת ${$(-a.refunds.total)} בזיכויים`, `You got ${$(-a.refunds.total)} back in refunds`),
      body: L(`${a.refunds.count} זיכויים קוזזו מההוצאות החודש.`, `${a.refunds.count} refunds were offset against this month's spending.`),
    });
  }

  if (prev && prev.totalSpent > 0) {
    const diff = a.totalSpent - prev.totalSpent;
    const rel = diff / prev.totalSpent;
    if (Math.abs(rel) > 0.05) {
      const moved = (['needs', 'wants'] as SpendBucket[])
        .map((b) => ({ b, d: a.spent[b] - prev.spent[b] }))
        .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
      out.push({
        id: 'vs-prev', tone: diff > 0 ? 'warn' : 'good',
        title: diff > 0
          ? L(`הוצאת ${$(diff)} יותר מהחודש הקודם`, `You spent ${$(diff)} more than last month`)
          : L(`הוצאת ${$(-diff)} פחות מהחודש הקודם`, `You spent ${$(-diff)} less than last month`),
        body: L(`שינוי של ${pct(Math.abs(rel))}. השינוי הגדול ביותר: ${bucketName(moved.b, lang)} (${moved.d > 0 ? '+' : '−'}${$(Math.abs(moved.d))}).`,
          `A ${pct(Math.abs(rel))} change. Biggest mover: ${bucketName(moved.b, lang)} (${moved.d > 0 ? '+' : '−'}${$(Math.abs(moved.d))}).`),
      });
    }
  }

  const sum = (xs: { amount: number }[]) => xs.reduce((t, x) => t + x.amount, 0);
  const weights: Record<string, number> = {
    'over-needs': a.spent.needs - a.target.needs,
    'over-wants': a.spent.wants - a.target.wants,
    'vs-prev': prev ? Math.abs(a.totalSpent - prev.totalSpent) : 0,
    // Facts rather than problems weigh half, so a real overrun comes first.
    'top-merchant': (a.merchants[0]?.total ?? 0) / 2,
    frequent: (frequent?.total ?? 0) / 2,
    standing: sum(a.standing),
    installments: sum(a.installments.filter((i) => i.remaining > 0)),
    small: a.small.total,
    refunds: -a.refunds.total / 2,
    abroad: a.abroad.total / 2,
  };
  for (const i of out) i.weight = weights[i.id] ?? 0;

  const order: Record<Tone, number> = { bad: 0, warn: 1, good: 2, info: 3 };
  return out.sort((x, y) => order[x.tone] - order[y.tone]);
}

/** What the main picture of the month already says; repeating it as an insight is noise. */
const IN_PICTURE = new Set(['unclassified', 'guessed', 'balance', 'ok-needs', 'ok-wants', 'savings']);
/** The few insights worth reading: not already in the picture, most money first. */
export const topInsights = (all: Insight[], n = 3): Insight[] =>
  all.filter((i) => !IN_PICTURE.has(i.id) && (i.weight ?? 0) > 0).sort((x, y) => (y.weight ?? 0) - (x.weight ?? 0)).slice(0, n);
