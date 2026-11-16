// Home is deliberately minimal: the date, a greeting, and the two things people come to do.
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarSearch, Check, Target } from 'lucide-react';
import { sumItems, useL, useLang, useStore } from '../lib/store';
import { money, monthLabel, shiftMonth, statementMonth } from '../lib/format';
import { Pill } from '../components/ui';

export default function Home() {
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  // `last` is the month whose card statement is the latest one out; `current` is the one being lived now.
  const last = statementMonth(db.settings.billingDay), current = shiftMonth(last, 1);
  const Arrow = lang === 'he' ? ArrowLeft : ArrowRight;

  const lastMonth = db.months[last];
  const lastFilled = !!lastMonth && (lastMonth.txs.length > 0 || lastMonth.manual.length > 0);
  const goal = db.months[current]?.goal;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? L('לילה טוב', 'Good night') : hour < 12 ? L('בוקר טוב', 'Good morning') : hour < 18 ? L('צהריים טובים', 'Good afternoon') : L('ערב טוב', 'Good evening');

  const quick = [
    {
      to: lastFilled ? `/month/${last}/analysis` : `/month/${last}`, icon: CalendarSearch, color: 'var(--needs)', done: lastFilled,
      title: L('ניתוח החודש האחרון', 'Analyze last month'), sub: monthLabel(last, lang),
      body: lastFilled
        ? L(`${lastMonth!.txs.length} עסקאות נטענו — לצפייה בניתוח`, `${lastMonth!.txs.length} transactions loaded — view the analysis`)
        : L('מעלים דף חיוב, מאשרים את הסיווג ורואים את התמונה', 'Upload a statement, confirm the classification and see the picture'),
    },
    {
      to: `/goal/${current}`, icon: Target, color: 'var(--accent)', done: !!goal,
      title: L('יעד לחודש הנוכחי', 'Goal for the current month'), sub: monthLabel(current, lang),
      body: goal
        ? L(`יעד מוגדר: הכנסה צפויה ${money(sumItems(goal.incomes), lang)}`, `Goal set: expected income ${money(sumItems(goal.incomes), lang)}`)
        : L('כמה צפוי להיכנס, וכמה מזה לצרכים, לרצונות ולחיסכון', 'What you expect to earn, and how much of it goes to needs, wants and savings'),
    },
  ];

  return (
    <div className="rise space-y-6">
      <header>
        <p className="text-sm text-muted">{new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{greeting}</h1>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {quick.map((q) => (
          <Link key={q.to} to={q.to} className="press group relative block overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow)] hover:border-line-strong">
            <div aria-hidden className="pointer-events-none absolute -end-10 -top-10 h-40 w-40 rounded-full opacity-[0.13] blur-2xl" style={{ background: q.color }} />
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: `color-mix(in oklab, ${q.color} 18%, transparent)`, color: q.color }}>
                <q.icon size={24} />
              </span>
              {q.done ? <Pill tone="good"><Check size={12} />{q.sub}</Pill> : <Pill>{q.sub}</Pill>}
            </div>
            <h2 className="mt-5 text-xl font-bold">{q.title}</h2>
            <p className="mt-1 text-sm text-ink2">{q.body}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
              {q.done ? L('פתח', 'Open') : L('התחל', 'Start')}<Arrow size={16} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
