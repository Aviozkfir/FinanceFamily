// Rule-based insights — work with no AI at all.
import type { Lang, SpendBucket } from '../types';
import { money, pct } from '../format';
import { bucketName } from '../store';
import { SMALL_PURCHASE, type MonthAnalysis } from './compute';

export type Tone = 'good' | 'warn' | 'bad' | 'info';
export interface Insight { id: string; tone: Tone; title: string; body: string }

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

  if (a.basis !== 'none') {
    // Overall balance
    if (a.income > 0) {
      out.push(a.leftover >= 0
        ? {
          id: 'balance', tone: 'good',
          title: L(`סיימת את החודש עם עודף של ${$(a.leftover)}`, `You finished the month ${$(a.leftover)} ahead`),
          body: L(`הוצאת ${pct(a.totalSpent / a.income)} מההכנסה. שיעור החיסכון הכולל (חיסכון + מה שנשאר): ${pct(a.savingsRate ?? 0)}.`,
            `You spent ${pct(a.totalSpent / a.income)} of your income. Total savings rate (savings + what was left): ${pct(a.savingsRate ?? 0)}.`),
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

    // Savings: explicit + leftover vs the 20% target
    if (a.income > 0 && a.target.invest > 0) {
      const saved = a.spent.invest + Math.max(a.leftover, 0);
      const gap = a.target.invest - saved;
      out.push(gap > 0
        ? {
          id: 'savings', tone: 'warn',
          title: L(`חסרים ${$(gap)} כדי להגיע ליעד החיסכון`, `${$(gap)} short of the savings target`),
          body: L(`היעד הוא ${$(a.target.invest)} (${a.split.invest}%). בפועל הופרשו ${$(a.spent.invest)} ונשארו ${$(Math.max(a.leftover, 0))} פנויים.`,
            `The target is ${$(a.target.invest)} (${a.split.invest}%). You set aside ${$(a.spent.invest)} and had ${$(Math.max(a.leftover, 0))} left over.`),
        }
        : {
          id: 'savings', tone: 'good',
          title: L('עמדת ביעד החיסכון', 'You met the savings target'),
          body: L(`בין החיסכון שסומן (${$(a.spent.invest)}) לעודף (${$(Math.max(a.leftover, 0))}) יש לך ${$(saved)} — מעל היעד של ${$(a.target.invest)}.${a.leftover > 0 ? ' כדאי להעביר את העודף לחיסכון כדי שלא ייבלע.' : ''}`,
            `Between marked savings (${$(a.spent.invest)}) and the surplus (${$(Math.max(a.leftover, 0))}) you have ${$(saved)} — above the ${$(a.target.invest)} target.${a.leftover > 0 ? ' Move the surplus into savings so it does not get absorbed.' : ''}`),
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
      const moved = (['needs', 'wants', 'invest'] as SpendBucket[])
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

  const order: Record<Tone, number> = { bad: 0, warn: 1, good: 2, info: 3 };
  return out.sort((x, y) => order[x.tone] - order[y.tone]);
}
