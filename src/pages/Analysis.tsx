// The month at a glance. One picture answers "how did I do"; at most three insights say what
// stood out; everything else is one tap away rather than on the page.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, ChevronDown, CircleAlert, CircleCheck, Info, Pencil, TriangleAlert, CreditCard } from 'lucide-react';
import type { SpendBucket, Tx } from '../lib/types';
import { bucketName, emptyMonth, offeredCategories, shownCategoryName, useCardLabel, useL, useLang, useStore } from '../lib/store';
import { dayLabel, isMonthKey, merchantKey, money, monthLabel, pct, previousMonth } from '../lib/format';
import { analyzeMonth, previousAnalysis } from '../lib/analysis/compute';
import { buildInsights, topInsights, type Tone } from '../lib/analysis/insights';
import { sourceOf } from '../lib/learn';
import { BUCKET_COLOR, Button, Card, CardTitle, CountMoney, Dot, Empty, Meter, Money, MonthSwitcher, PageHeader, Segmented, cx } from '../components/ui';
import { DailyChart, MonthPicture } from '../components/charts';

const TONE_ICON: Record<Tone, React.ReactNode> = {
  good: <CircleCheck size={18} className="text-good" />, warn: <TriangleAlert size={18} className="text-warn" />,
  bad: <CircleAlert size={18} className="text-bad" />, info: <Info size={18} className="text-accent" />,
};

type Tab = 'wants' | 'needs' | 'un';

/** A section that stays closed until asked for. */
function More({ title, value, children }: { title: string; value?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface shadow-[var(--shadow)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="me-auto text-[15px] font-semibold">{title}</span>
        {value != null && <span className="text-sm text-ink2">{value}</span>}
        <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}

export default function AnalysisPage() {
  const { month = '' } = useParams();
  const navigate = useNavigate();
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const { assign } = useStore();
  const cardLabel = useCardLabel();
  const key = isMonthKey(month) ? month : previousMonth();
  const m = db.months[key] ?? emptyMonth(key);

  const a = useMemo(() => analyzeMonth(m, db), [m, db]);
  const prev = useMemo(() => previousAnalysis(key, db), [key, db]);
  const insights = useMemo(() => topInsights(buildInsights(a, prev, lang)), [a, prev, lang]);
  const [tab, setTab] = useState<Tab>('wants');
  const [open, setOpen] = useState<string | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const header = (
    <PageHeader title={monthLabel(key, lang)}
      subtitle={a.basis === 'goal' ? L('מול היעד שהגדרת מראש', 'Against the goal you set in advance') : a.basis === 'income' ? L(`מול חלוקה של ${a.split.needs}/${a.split.wants}/${a.split.invest} מההכנסה`, `Against a ${a.split.needs}/${a.split.wants}/${a.split.invest} split of income`) : undefined}>
      <Button icon={<Pencil size={15} />} onClick={() => navigate(`/month/${key}`)}>{L('עריכה', 'Edit')}</Button>
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

  const cats = offeredCategories(db);
  const catById = new Map(db.categories.map((c) => [c.id, c]));
  const bucketOfTx = (t: Tx) => (t.categoryId ? catById.get(t.categoryId)?.bucket ?? null : null);
  const hasIncome = a.income > 0;
  const saved = Math.max(a.leftover, 0);
  const metSavings = hasIncome && a.target.invest > 0 && saved >= a.target.invest;
  const toReview = a.unclassified.count + a.guessed.count;
  const spendDiff = prev && prev.totalSpent > 0 ? (a.totalSpent - prev.totalSpent) / prev.totalSpent : null;

  // The three rows under the picture double as its legend.
  const rows = (['needs', 'wants', 'invest'] as SpendBucket[]).map((b) => {
    const actual = a.spent[b], target = a.target[b];
    const diff = b === 'invest' ? actual - target : target - actual; // positive = good
    return { b, actual, target, diff, ok: target <= 0 || diff >= 0 };
  });

  const tabs: { value: Tab; label: string }[] = [
    { value: 'wants', label: bucketName('wants', lang) }, { value: 'needs', label: bucketName('needs', lang) },
    ...(a.unclassified.count ? [{ value: 'un' as Tab, label: L('לא מסווג', 'Unclassified') }] : []),
  ];
  const activeTab: Tab = tab === 'un' && !a.unclassified.count ? 'wants' : tab;
  // Categories of the open bucket, then the merchants inside the open category.
  const catRows = activeTab === 'un' ? [] : a.categories.filter((c) => c.bucket === activeTab && c.total !== 0);
  const single = catRows.length <= 1; // nothing to choose between: go straight to merchants
  const catId = activeTab === 'un' ? null : single ? catRows[0]?.id ?? activeTab : openCat;
  const inCat = (t: Tx) => (activeTab === 'un' ? bucketOfTx(t) == null : single ? bucketOfTx(t) === activeTab : t.categoryId === catId);
  const merchantMap = new Map<string, { name: string; total: number; count: number; manual?: boolean }>();
  for (const t of m.txs) {
    if (!inCat(t)) continue;
    const k = merchantKey(t.merchant);
    const row = merchantMap.get(k) ?? { name: t.merchant, total: 0, count: 0 };
    row.total += t.amount; row.count++;
    merchantMap.set(k, row);
  }
  // Lines typed by hand (rent, a bank standing order) belong to a category too.
  if (activeTab !== 'un') for (const x of m.manual) {
    if (x.kind !== 'expense' || !x.amount) continue;
    const b = x.categoryId ? catById.get(x.categoryId)?.bucket : null;
    if (single ? b === activeTab : x.categoryId === catId) merchantMap.set(`manual:${x.id}`, { name: x.label || L('הוצאה ידנית', 'Manual expense'), total: Number(x.amount) || 0, count: 1, manual: true });
  }
  const merchants = [...merchantMap.entries()].map(([k, v]) => ({ k, ...v })).filter((x) => x.total > 0).sort((x, y) => y.total - x.total);
  const shown = showAll ? merchants : merchants.slice(0, 6);
  const maxMerchant = Math.max(...merchants.map((x) => x.total), 1);
  const maxCat = Math.max(...catRows.map((c) => c.total), 1);
  const tabTotal = activeTab === 'un' ? a.unclassified.total : a.spent[activeTab];
  const tabColor = activeTab === 'un' ? 'var(--neutral-mark)' : BUCKET_COLOR[activeTab];
  const txsOf = (k: string) => m.txs.filter((t) => merchantKey(t.merchant) === k && inCat(t)).sort((x, y) => y.date.localeCompare(x.date));
  // What moved most against last month, by category.
  const prevCats = new Map((prev?.categories ?? []).map((c) => [c.id, c.total]));
  const changes = !prev ? [] : [...new Set([...a.categories.map((c) => c.id), ...prevCats.keys()])]
    .filter((id) => { const b = catById.get(id)?.bucket; return b === 'needs' || b === 'wants'; })
    .map((id) => { const now = a.categories.find((c) => c.id === id)?.total ?? 0, before = prevCats.get(id) ?? 0; return { id, now, before, diff: now - before }; })
    .filter((c) => Math.abs(c.diff) >= 50)
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).slice(0, 3);
  const openInst = a.installments.filter((i) => i.remaining > 0);
  const standingTotal = a.standing.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="rise space-y-4">
      {header}

      {/* The picture */}
      <Card>
        {hasIncome ? (
          <>
            <p className="text-sm text-ink2">{a.leftover >= 0 ? L('חסכת החודש', 'You saved this month') : L('הוצאת יותר ממה שהכנסת', 'You spent more than you earned')}</p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
              <CountMoney value={a.leftover} className={cx('text-4xl font-bold tracking-tight', a.leftover < 0 && 'text-bad')} />
              {a.leftover >= 0 && <span className="text-sm text-ink2">{pct(a.savingsRate ?? 0)} {L('מההכנסה', 'of income')}{a.target.invest > 0 && <> · {L('היעד', 'target')} {a.split.invest}%</>}</span>}
            </p>
            {a.target.invest > 0 && a.leftover >= 0 && (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink2">
                {metSavings ? <><CircleCheck size={16} className="text-good" />{L('עמדת ביעד החיסכון', 'You met the savings target')}</>
                  : <><TriangleAlert size={16} className="text-warn" />{L(`חסרים ${money(a.target.invest - saved, lang)} ליעד החיסכון`, `${money(a.target.invest - saved, lang)} short of the savings target`)}</>}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-ink2">{L('הוצאת החודש', 'You spent this month')}</p>
            <CountMoney value={a.totalSpent} className="mt-0.5 block text-4xl font-bold tracking-tight" />
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-ink2"><TriangleAlert size={16} className="text-warn" />{L('לא הוזנה הכנסה, אז אי אפשר לחשב חיסכון.', 'No income was entered, so savings cannot be calculated.')}
              <Link to={`/month/${key}`} className="font-semibold text-accent hover:underline">{L('הוסף הכנסה', 'Add income')}</Link></p>
          </>
        )}

        <div className="mt-5"><MonthPicture a={a} /></div>

        <ul className="mt-4 divide-y divide-line">
          {rows.filter((r) => r.b !== 'invest' || hasIncome).map((r) => (
            <li key={r.b} className="py-3">
             <div className="flex items-center gap-3">
              <Dot color={BUCKET_COLOR[r.b]} className="!h-3 !w-3" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{bucketName(r.b, lang)}</p>
                {r.target > 0 && (
                  <p className="flex items-center gap-1 text-[13px] text-ink2">
                    {r.ok ? <Check size={13} className="shrink-0 text-good" /> : <TriangleAlert size={13} className="shrink-0 text-bad" />}
                    {r.b === 'invest'
                      ? r.ok ? L(`${money(r.diff, lang)} מעל היעד`, `${money(r.diff, lang)} above target`) : L(`${money(-r.diff, lang)} מתחת ליעד`, `${money(-r.diff, lang)} below target`)
                      : r.ok ? L(`נשארו ${money(r.diff, lang)}`, `${money(r.diff, lang)} left`) : L(`חריגה של ${money(-r.diff, lang)}`, `${money(-r.diff, lang)} over`)}
                  </p>
                )}
              </div>
              <div className="text-end">
                <Money value={r.actual} className="font-semibold" />
                {r.target > 0 && <p className="text-[13px] text-muted">{L('מתוך', 'of')} <Money value={r.target} /></p>}
              </div>
             </div>
             {r.target > 0 && <div className="mt-2"><Meter value={r.actual} target={r.target} color={BUCKET_COLOR[r.b]} soft={`var(--${r.b}-soft)`} overIsBad={r.b !== 'invest'}
               label={`${bucketName(r.b, lang)}: ${money(r.actual, lang)} ${L('מתוך', 'of')} ${money(r.target, lang)}`} /></div>}
            </li>
          ))}
        </ul>
        {spendDiff != null && Math.abs(spendDiff) >= 0.01 && (
          <p className="mt-1 border-t border-line pt-3 text-[13px] text-ink2">
            {spendDiff > 0 ? L(`ההוצאות עלו ב-${pct(spendDiff)} לעומת החודש הקודם`, `Spending is up ${pct(spendDiff)} on last month`) : L(`ההוצאות ירדו ב-${pct(-spendDiff)} לעומת החודש הקודם`, `Spending is down ${pct(-spendDiff)} on last month`)}
            {' '}(<Money value={a.totalSpent} /> {L('מול', 'vs')} <Money value={prev!.totalSpent} />)
          </p>
        )}
      </Card>

      {/* Anything that makes the numbers above less than exact */}
      {toReview > 0 && (
        <Link to={`/month/${key}/classify`} className="flex items-center gap-3 rounded-2xl border border-warn bg-surface2 px-5 py-3.5 text-sm">
          <TriangleAlert size={18} className="shrink-0 text-warn" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{L('המספרים עדיין לא סופיים', 'The numbers are not final yet')}</span>
            <span className="text-ink2">
              {[a.unclassified.count ? L(`${a.unclassified.count} עסקאות לא מסווגות (${money(a.unclassified.total, lang)})`, `${a.unclassified.count} unclassified (${money(a.unclassified.total, lang)})`) : '',
                a.guessed.count ? L(`${a.guessed.count} ניחושים לאישור (${money(a.guessed.total, lang)})`, `${a.guessed.count} guesses to confirm (${money(a.guessed.total, lang)})`) : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="shrink-0 font-semibold text-accent">{L('לסיווג', 'Review')}</span>
        </Link>
      )}

      {insights.length > 0 && (
        <Card>
          <CardTitle>{L('מה בלט החודש', 'What stood out')}</CardTitle>
          <ul className="space-y-3">
            {insights.map((i) => (
              <li key={i.id} className="flex gap-3">
                <span className="mt-0.5 shrink-0">{TONE_ICON[i.tone]}</span>
                <div className="min-w-0"><p className="font-semibold leading-snug">{i.title}</p><p className="mt-0.5 text-sm text-ink2">{i.body}</p></div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {changes.length > 0 && (
        <Card>
          <CardTitle hint={L('הקטגוריות שזזו הכי הרבה', 'The categories that moved the most')}>{L('מה השתנה מהחודש הקודם', 'What changed since last month')}</CardTitle>
          <ul className="divide-y divide-line">
            {changes.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                {c.diff > 0 ? <ArrowUp size={18} className="shrink-0 text-bad" /> : <ArrowDown size={18} className="shrink-0 text-good" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{shownCategoryName(db, catById.get(c.id), lang)}</p>
                  <p className="text-[13px] text-muted"><Money value={c.before} /> {lang === 'he' ? '←' : '→'} <Money value={c.now} /></p>
                </div>
                <span className="shrink-0 text-end font-semibold">{c.diff > 0 ? L('עלה ב-', 'Up ') : L('ירד ב-', 'Down ')}<Money value={Math.abs(c.diff)} /></span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Where it went: bucket → category → merchants → transactions */}
      <Card>
        <CardTitle hint={L('לחץ על קטגוריה כדי לראות את בתי העסק, ועל בית עסק כדי לראות עסקאות ולתקן סיווג', 'Tap a category to see its merchants, and a merchant to see its transactions and fix a category')}>{L('לאן הלך הכסף', 'Where the money went')}</CardTitle>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Segmented size="sm" value={activeTab} onChange={(v) => { setTab(v); setOpen(null); setOpenCat(null); setShowAll(false); }} options={tabs} />
          <Money value={tabTotal} className="font-bold" />
        </div>
        {activeTab !== 'un' && !single ? (
          <ul className="space-y-1">
            {catRows.map((c) => {
              const isOpen = openCat === c.id;
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => { setOpenCat(isOpen ? null : c.id); setOpen(null); setShowAll(false); }} aria-expanded={isOpen} className="press -mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-2 text-start hover:bg-surface2">
                    <span className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">{shownCategoryName(db, catById.get(c.id), lang)}<span className="ms-2 text-xs font-normal text-muted">{tabTotal > 0 ? pct(c.total / tabTotal) : ''}</span></span>
                      <span className="flex shrink-0 items-center gap-1"><Money value={c.total} className="font-semibold" /><ChevronDown size={15} className={cx('text-muted transition-transform', isOpen && 'rotate-180')} /></span>
                    </span>
                    <span className="block h-2.5 rounded-full bg-surface2"><span className="grow block h-full rounded-full" style={{ width: `${Math.max((Math.max(c.total, 0) / maxCat) * 100, 1)}%`, background: tabColor }} /></span>
                  </button>
                  {isOpen && <div className="mb-3 ms-3 mt-1 border-s-2 border-line ps-3">
          <ul className="space-y-1">
              {shown.map((x) => {
                const isOpen = open === x.k;
                return (
                  <li key={x.k}>
                    <button type="button" disabled={x.manual} onClick={() => setOpen(isOpen ? null : x.k)} aria-expanded={x.manual ? undefined : isOpen} className={cx('-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-start', !x.manual && 'hover:bg-surface2')}>
                      <span className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate"><bdi>{x.name}</bdi>{x.count > 1 && <span className="ms-1.5 text-xs text-muted">×{x.count}</span>}</span>
                        <span className="flex shrink-0 items-center gap-1"><Money value={x.total} className="font-semibold" />{!x.manual && <ChevronDown size={14} className={cx('text-muted transition-transform', isOpen && 'rotate-180')} />}</span>
                      </span>
                      <span className="block h-1.5 rounded-full bg-surface2"><span className="grow block h-full rounded-full" style={{ width: `${Math.max((x.total / maxMerchant) * 100, 1)}%`, background: tabColor }} /></span>
                    </button>
                    {isOpen && (
                      <ul className="mb-2 mt-1 divide-y divide-line rounded-xl bg-surface2 px-3 text-sm">
                        {txsOf(x.k).map((t) => (
                          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                            <span className="w-14 shrink-0 text-muted">{dayLabel(t.date, lang)}</span>
                          <span className="flex max-w-28 items-center gap-1 truncate text-xs text-muted"><CreditCard size={12} className="shrink-0" /><bdi className="truncate">{cardLabel(t.card)}</bdi></span>
                            <Money value={t.amount} agorot className={cx('me-auto font-medium', t.amount < 0 && 'text-good')} />
                            {t.installment && <span className="text-xs text-muted" dir="ltr">{t.installment.n}/{t.installment.of}</span>}
                            {sourceOf(t) === 'guess' && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-warn text-[11px] font-bold text-page" title={L('ניחוש', 'Guess')}>?</span>}
                            <select value={t.categoryId ?? ''} onChange={(e) => assign(key, [t.id], e.target.value || null)} aria-label={L('קטגוריה', 'Category')}
                              className="max-w-40 rounded-lg border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none">
                              <option value="">{L('לא מסווג', 'Unclassified')}</option>
                              {cats.map((c) => <option key={c.id} value={c.id}>{shownCategoryName(db, c, lang)}</option>)}
                            </select>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
              {!showAll && merchants.length > 6 && <li><Button size="sm" variant="ghost" className="mt-1" onClick={() => setShowAll(true)}>{L(`הצג את כל ${merchants.length}`, `Show all ${merchants.length}`)}</Button></li>}
            </ul>
                  </div>}
                </li>
              );
            })}
          </ul>
        ) : merchants.length ? (
          <ul className="space-y-1">
            {shown.map((x) => {
              const isOpen = open === x.k;
              return (
                <li key={x.k}>
                  <button type="button" disabled={x.manual} onClick={() => setOpen(isOpen ? null : x.k)} aria-expanded={x.manual ? undefined : isOpen} className={cx('-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-start', !x.manual && 'hover:bg-surface2')}>
                    <span className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate"><bdi>{x.name}</bdi>{x.count > 1 && <span className="ms-1.5 text-xs text-muted">×{x.count}</span>}</span>
                      <span className="flex shrink-0 items-center gap-1"><Money value={x.total} className="font-semibold" />{!x.manual && <ChevronDown size={14} className={cx('text-muted transition-transform', isOpen && 'rotate-180')} />}</span>
                    </span>
                    <span className="block h-1.5 rounded-full bg-surface2"><span className="grow block h-full rounded-full" style={{ width: `${Math.max((x.total / maxMerchant) * 100, 1)}%`, background: tabColor }} /></span>
                  </button>
                  {isOpen && (
                    <ul className="mb-2 mt-1 divide-y divide-line rounded-xl bg-surface2 px-3 text-sm">
                      {txsOf(x.k).map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                          <span className="w-14 shrink-0 text-muted">{dayLabel(t.date, lang)}</span>
                          <span className="flex max-w-28 items-center gap-1 truncate text-xs text-muted"><CreditCard size={12} className="shrink-0" /><bdi className="truncate">{cardLabel(t.card)}</bdi></span>
                          <Money value={t.amount} agorot className={cx('me-auto font-medium', t.amount < 0 && 'text-good')} />
                          {t.installment && <span className="text-xs text-muted" dir="ltr">{t.installment.n}/{t.installment.of}</span>}
                          {sourceOf(t) === 'guess' && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-warn text-[11px] font-bold text-page" title={L('ניחוש', 'Guess')}>?</span>}
                          <select value={t.categoryId ?? ''} onChange={(e) => assign(key, [t.id], e.target.value || null)} aria-label={L('קטגוריה', 'Category')}
                            className="max-w-40 rounded-lg border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none">
                            <option value="">{L('לא מסווג', 'Unclassified')}</option>
                            {cats.map((c) => <option key={c.id} value={c.id}>{shownCategoryName(db, c, lang)}</option>)}
                          </select>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            {!showAll && merchants.length > 6 && <li><Button size="sm" variant="ghost" className="mt-1" onClick={() => setShowAll(true)}>{L(`הצג את כל ${merchants.length}`, `Show all ${merchants.length}`)}</Button></li>}
          </ul>
        ) : <p className="text-sm text-muted">{L('אין כאן הוצאות החודש.', 'Nothing here this month.')}</p>}
      </Card>

      {/* Details, closed by default */}
      {a.standing.length > 0 && (
        <More title={L('מנויים והוראות קבע', 'Subscriptions & standing orders')} value={<><Money value={standingTotal} /> {L('בחודש', 'a month')}</>}>
          <p className="mb-2 text-sm text-ink2">{L(`זה ${money(standingTotal * 12, lang)} בשנה. שווה לוודא שכל אחד עדיין בשימוש.`, `That is ${money(standingTotal * 12, lang)} a year. Worth checking each one is still used.`)}</p>
          <ul className="divide-y divide-line text-sm">
            {a.standing.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2"><bdi className="truncate">{s.merchant}</bdi>
                <span className="shrink-0 text-end"><Money value={s.amount} agorot className="font-medium" /><span className="block text-xs text-muted"><Money value={s.amount * 12} /> {L('בשנה', 'a year')}</span></span></li>
            ))}
          </ul>
        </More>
      )}
      {openInst.length > 0 && (
        <More title={L('תשלומים שעוד יירדו', 'Installments still to come')} value={<Money value={openInst.reduce((s, x) => s + x.remainingTotal, 0)} />}>
          <ul className="divide-y divide-line text-sm">
            {openInst.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0"><bdi className="block truncate">{s.merchant}</bdi><span className="text-xs text-muted">{L(`תשלום ${s.n} מתוך ${s.of} · עוד ${s.remaining}`, `Payment ${s.n} of ${s.of} · ${s.remaining} to go`)}</span></span>
                <span className="shrink-0 text-end"><Money value={s.amount} agorot className="font-medium" /><span className="block text-xs text-muted">{L('נותר', 'Remaining')} <Money value={s.remainingTotal} /></span></span>
              </li>
            ))}
          </ul>
        </More>
      )}
      {a.daily.length > 0 && (
        <More title={L('הוצאות לפי יום', 'Spending by day')}>
          <DailyChart daily={a.daily} />
        </More>
      )}
      {(a.ignored !== 0 || a.setAside !== 0) && (
        <p className="px-1 text-[13px] text-muted">
          {[a.ignored !== 0 ? L(`${money(a.ignored, lang)} סומנו "לא לספור" ואינם בחישוב`, `${money(a.ignored, lang)} is marked "don't count" and left out`) : '',
            a.setAside !== 0 ? L(`${money(a.setAside, lang)} מהחיסכון כבר סומנו כהפקדה`, `${money(a.setAside, lang)} of the savings is already marked as deposited`) : ''].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}
