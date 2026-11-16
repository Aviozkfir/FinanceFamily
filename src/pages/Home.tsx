import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarSearch, Check, Target } from 'lucide-react';
import { bucketName, sumItems, useL, useLang, useStore } from '../lib/store';
import { currentMonth, monthLabel, pct, shiftMonth } from '../lib/format';
import { SPEND_BUCKETS } from '../lib/types';
import { analyzeMonth, filledMonths } from '../lib/analysis/compute';
import { BUCKET_COLOR, Card, CardTitle, Dot, Money, Pill, cx } from '../components/ui';
import { BucketMeters, Donut } from '../components/charts';

export default function Home() {
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const now = currentMonth();
  const next = shiftMonth(now, 1), prev = shiftMonth(now, -1);
  const Arrow = lang === 'he' ? ArrowLeft : ArrowRight;

  const nextGoal = db.months[next]?.goal;
  const prevMonth = db.months[prev];
  const prevFilled = !!prevMonth && (prevMonth.txs.length > 0 || prevMonth.manual.length > 0);
  const filled = filledMonths(db);
  const latestKey = [...filled].reverse().find((k) => db.months[k].txs.length || db.months[k].manual.length);
  const latest = latestKey ? analyzeMonth(db.months[latestKey], db) : null;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? L('לילה טוב', 'Good night') : hour < 12 ? L('בוקר טוב', 'Good morning') : hour < 18 ? L('צהריים טובים', 'Good afternoon') : L('ערב טוב', 'Good evening');

  const quick = [
    {
      to: `/goal/${next}`, icon: Target, color: 'var(--accent)',
      title: L('הגדרת יעד לחודש הבא', 'Set a goal for next month'),
      sub: monthLabel(next, lang),
      body: nextGoal
        ? L(`יעד מוגדר: הכנסה צפויה ${'⁦'}₪${sumItems(nextGoal.incomes).toLocaleString()}${'⁩'}`, `Goal set: expected income ₪${sumItems(nextGoal.incomes).toLocaleString()}`)
        : L('הזן הכנסה צפויה וקבל חלוקה ל-50/30/20', 'Enter expected income and get a 50/30/20 split'),
      done: !!nextGoal,
    },
    {
      to: prevFilled ? `/month/${prev}/analysis` : `/month/${prev}`, icon: CalendarSearch, color: 'var(--needs)',
      title: L('ניתוח החודש הקודם', 'Analyze last month'),
      sub: monthLabel(prev, lang),
      body: prevFilled
        ? L(`${prevMonth!.txs.length} עסקאות נטענו — לצפייה בניתוח`, `${prevMonth!.txs.length} transactions loaded — view the analysis`)
        : L('הכנסות, פירוט אשראי, סיווג — וניתוח מלא', 'Income, card statement, classification — and a full analysis'),
      done: prevFilled,
    },
  ];

  return (
    <div className="rise space-y-6">
      <header>
        <p className="text-sm text-muted">{new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{greeting} 👋</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {quick.map((q) => (
          <Link key={q.to} to={q.to} className="group relative overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow)] transition-colors hover:border-line-strong">
            <div aria-hidden className="pointer-events-none absolute -end-10 -top-10 h-40 w-40 rounded-full opacity-[0.13] blur-2xl" style={{ background: q.color }} />
            <div className="flex items-start justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `color-mix(in oklab, ${q.color} 18%, transparent)`, color: q.color }}>
                <q.icon size={24} />
              </span>
              {q.done ? <Pill tone="good"><Check size={12} />{L('מולא', 'Filled')}</Pill> : <Pill>{q.sub}</Pill>}
            </div>
            <h2 className="mt-5 text-xl font-bold">{q.title}</h2>
            <p className="mt-1 text-sm text-ink2">{q.done && <span className="text-muted">{q.sub} · </span>}{q.body}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
              {L('התחל', 'Start')}<Arrow size={16} className="transition-transform group-hover:-translate-x-1 ltr:group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>

      {latest ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardTitle hint={latest.basis === 'goal' ? L('מול היעד שהגדרת מראש', 'Against the goal you set') : L('מול חלוקת 50/30/20 של ההכנסה', 'Against a 50/30/20 split of income')}
              action={<Link to={`/month/${latest.key}/analysis`} className="text-sm font-medium text-accent hover:underline">{L('לניתוח המלא', 'Full analysis')}</Link>}>
              {L('החודש האחרון שמולא', 'Latest filled month')} · {monthLabel(latest.key, lang)}
            </CardTitle>
            <BucketMeters a={latest} />
          </Card>
          <Card className="flex flex-col items-center justify-center gap-4 lg:col-span-2">
            <Donut size={190}
              slices={(['needs', 'wants'] as const).map((b) => ({ id: b, label: bucketName(b, lang), value: latest.spent[b], color: BUCKET_COLOR[b] }))}
              center={<><span className="text-xs text-muted">{L('סך הוצאות', 'Total spent')}</span><Money value={latest.totalSpent} className="text-2xl font-bold" /></>} />
            <div className="grid w-full grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-surface2 p-3"><p className="text-xs text-muted">{L('הכנסה', 'Income')}</p><Money value={latest.income} className="font-semibold" /></div>
              <div className="rounded-xl bg-surface2 p-3"><p className="text-xs text-muted">{L('שיעור חיסכון', 'Savings rate')}</p>
                <span className={cx('font-semibold', latest.savingsRate != null && latest.savingsRate < 0.1 && 'text-warn')}>{latest.savingsRate == null ? '—' : pct(latest.savingsRate)}</span></div>
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <CardTitle>{L('איך זה עובד', 'How it works')}</CardTitle>
          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              [L('מגדירים יעד', 'Set a goal'), L('הכנסה צפויה לחודש הבא, מחולקת ל-50% צרכים, 30% רצונות ו-20% חיסכון.', 'Expected income for next month, split 50% needs, 30% wants, 20% savings.')],
              [L('ממלאים את החודש', 'Fill in the month'), L('מעלים את קובצי האשראי, גוררים כל עסקה לקטגוריה ומוסיפים הכנסות והוצאות נוספות.', 'Upload card statements, drag each transaction into a category, add other income and expenses.')],
              [L('מקבלים ניתוח', 'Get the analysis'), L('רואים איפה עמדת ביעד, איפה חרגת, ושואלים את Claude מה אפשר לשפר.', 'See where you met the goal, where you went over, and ask Claude what to improve.')],
            ].map(([t, d], i) => (
              <li key={i} className="rounded-2xl bg-surface2 p-4">
                <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm font-bold text-page">{i + 1}</span>
                <p className="font-semibold">{t}</p><p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{L('חודשים אחרונים', 'Recent months')}</h2>
          <Link to="/history" className="text-sm font-medium text-accent hover:underline">{L('כל ההיסטוריה', 'All history')}</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 0, -1, -2].map((off) => {
            const key = shiftMonth(now, off);
            const m = db.months[key];
            const has = !!m && (m.txs.length > 0 || m.manual.length > 0);
            const a = has ? analyzeMonth(m!, db) : null;
            return (
              <Link key={key} to={has ? `/month/${key}/analysis` : off > 0 ? `/goal/${key}` : `/month/${key}`}
                className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
                <p className="text-sm font-semibold">{monthLabel(key, lang)}</p>
                {a ? (
                  <>
                    <Money value={a.totalSpent} className="mt-2 block text-lg font-bold" />
                    <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                      {SPEND_BUCKETS.map((b) => a.spent[b] > 0 && <span key={b} style={{ flex: a.spent[b], background: BUCKET_COLOR[b] }} />)}
                      {a.unclassified.total > 0 && <span style={{ flex: a.unclassified.total, background: 'var(--neutral-mark)' }} />}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                    {m?.goal ? <><Dot color="var(--accent)" />{L('יעד הוגדר', 'Goal set')}</> : off > 0 ? L('הגדר יעד', 'Set a goal') : L('טרם מולא', 'Not filled yet')}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
