import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { SPEND_BUCKETS } from '../lib/types';
import { bucketName, useL, useLang, useStore } from '../lib/store';
import { merchantKey, monthLabel, pct } from '../lib/format';
import { analyzeMany, buildForecast } from '../lib/analysis/forecast';
import OverTimeTabs from '../components/OverTimeTabs';
import { BUCKET_COLOR, Card, CardTitle, Dot, Empty, Money, PageHeader, cx } from '../components/ui';
import { MonthsChart, RankBars, Sparkline } from '../components/charts';

export default function TrendsPage() {
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const [params, setParams] = useSearchParams();

  const available = useMemo(() => Object.values(db.months).filter((m) => m.txs.length || m.manual.length).map((m) => m.key).sort(), [db.months]);
  const requested = (params.get('m') ?? '').split(',').filter((k) => available.includes(k));
  const keys = requested.length ? requested : available.slice(-12);
  const analyses = useMemo(() => analyzeMany(keys, db), [keys.join(','), db]); // eslint-disable-line react-hooks/exhaustive-deps
  const forecast = useMemo(() => buildForecast(analyses, db), [analyses, db]);

  if (!available.length) {
    return (
      <div className="rise">
        <OverTimeTabs value="trends" />
        <PageHeader title={L('מגמות ותחזית', 'Trends & forecast')} />
        <Empty icon={<TrendingUp size={30} />} title={L('אין עדיין חודשים לניתוח', 'No months to analyze yet')}>
          <p>{L('מלא לפחות חודש אחד כדי לראות מגמות ותחזית לחודש הבא.', 'Fill in at least one month to see trends and a forecast for the next one.')}</p>
          <Link to="/" className="mt-3 inline-block font-medium text-accent hover:underline">{L('חזרה לבית', 'Back home')}</Link>
        </Empty>
      </div>
    );
  }

  const n = analyses.length;
  const avg = (f: (a: (typeof analyses)[number]) => number) => analyses.reduce((s, a) => s + f(a), 0) / n;
  const withIncome = analyses.filter((a) => a.income > 0);
  const avgRate = withIncome.length ? withIncome.reduce((s, a) => s + (a.savingsRate ?? 0), 0) / withIncome.length : null;

  // Merchants across the selected months
  const merged = new Map<string, { name: string; total: number; months: number; bucket: (typeof analyses)[number]['merchants'][number]['bucket'] }>();
  for (const a of analyses) for (const m of a.merchants) {
    const k = merchantKey(m.name);
    const row = merged.get(k) ?? { name: m.name, total: 0, months: 0, bucket: m.bucket };
    row.total += m.total; row.months++;
    merged.set(k, row);
  }
  const topMerchants = [...merged.values()].filter((m) => m.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);

  const toggle = (k: string) => {
    const next = keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k].sort();
    if (next.length) setParams({ m: next.join(',') }, { replace: true });
  };

  return (
    <div className="rise space-y-4">
      <OverTimeTabs value="trends" />
      <PageHeader title={L('מגמות ותחזית', 'Trends & forecast')} subtitle={L('ניתוח של כמה חודשים יחד, ומה צפוי בחודש הבא', 'Several months analyzed together, and what to expect next month')} />

      <div className="flex flex-wrap gap-2">
        {available.map((k) => (
          <button key={k} onClick={() => toggle(k)} aria-pressed={keys.includes(k)}
            className={cx('rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors', keys.includes(k) ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-muted hover:text-ink')}>
            {monthLabel(k, lang, true)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          [L('הכנסה ממוצעת', 'Average income'), <Money value={avg((a) => a.income)} />, analyses.map((a) => a.income)],
          [L('הוצאה ממוצעת', 'Average spending'), <Money value={avg((a) => a.totalSpent)} />, analyses.map((a) => a.totalSpent)],
          [L('חיסכון ממוצע', 'Average saved'), <Money value={avg((a) => a.leftover)} />, analyses.map((a) => a.leftover)],
          [L('שיעור חיסכון ממוצע', 'Average savings rate'), avgRate == null ? '—' : pct(avgRate), withIncome.map((a) => a.savingsRate ?? 0)],
        ] as [string, React.ReactNode, number[]][]).map(([label, value, series], i) => (
          <Card key={i} className="!p-4"><p className="text-[13px] text-muted">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
            {series.length > 1
              ? <div className="mt-2" dir="ltr" title={L('מהחודש הראשון שנבחר עד האחרון', 'From the first selected month to the last')}><Sparkline values={series} /></div>
              : <p className="mt-0.5 text-xs text-muted">{L(`על פני ${n} חודשים`, `Across ${n} month${n > 1 ? 's' : ''}`)}</p>}</Card>
        ))}
      </div>

      <Card>
        <CardTitle hint={L('העמודה האחרונה היא תחזית לחודש הבא', 'The last column is the forecast for next month')}>{L('הוצאות לפי חודש', 'Spending by month')}</CardTitle>
        <MonthsChart analyses={analyses}
          forecast={forecast && { month: forecast.month, values: { needs: forecast.byBucket.needs.expected, wants: forecast.byBucket.wants.expected, invest: forecast.byBucket.invest.expected } }} />
        <div className="mt-4 overflow-x-auto border-t border-line pt-3">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-[13px] text-muted">
              <th className="py-1.5 text-start font-medium">{L('חודש', 'Month')}</th>
              <th className="py-1.5 text-end font-medium">{L('הכנסה', 'Income')}</th>
              {SPEND_BUCKETS.map((b) => <th key={b} className="py-1.5 text-end font-medium">{bucketName(b, lang)}</th>)}
              <th className="py-1.5 text-end font-medium">{L('סך הכול', 'Total')}</th></tr></thead>
            <tbody>
              {analyses.map((a) => (
                <tr key={a.key} className="border-t border-line/60">
                  <td className="py-1.5"><Link to={`/month/${a.key}/analysis`} className="hover:underline">{monthLabel(a.key, lang)}</Link></td>
                  <td className="py-1.5 text-end"><Money value={a.income} /></td>
                  {SPEND_BUCKETS.map((b) => <td key={b} className={cx('py-1.5 text-end', b !== 'invest' && a.target[b] > 0 && a.spent[b] > a.target[b] && 'text-bad')}><Money value={a.spent[b]} /></td>)}
                  <td className="py-1.5 text-end font-semibold"><Money value={a.totalSpent} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {forecast && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle hint={n === 1
              ? L('מבוסס על חודש אחד בלבד — התחזית תשתפר ככל שתמלא עוד חודשים', 'Based on a single month — the forecast improves as you fill in more')
              : L(`ממוצע משוקלל של ${forecast.basedOn.length} חודשים, עם משקל גבוה יותר לאחרונים`, `Weighted average of ${forecast.basedOn.length} months, recent ones count more`)}>
              {L('תחזית ל', 'Forecast for ')}{monthLabel(forecast.month, lang)}
            </CardTitle>
            <div className="space-y-3">
              {SPEND_BUCKETS.map((b) => {
                const f = forecast.byBucket[b];
                return (
                  <div key={b} className="flex items-center justify-between gap-3 rounded-2xl bg-surface2 px-4 py-3">
                    <span className="flex items-center gap-2 font-medium"><Dot color={BUCKET_COLOR[b]} />{bucketName(b, lang)}</span>
                    <span className="text-end"><Money value={f.expected} className="text-lg font-bold" />
                      {n > 1 && <span className="block text-xs text-muted">{L('טווח', 'Range')} <Money value={f.low} />–<Money value={f.high} /></span>}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t border-line px-1 pt-3">
                <span className="text-sm text-muted">{L('סך הוצאות צפוי', 'Expected total spending')}</span><Money value={forecast.total} className="text-xl font-bold" />
              </div>
              {forecast.income > 0 && (
                <p className={cx('text-sm', forecast.income - forecast.total >= 0 ? 'text-good' : 'text-bad')}>
                  {forecast.income - forecast.total >= 0
                    ? L('בהכנסה דומה צפוי להישאר לך ', 'With similar income you should have ')
                    : L('בהכנסה דומה צפוי גירעון של ', 'With similar income, expect a deficit of ')}
                  <Money value={Math.abs(forecast.income - forecast.total)} className="font-bold" />{forecast.income - forecast.total >= 0 ? L('', ' left') : ''}
                </p>
              )}
              {forecast.trend != null && Math.abs(forecast.trend) > 50 && (
                <p className="flex items-center gap-2 text-sm text-ink2">
                  {forecast.trend > 0 ? <TrendingUp size={16} className="text-bad" /> : <TrendingDown size={16} className="text-good" />}
                  {forecast.trend > 0 ? L('ההוצאות עולות בכ-', 'Spending is rising by about ') : L('ההוצאות יורדות בכ-', 'Spending is falling by about ')}
                  <Money value={Math.abs(forecast.trend)} className="font-semibold" />{L(' בחודש', ' a month')}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle hint={L('תשלומים והוראות קבע שכבר ידוע שיירדו', 'Installments and standing orders already known to be charged')}
              action={<Money value={forecast.committed.total} className="font-bold" />}>
              {L('כבר התחייבת לחודש הבא', 'Already committed next month')}
            </CardTitle>
            {forecast.committed.installments.length + forecast.committed.standing.length === 0
              ? <p className="text-sm text-muted">{L('לא נמצאו תשלומים או הוראות קבע.', 'No installments or standing orders found.')}</p>
              : (
                <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">
                  {forecast.committed.installments.map((x, i) => (
                    <li key={`i${i}`} className="flex justify-between gap-3 py-2"><span className="min-w-0"><bdi className="block truncate">{x.merchant}</bdi>
                      <span className="text-xs text-muted">{L(`תשלום ${x.n} מתוך ${x.of}`, `Payment ${x.n} of ${x.of}`)}</span></span><Money value={x.amount} agorot className="font-medium" /></li>
                  ))}
                  {forecast.committed.standing.map((x, i) => (
                    <li key={`s${i}`} className="flex justify-between gap-3 py-2"><span className="min-w-0"><bdi className="block truncate">{x.merchant}</bdi>
                      <span className="text-xs text-muted">{L('הוראת קבע', 'Standing order')}</span></span><Money value={x.amount} agorot className="font-medium" /></li>
                  ))}
                </ul>
              )}
          </Card>
        </div>
      )}

      <Card>
        <CardTitle hint={L('סך הכול על פני החודשים שנבחרו', 'Total across the selected months')}>{L('בתי העסק המובילים', 'Top merchants')}</CardTitle>
        <RankBars lang={lang} rows={topMerchants.map((m) => ({ key: m.name, label: m.name, sub: n > 1 ? L(`${m.months} חודשים`, `${m.months} mo`) : undefined, value: m.total, color: BUCKET_COLOR[m.bucket ?? 'none'] }))} />
      </Card>
    </div>
  );
}
