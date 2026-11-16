// Home: the one thing to do next, and how the last month went. Nothing else.
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarPlus, CircleCheck, ListChecks, Target } from 'lucide-react';
import { useL, useLang, useStore } from '../lib/store';
import { money, monthLabel, shiftMonth, statementMonth } from '../lib/format';
import { analyzeMonth, filledMonths } from '../lib/analysis/compute';
import { Card, CardTitle } from '../components/ui';
import { MonthHero } from '../components/charts';

export default function Home() {
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  // `prev` is the month whose statement is the latest one out; `next` is the one being lived now.
  const prev = statementMonth(db.settings.billingDay), next = shiftMonth(prev, 1);
  const Arrow = lang === 'he' ? ArrowLeft : ArrowRight;

  const has = (k: string) => { const m = db.months[k]; return !!m && (m.txs.length > 0 || m.manual.length > 0); };
  const latestKey = [...filledMonths(db)].reverse().find(has);
  const latest = latestKey ? analyzeMonth(db.months[latestKey], db) : null;
  const toReview = latest ? latest.unclassified.count + latest.guessed.count : 0;

  // The single next step, most useful first.
  const step =
    latest && toReview > 0 ? {
      icon: ListChecks, to: `/month/${latest.key}/classify`, cta: L('לסיווג', 'Review'),
      title: L(`${toReview} עסקאות מחכות לך ב${monthLabel(latest.key, lang)}`, `${toReview} transactions are waiting in ${monthLabel(latest.key, lang)}`),
      body: L(`${money(latest.unclassified.total + latest.guessed.total, lang)} עדיין לא סווגו או לא אושרו, אז המספרים של החודש לא סופיים.`, `${money(latest.unclassified.total + latest.guessed.total, lang)} is not classified or confirmed yet, so the month's numbers are not final.`),
    } : !has(prev) ? {
      icon: CalendarPlus, to: `/month/${prev}`, cta: L('התחל', 'Start'),
      title: L(`הגיע הזמן לסכם את ${monthLabel(prev, lang)}`, `Time to wrap up ${monthLabel(prev, lang)}`),
      body: L('מעלים את דף החיוב של האשראי, מאשרים את הסיווג ומקבלים את התמונה של החודש.', 'Upload the card statement, confirm the classification and get the picture of the month.'),
    } : !db.months[next]?.goal ? {
      icon: Target, to: `/goal/${next}`, cta: L('הגדר יעד', 'Set a goal'),
      title: L(`יעד ל${monthLabel(next, lang)}`, `A goal for ${monthLabel(next, lang)}`),
      body: L('כמה צפוי להיכנס, וכמה מזה הולך לצרכים, לרצונות ולחיסכון.', 'What you expect to earn, and how much of it goes to needs, wants and savings.'),
    } : null;

  const others = [
    !db.months[next]?.goal && step?.icon !== Target ? { to: `/goal/${next}`, label: L(`הגדר יעד ל${monthLabel(next, lang)}`, `Set a goal for ${monthLabel(next, lang)}`) } : null,
  ].filter((x): x is { to: string; label: string } => !!x);

  return (
    <div className="rise space-y-4">
      {step ? (
        <Link to={step.to} className="press group relative block overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow)] transition-colors hover:border-line-strong">
          <div aria-hidden className="pointer-events-none absolute -end-10 -top-10 h-40 w-40 rounded-full bg-accent opacity-[0.13] blur-2xl" />
          <p className="flex items-center gap-2 text-[13px] font-medium text-accent"><step.icon size={16} />{L('הצעד הבא', 'Next step')}</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight">{step.title}</h1>
          <p className="mt-1.5 text-sm text-ink2">{step.body}</p>
          <span className="mt-4 inline-flex h-10 items-center gap-2 rounded-2xl bg-[var(--btn)] px-4 text-sm font-semibold text-[var(--btn-ink)]">{step.cta}<Arrow size={16} /></span>
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow)]">
          <CircleCheck size={28} className="shrink-0 text-good" />
          <div><h1 className="text-xl font-bold">{L('הכול מעודכן', 'Everything is up to date')}</h1>
            <p className="text-sm text-ink2">{L('החודש האחרון סוכם ויש יעד לחודש הבא.', 'The last month is wrapped up and next month has a goal.')}</p></div>
        </div>
      )}

      {latest ? (
        <Card>
          <CardTitle action={<Link to={`/month/${latest.key}/analysis`} className="shrink-0 text-sm font-medium text-accent hover:underline">{L('לניתוח המלא', 'Full analysis')}</Link>}>
            {monthLabel(latest.key, lang)}
          </CardTitle>
          <MonthHero a={latest} />
        </Card>
      ) : (
        <Card>
          <CardTitle>{L('איך זה עובד', 'How it works')}</CardTitle>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              [L('מעלים דף חיוב', 'Upload a statement'), L('קובץ Excel או CSV מאתר חברת האשראי.', 'An Excel or CSV file from your card issuer.')],
              [L('מאשרים את הסיווג', 'Confirm the classification'), L('האפליקציה לומדת ממך מה צורך ומה רצון, וכל חודש נשאר לך פחות לעשות.', 'The app learns from you what is a need and what is a want, so each month leaves you less to do.')],
              [L('רואים את התמונה', 'See the picture'), L('כמה חסכת, לאן הלך הכסף, ומה בלט החודש.', 'How much you saved, where the money went, and what stood out.')],
            ].map(([t, d], i) => (
              <li key={i} className="rounded-2xl bg-surface2 p-4">
                <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm font-bold text-page">{i + 1}</span>
                <p className="font-semibold">{t}</p><p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-sm">
        {others.map((o) => <Link key={o.to} to={o.to} className="font-medium text-accent hover:underline">{o.label}</Link>)}
      </div>
    </div>
  );
}
