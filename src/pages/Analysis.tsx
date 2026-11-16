import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircleAlert, CircleCheck, Info, Pencil, Search, TriangleAlert } from 'lucide-react';
import type { SpendBucket } from '../lib/types';
import { SPEND_BUCKETS } from '../lib/types';
import { bucketName, categoryName, emptyMonth, useL, useLang, useStore } from '../lib/store';
import { currentMonth, dayLabel, isMonthKey, monthLabel, pct, shiftMonth } from '../lib/format';
import { analyzeMonth, previousAnalysis } from '../lib/analysis/compute';
import { buildInsights, type Tone } from '../lib/analysis/insights';
import { BUCKET_COLOR, Button, Card, CardTitle, Dot, Empty, Money, MonthSwitcher, PageHeader, Pill, Segmented, TextInput, cx } from '../components/ui';
import { BucketMeters, DailyChart, Donut, RankBars } from '../components/charts';

const TONE_ICON: Record<Tone, React.ReactNode> = {
  good: <CircleCheck size={18} className="text-good" />, warn: <TriangleAlert size={18} className="text-warn" />,
  bad: <CircleAlert size={18} className="text-bad" />, info: <Info size={18} className="text-accent" />,
};

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <Card className="!p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={cx('mt-1 text-2xl font-bold tracking-tight', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

export default function AnalysisPage() {
  const { month = '' } = useParams();
  const navigate = useNavigate();
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const { assign } = useStore();
  const key = isMonthKey(month) ? month : shiftMonth(currentMonth(), -1);
  const m = db.months[key] ?? emptyMonth(key);

  const a = useMemo(() => analyzeMonth(m, db), [m, db]);
  const prev = useMemo(() => previousAnalysis(key, db), [key, db]);
  const insights = useMemo(() => buildInsights(a, prev, lang), [a, prev, lang]);
  const [merchantTab, setMerchantTab] = useState<'all' | SpendBucket>('all');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const header = (
    <PageHeader title={L('ניתוח חודשי', 'Monthly analysis')}
      subtitle={a.basis === 'goal' ? L('נמדד מול היעד שהגדרת מראש', 'Measured against the goal you set in advance') : a.basis === 'income' ? L(`לא הוגדר יעד — נמדד מול ההכנסה בפועל, ${a.split.needs}/${a.split.wants}/${a.split.invest}`, `No goal set — measured against actual income, ${a.split.needs}/${a.split.wants}/${a.split.invest}`) : undefined}>
      <Button icon={<Pencil size={15} />} onClick={() => navigate(`/month/${key}`)}>{L('עריכת נתונים', 'Edit data')}</Button>
      <MonthSwitcher value={key} onChange={(k) => navigate(`/month/${k}/analysis`)} />
    </PageHeader>
  );

  if (!a.hasData || (!m.txs.length && !m.manual.length)) {
    return (
      <div className="rise">{header}
        <Empty title={L(`אין עדיין נתונים ל${monthLabel(key, lang)}`, `No data yet for ${monthLabel(key, lang)}`)}>
          <p>{L('מלא הכנסות והעלה פירוט אשראי כדי לראות ניתוח.', 'Fill in income and upload a statement to see the analysis.')}</p>
          <Button variant="primary" className="mt-4" onClick={() => navigate(`/month/${key}`)}>{L('מילוי החודש', 'Fill in this month')}</Button>
        </Empty>
      </div>
    );
  }

  const catById = new Map(db.categories.map((c) => [c.id, c]));
  const merchants = a.merchants.filter((x) => x.total > 0 && (merchantTab === 'all' || x.bucket === merchantTab)).slice(0, 10);
  const q = query.trim().toLowerCase();
  const txs = [...m.txs].filter((t) => !q || t.merchant.toLowerCase().includes(q)).sort((x, y) => y.date.localeCompare(x.date));
  const shownTxs = showAll || q ? txs : txs.slice(0, 12);
  const openInst = a.installments.filter((i) => i.remaining > 0);

  return (
    <div className="rise space-y-4">
      {header}

      {a.income <= 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface2 px-5 py-3 text-sm text-warn">
          <span className="flex items-center gap-2"><TriangleAlert size={16} />{L('לא הוזנה הכנסה לחודש הזה, ולכן אי אפשר לחשב עודף ושיעור חיסכון.', 'No income was entered for this month, so surplus and savings rate cannot be calculated.')}</span>
          <Link to={`/month/${key}`} className="font-semibold text-accent hover:underline">{L('הוסף הכנסה', 'Add income')}</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={L('הכנסה', 'Income')} value={<Money value={a.income} />} sub={a.goalIncome ? <>{L('צפי ביעד', 'Goal expected')} <Money value={a.goalIncome} /></> : undefined} />
        <Kpi label={L('סך הוצאות', 'Total spent')} value={<Money value={a.totalSpent} />}
          sub={prev && prev.totalSpent > 0 ? <>{a.totalSpent >= prev.totalSpent ? '▲' : '▼'} {pct(Math.abs(a.totalSpent - prev.totalSpent) / prev.totalSpent)} {L('מהחודש הקודם', 'vs last month')}</> : L(`${a.txCount} עסקאות אשראי`, `${a.txCount} card transactions`)} />
        <Kpi label={a.leftover >= 0 ? L('נשאר', 'Left over') : L('גירעון', 'Deficit')} value={a.income > 0 ? <Money value={a.leftover} /> : '—'} tone={a.income > 0 ? (a.leftover >= 0 ? 'good' : 'bad') : undefined}
          sub={L('הכנסה פחות הוצאות', 'Income minus spending')} />
        <Kpi label={L('שיעור חיסכון', 'Savings rate')} value={a.savingsRate == null ? '—' : pct(a.savingsRate)} sub={L(`היעד: ${a.split.invest}%`, `Target: ${a.split.invest}%`)}
          tone={a.savingsRate == null ? undefined : a.savingsRate * 100 >= a.split.invest ? 'good' : 'bad'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle hint={L('הקו האנכי מסמן את היעד', 'The vertical line marks the target')}>{L('ביצוע מול יעד', 'Actual vs target')}</CardTitle>
          {a.basis === 'none' ? <p className="text-sm text-muted">{L('הזן הכנסה כדי לראות יעדים.', 'Enter income to see targets.')}</p> : null}
          <BucketMeters a={a} />
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>{L('לאן הלך הכסף', 'Where the money went')}</CardTitle>
          <div className="flex flex-col items-center gap-4">
            <Donut size={180}
              slices={[...(['needs', 'wants'] as const).map((b) => ({ id: b, label: bucketName(b, lang), value: a.spent[b], color: BUCKET_COLOR[b] })),
                { id: 'un', label: L('לא מסווג', 'Unclassified'), value: a.unclassified.total, color: 'var(--neutral-mark)' }]}
              center={<><span className="text-xs text-muted">{L('הוצאות', 'Spent')}</span><Money value={a.totalSpent} className="text-xl font-bold" /></>} />
            <ul className="w-full space-y-1.5 text-sm">
              {a.categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2"><Dot color={BUCKET_COLOR[c.bucket]} /><span className="truncate">{categoryName(catById.get(c.id), lang)}</span>
                    <span className="text-xs text-muted">{a.totalSpent > 0 ? pct(c.total / a.totalSpent) : ''}</span></span>
                  <Money value={c.total} className="font-semibold" />
                </li>
              ))}
              {a.unclassified.count > 0 && (
                <li className="flex items-center justify-between gap-3">
                  <Link to={`/month/${key}/classify`} className="flex items-center gap-2 text-warn hover:underline"><Dot color="var(--neutral-mark)" />{L(`לא מסווג (${a.unclassified.count})`, `Unclassified (${a.unclassified.count})`)}</Link>
                  <Money value={a.unclassified.total} className="font-semibold" />
                </li>
              )}
              {a.ignored !== 0 && <li className="flex items-center justify-between gap-3 text-muted"><span>{L('לא נספר', 'Not counted')}</span><Money value={a.ignored} /></li>}
            </ul>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle hint={L('מחושב אוטומטית מהנתונים שלך', 'Calculated automatically from your data')}>{L('תובנות', 'Insights')}</CardTitle>
        <ul className="grid gap-3 md:grid-cols-2">
          {insights.map((i) => (
            <li key={i.id} className="flex gap-3 rounded-2xl bg-surface2 p-4">
              <span className="mt-0.5 shrink-0">{TONE_ICON[i.tone]}</span>
              <div className="min-w-0"><p className="font-semibold leading-snug">{i.title}</p><p className="mt-1 text-sm text-ink2">{i.body}</p></div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle action={<Segmented size="sm" value={merchantTab} onChange={setMerchantTab}
            options={[{ value: 'all', label: L('הכול', 'All') }, { value: 'needs', label: bucketName('needs', lang) }, { value: 'wants', label: bucketName('wants', lang) }]} />}>
            {L('בתי העסק המובילים', 'Top merchants')}
          </CardTitle>
          {merchants.length
            ? <RankBars lang={lang} rows={merchants.map((x) => ({ key: x.name, label: x.name, sub: x.count > 1 ? `×${x.count}` : undefined, value: x.total, color: BUCKET_COLOR[x.bucket ?? 'none'] }))} />
            : <p className="text-sm text-muted">{L('אין נתונים להצגה.', 'Nothing to show.')}</p>}
        </Card>
        <Card>
          <CardTitle hint={L('לפי תאריך הרכישה', 'By purchase date')}>{L('הוצאות לפי יום', 'Spending by day')}</CardTitle>
          <DailyChart daily={a.daily} />
        </Card>
      </div>

      {(a.standing.length > 0 || openInst.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {a.standing.length > 0 && (
            <Card>
              <CardTitle action={<Money value={a.standing.reduce((s, x) => s + x.amount, 0)} className="font-bold" />}>{L('הוראות קבע ומנויים', 'Standing orders & subscriptions')}</CardTitle>
              <ul className="divide-y divide-line text-sm">
                {a.standing.map((s, i) => <li key={i} className="flex justify-between gap-3 py-2"><bdi className="truncate">{s.merchant}</bdi><Money value={s.amount} agorot className="font-medium" /></li>)}
              </ul>
            </Card>
          )}
          {openInst.length > 0 && (
            <Card>
              <CardTitle hint={L('מה שעוד יירד בחודשים הבאים', 'What will still be charged in coming months')}
                action={<Money value={openInst.reduce((s, x) => s + x.remainingTotal, 0)} className="font-bold" />}>{L('תשלומים פתוחים', 'Open installments')}</CardTitle>
              <ul className="divide-y divide-line text-sm">
                {openInst.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0"><bdi className="block truncate">{s.merchant}</bdi><span className="text-xs text-muted">{L(`תשלום ${s.n} מתוך ${s.of} · עוד ${s.remaining}`, `Payment ${s.n} of ${s.of} · ${s.remaining} to go`)}</span></span>
                    <span className="text-end"><Money value={s.amount} agorot className="font-medium" /><span className="block text-xs text-muted">{L('נותר', 'Remaining')} <Money value={s.remainingTotal} /></span></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {m.txs.length > 0 && (
        <Card>
          <CardTitle hint={L('אפשר לשנות קטגוריה ישירות מכאן', 'You can change a category right here')}
            action={<div className="relative"><Search size={15} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted" />
              <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L('חיפוש', 'Search')} className="!h-9 w-40 !ps-9" /></div>}>
            {L('כל העסקאות', 'All transactions')} <span className="text-sm font-normal text-muted">({txs.length})</span>
          </CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-line text-start text-[13px] text-muted">
                <th className="py-2 pe-3 text-start font-medium">{L('תאריך', 'Date')}</th><th className="py-2 pe-3 text-start font-medium">{L('בית עסק', 'Merchant')}</th>
                <th className="py-2 pe-3 text-start font-medium">{L('קטגוריה', 'Category')}</th><th className="py-2 text-end font-medium">{L('סכום', 'Amount')}</th></tr></thead>
              <tbody>
                {shownTxs.map((t) => (
                  <tr key={t.id} className="border-b border-line/60 last:border-0">
                    <td className="whitespace-nowrap py-2 pe-3 text-muted">{dayLabel(t.date, lang)}</td>
                    <td className="max-w-56 py-2 pe-3"><bdi className="block truncate">{t.merchant}</bdi>
                      {(t.standing || t.installment || t.abroad) && <span className="flex gap-1 pt-0.5">
                        {t.standing && <Pill>{L('הוראת קבע', 'Standing')}</Pill>}{t.installment && <Pill>{t.installment.n}/{t.installment.of}</Pill>}{t.abroad && <Pill>{L('חו"ל', 'Abroad')}</Pill>}</span>}</td>
                    <td className="py-2 pe-3">
                      <span className="flex items-center gap-1.5"><Dot color={BUCKET_COLOR[t.categoryId ? catById.get(t.categoryId)?.bucket ?? 'none' : 'none']} />
                        <select value={t.categoryId ?? ''} onChange={(e) => assign(key, [t.id], e.target.value || null)} aria-label={L('קטגוריה', 'Category')}
                          className={cx('max-w-36 rounded-lg bg-transparent py-1 text-sm hover:bg-surface2 focus:outline-none', !t.categoryId && 'text-warn')}>
                          <option value="">{L('לא מסווג', 'Unclassified')}</option>
                          {db.categories.map((c) => <option key={c.id} value={c.id}>{categoryName(c, lang)}</option>)}
                        </select></span></td>
                    <td className="py-2 text-end"><Money value={t.amount} agorot className={cx('font-medium', t.amount < 0 && 'text-good')} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!showAll && !q && txs.length > 12 && <Button size="sm" variant="ghost" className="mt-3" onClick={() => setShowAll(true)}>{L(`הצג את כל ${txs.length} העסקאות`, `Show all ${txs.length} transactions`)}</Button>}
        </Card>
      )}
    </div>
  );
}
