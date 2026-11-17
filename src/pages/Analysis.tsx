// The month at a glance: one screen that answers "how did I do", and four tiles that each open a
// screen of their own. The open screen lives in the address (?v=where), so the phone's back button
// returns to the overview.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CreditCard, Info, Pencil, PieChart, Sparkles, TrendingUp, TriangleAlert } from 'lucide-react';
import type { Tx } from '../lib/types';
import { bucketName, emptyMonth, offeredCategories, shownCategoryName, useCardLabel, useL, useLang, useStore } from '../lib/store';
import { dayLabel, isMonthKey, merchantKey, money, monthLabel, pct, previousMonth } from '../lib/format';
import { analyzeMonth, previousAnalysis } from '../lib/analysis/compute';
import { buildInsights, topInsights, type Tone } from '../lib/analysis/insights';
import { sourceOf } from '../lib/learn';
import { BUCKET_COLOR, Button, Card, CountMoney, Dot, Empty, IconButton, Meter, Money, Segmented, cx } from '../components/ui';
import { DailyChart, MonthPicture } from '../components/charts';
import { MonthPicker } from './Month';

const TONE_ICON: Record<Tone, React.ReactNode> = {
  good: <CircleCheck size={18} className="text-good" />, warn: <TriangleAlert size={18} className="text-warn" />,
  bad: <CircleAlert size={18} className="text-bad" />, info: <Info size={18} className="text-accent" />,
};

type Tab = 'wants' | 'needs' | 'un';
type View = 'where' | 'changes' | 'stood' | 'coming';
const VIEWS: View[] = ['where', 'changes', 'stood', 'coming'];

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
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const { assign } = useStore();
  const cardLabel = useCardLabel();
  const key = isMonthKey(month) ? month : previousMonth();
  const m = db.months[key] ?? emptyMonth(key);
  const view = VIEWS.find((v) => v === params.get('v')) ?? null;

  const a = useMemo(() => analyzeMonth(m, db), [m, db]);
  const prev = useMemo(() => previousAnalysis(key, db), [key, db]);
  const insights = useMemo(() => topInsights(buildInsights(a, prev, lang), 6), [a, prev, lang]);
  const [tab, setTab] = useState<Tab>('wants');
  const [open, setOpen] = useState<string | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Opening a tile slides its screen in; going back slides the overview back.
  const wasDetail = useRef(false);
  const direction = view || !wasDetail.current ? 'step-next' : 'step-back';
  useEffect(() => { wasDetail.current = view != null; window.scrollTo(0, 0); }, [view]);
  const openView = (v: View) => navigate(`/month/${key}/analysis?v=${v}`);
  const Back = lang === 'he' ? ChevronRight : ChevronLeft;
  const Fwd = lang === 'he' ? ChevronLeft : ChevronRight;

  if (!a.hasData || (!m.txs.length && !m.manual.length)) {
    return (
      <div className="rise">
        <div className="mb-5 flex items-center justify-between gap-3"><MonthPicker value={key} latest={previousMonth()} onPick={(k) => navigate(`/month/${k}/analysis`)} /></div>
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

  // ----- where the money went: bucket → category → merchant → transactions -----
  const tabs: { value: Tab; label: string }[] = [
    { value: 'wants', label: bucketName('wants', lang) }, { value: 'needs', label: bucketName('needs', lang) },
    ...(a.unclassified.count ? [{ value: 'un' as Tab, label: L('לא מסווג', 'Unclassified') }] : []),
  ];
  const activeTab: Tab = tab === 'un' && !a.unclassified.count ? 'wants' : tab;
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

  // ----- what changed: every category that moved, biggest first -----
  const prevCats = new Map((prev?.categories ?? []).map((c) => [c.id, c.total]));
  const changes = !prev ? [] : [...new Set([...a.categories.map((c) => c.id), ...prevCats.keys()])]
    .filter((id) => { const b = catById.get(id)?.bucket ?? id; return b === 'needs' || b === 'wants'; })
    .map((id) => { const now = a.categories.find((c) => c.id === id)?.total ?? 0, before = prevCats.get(id) ?? 0; return { id, now, before, diff: now - before }; })
    .filter((c) => Math.abs(c.diff) >= 50)
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  const catLabel = (id: string) => shownCategoryName(db, catById.get(id), lang) || bucketName(id as 'needs', lang);

  // ----- coming up -----
  const openInst = a.installments.filter((i) => i.remaining > 0);
  const standingTotal = a.standing.reduce((s, x) => s + x.amount, 0);
  const committed = standingTotal + openInst.reduce((s, x) => s + x.amount, 0);

  // ================= a detail screen =================
  if (view) {
    const titles: Record<View, string> = {
      where: L('לאן הלך הכסף', 'Where the money went'), changes: L('מה השתנה מהחודש הקודם', 'What changed since last month'),
      stood: L('מה בלט החודש', 'What stood out'), coming: L('מה צפוי בחודשים הבאים', 'Coming up in the next months'),
    };
    const merchantList = (
      <ul className="space-y-1">
        {shown.map((x) => {
          const isOpen = open === x.k;
          return (
            <li key={x.k}>
              <button type="button" disabled={x.manual} onClick={() => setOpen(isOpen ? null : x.k)} aria-expanded={x.manual ? undefined : isOpen} className={cx('press -mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-start', !x.manual && 'hover:bg-surface2')}>
                <span className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate"><bdi>{x.name}</bdi>{x.count > 1 && <span className="ms-1.5 text-xs text-muted">×{x.count}</span>}</span>
                  <span className="flex shrink-0 items-center gap-1"><Money value={x.total} className="font-semibold" />{!x.manual && <ChevronDown size={14} className={cx('text-muted transition-transform', isOpen && 'rotate-180')} />}</span>
                </span>
                <span className="block h-1.5 rounded-full bg-surface2"><span className="grow block h-full rounded-full" style={{ width: `${Math.max((x.total / maxMerchant) * 100, 1)}%`, background: tabColor }} /></span>
              </button>
              {isOpen && (
                <ul className="rise mb-2 mt-1 divide-y divide-line rounded-xl bg-surface2 px-3 text-sm">
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
    );

    return (
      <div key={view} className={cx(direction, 'space-y-4')}>
        <header className="flex items-center gap-2">
          <IconButton label={L('חזרה לסיכום', 'Back to the overview')} className="!h-10 !w-10" onClick={() => navigate(-1)}><Back size={22} /></IconButton>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight">{titles[view]}</h1>
            <p className="text-[13px] text-muted">{monthLabel(key, lang)}</p>
          </div>
        </header>

        {view === 'where' && (
          <>
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <Segmented size="sm" value={activeTab} onChange={(v) => { setTab(v); setOpen(null); setOpenCat(null); setShowAll(false); }} options={tabs} />
                <Money value={tabTotal} className="text-lg font-bold" />
              </div>
              {activeTab !== 'un' && !single ? (
                <ul className="space-y-1">
                  {catRows.map((c) => {
                    const isOpen = openCat === c.id;
                    return (
                      <li key={c.id}>
                        <button type="button" onClick={() => { setOpenCat(isOpen ? null : c.id); setOpen(null); setShowAll(false); }} aria-expanded={isOpen} className="press -mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-2 text-start hover:bg-surface2">
                          <span className="mb-1.5 flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate font-medium">{catLabel(c.id)}<span className="ms-2 text-xs font-normal text-muted">{tabTotal > 0 ? pct(c.total / tabTotal) : ''}</span></span>
                            <span className="flex shrink-0 items-center gap-1"><Money value={c.total} className="font-semibold" /><ChevronDown size={15} className={cx('text-muted transition-transform', isOpen && 'rotate-180')} /></span>
                          </span>
                          <span className="block h-2.5 rounded-full bg-surface2"><span className="grow block h-full rounded-full" style={{ width: `${Math.max((Math.max(c.total, 0) / maxCat) * 100, 1)}%`, background: tabColor }} /></span>
                        </button>
                        {isOpen && <div className="rise mb-3 ms-3 mt-1 border-s-2 border-line ps-3">{merchantList}</div>}
                      </li>
                    );
                  })}
                </ul>
              ) : merchants.length ? merchantList : <p className="text-sm text-muted">{L('אין כאן הוצאות החודש.', 'Nothing here this month.')}</p>}
            </Card>
            {a.daily.length > 0 && <More title={L('הוצאות לפי יום', 'Spending by day')}><DailyChart daily={a.daily} /></More>}
            {(a.ignored !== 0 || a.setAside !== 0) && (
              <p className="px-1 text-[13px] text-muted">
                {[a.ignored !== 0 ? L(`${money(a.ignored, lang)} סומנו "לא לספור" ואינם בחישוב`, `${money(a.ignored, lang)} is marked "don't count" and left out`) : '',
                  a.setAside !== 0 ? L(`${money(a.setAside, lang)} מהחיסכון כבר סומנו כהפקדה`, `${money(a.setAside, lang)} of the savings is already marked as deposited`) : ''].filter(Boolean).join(' · ')}
              </p>
            )}
          </>
        )}

        {view === 'changes' && (
          <Card>
            {spendDiff != null && (
              <p className="mb-3 text-[15px]">
                {spendDiff >= 0 ? L(`ההוצאות עלו ב-${pct(spendDiff)}`, `Spending is up ${pct(spendDiff)}`) : L(`ההוצאות ירדו ב-${pct(-spendDiff)}`, `Spending is down ${pct(-spendDiff)}`)}
                <span className="text-muted"> · <Money value={prev!.totalSpent} /> {lang === 'he' ? '←' : '→'} <Money value={a.totalSpent} /></span>
              </p>
            )}
            {changes.length ? (
              <ul className="divide-y divide-line">
                {changes.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-3">
                    {c.diff > 0 ? <ArrowUp size={18} className="shrink-0 text-bad" /> : <ArrowDown size={18} className="shrink-0 text-good" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{catLabel(c.id)}</p>
                      <p className="text-[13px] text-muted"><Money value={c.before} /> {lang === 'he' ? '←' : '→'} <Money value={c.now} /></p>
                    </div>
                    <span className="shrink-0 text-end font-semibold">{c.diff > 0 ? L('עלה ב-', 'Up ') : L('ירד ב-', 'Down ')}<Money value={Math.abs(c.diff)} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">{prev ? L('שום קטגוריה לא זזה ביותר מ-₪50.', 'No category moved by more than ₪50.') : L('אין חודש קודם להשוואה.', 'There is no previous month to compare with.')}</p>}
          </Card>
        )}

        {view === 'stood' && (
          <Card>
            {insights.length ? (
              <ul className="space-y-4">
                {insights.map((i) => (
                  <li key={i.id} className="flex gap-3">
                    <span className="mt-0.5 shrink-0">{TONE_ICON[i.tone]}</span>
                    <div className="min-w-0"><p className="font-semibold leading-snug">{i.title}</p><p className="mt-0.5 text-sm text-ink2">{i.body}</p></div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">{L('שום דבר מיוחד החודש.', 'Nothing in particular this month.')}</p>}
          </Card>
        )}

        {view === 'coming' && (
          <>
            <Card>
              <p className="text-sm text-ink2">{L('כבר ידוע שיירד בכל חודש', 'Already known to be charged each month')}</p>
              <Money value={committed} className="mt-0.5 block text-3xl font-bold tracking-tight" />
            </Card>
            <Card>
              <p className="mb-2 flex items-baseline justify-between font-semibold">{L('מנויים והוראות קבע', 'Subscriptions & standing orders')}<span className="text-sm font-normal text-muted"><Money value={standingTotal * 12} /> {L('בשנה', 'a year')}</span></p>
              {a.standing.length ? (
                <ul className="divide-y divide-line text-sm">
                  {a.standing.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2"><bdi className="truncate">{s.merchant}</bdi>
                      <span className="shrink-0 text-end"><Money value={s.amount} agorot className="font-medium" /><span className="block text-xs text-muted"><Money value={s.amount * 12} /> {L('בשנה', 'a year')}</span></span></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">{L('אין.', 'None.')}</p>}
            </Card>
            <Card>
              <p className="mb-2 flex items-baseline justify-between font-semibold">{L('תשלומים שעוד יירדו', 'Installments still to come')}<span className="text-sm font-normal text-muted">{L('נותר', 'Remaining')} <Money value={openInst.reduce((s, x) => s + x.remainingTotal, 0)} /></span></p>
              {openInst.length ? (
                <ul className="divide-y divide-line text-sm">
                  {openInst.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0"><bdi className="block truncate">{s.merchant}</bdi><span className="text-xs text-muted">{L(`תשלום ${s.n} מתוך ${s.of} · עוד ${s.remaining}`, `Payment ${s.n} of ${s.of} · ${s.remaining} to go`)}</span></span>
                      <span className="shrink-0 text-end"><Money value={s.amount} agorot className="font-medium" /><span className="block text-xs text-muted">{L('נותר', 'Remaining')} <Money value={s.remainingTotal} /></span></span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">{L('אין.', 'None.')}</p>}
            </Card>
          </>
        )}
      </div>
    );
  }

  // ================= the overview: one screen =================
  const topMerchant = a.merchants.find((x) => x.total > 0);
  const topCat = db.settings.subcategories ? [...a.categories].filter((c) => c.bucket === 'needs' || c.bucket === 'wants').sort((x, y) => y.total - x.total)[0] : undefined;
  const tiles: { v: View; icon: React.ReactNode; title: string; value: React.ReactNode; empty?: boolean }[] = [
    { v: 'where', icon: <PieChart size={18} />, title: L('לאן הלך הכסף', 'Where it went'),
      value: topCat ? <><span className="block truncate">{catLabel(topCat.id)}</span><Money value={topCat.total} className="font-bold text-ink" /></> : topMerchant ? <><bdi className="block truncate">{topMerchant.name}</bdi><Money value={topMerchant.total} className="font-bold text-ink" /></> : '—' },
    { v: 'changes', icon: <TrendingUp size={18} />, title: L('מה השתנה', 'What changed'), empty: !prev,
      value: spendDiff == null ? L('אין חודש קודם', 'No previous month') : <span className={cx('font-bold', spendDiff > 0 ? 'text-bad' : 'text-good')}>{spendDiff >= 0 ? '▲' : '▼'} {pct(Math.abs(spendDiff))}<span className="block text-xs font-normal text-muted">{L('בהוצאות', 'in spending')}</span></span> },
    { v: 'stood', icon: <Sparkles size={18} />, title: L('מה בלט', 'What stood out'), empty: !insights.length,
      value: insights[0] ? <span className="line-clamp-2">{insights[0].title}</span> : L('שום דבר מיוחד', 'Nothing special') },
    { v: 'coming', icon: <CalendarClock size={18} />, title: L('מה צפוי', 'Coming up'), empty: committed <= 0,
      value: committed > 0 ? <><Money value={committed} className="font-bold text-ink" /><span className="block text-xs text-muted">{L('בחודש, כבר ידוע', 'a month, already known')}</span></> : L('אין התחייבויות', 'Nothing committed') },
  ];

  return (
    <div className={cx(direction, 'space-y-3')}>
      <div className="flex items-center justify-between gap-2">
        <MonthPicker value={key} latest={previousMonth()} onPick={(k) => navigate(`/month/${k}/analysis`)} />
        <Button size="sm" icon={<Pencil size={14} />} onClick={() => navigate(`/month/${key}`)}>{L('עריכה', 'Edit')}</Button>
      </div>

      <Card className="!p-4">
        {hasIncome ? (
          <>
            <p className="text-[13px] text-ink2">{a.leftover >= 0 ? L('חסכת החודש', 'You saved this month') : L('הוצאת יותר ממה שהכנסת', 'You spent more than you earned')}</p>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <CountMoney value={a.leftover} className={cx('text-[34px] font-bold leading-tight tracking-tight', a.leftover < 0 && 'text-bad')} />
              {a.leftover >= 0 && <span className="text-sm text-ink2">{pct(a.savingsRate ?? 0)} {L('מההכנסה', 'of income')}</span>}
            </p>
            {a.target.invest > 0 && a.leftover >= 0 && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink2">
                {metSavings ? <><CircleCheck size={15} className="text-good" />{L(`מעל היעד של ${a.split.invest}%`, `Above the ${a.split.invest}% target`)}</>
                  : <><TriangleAlert size={15} className="text-warn" />{L(`חסרים ${money(a.target.invest - saved, lang)} ליעד`, `${money(a.target.invest - saved, lang)} short of target`)}</>}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink2">{L('הוצאת החודש', 'You spent this month')}</p>
            <CountMoney value={a.totalSpent} className="block text-[34px] font-bold leading-tight tracking-tight" />
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink2"><TriangleAlert size={15} className="text-warn" />{L('לא הוזנה הכנסה.', 'No income was entered.')}
              <Link to={`/month/${key}?s=1`} className="font-semibold text-accent hover:underline">{L('הוסף', 'Add')}</Link></p>
          </>
        )}

        <div className="mt-3"><MonthPicture a={a} /></div>

        <div className="mt-3 space-y-2.5">
          {(['needs', 'wants'] as const).map((b) => {
            const actual = a.spent[b], target = a.target[b], left = target - actual;
            return (
              <div key={b}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-center gap-1.5"><Dot color={BUCKET_COLOR[b]} />{bucketName(b, lang)}
                    {target > 0 && <span className={cx('text-xs', left < 0 ? 'text-bad' : 'text-muted')}>{left >= 0 ? L(`נשארו ${money(left, lang)}`, `${money(left, lang)} left`) : L(`חריגה ${money(-left, lang)}`, `${money(-left, lang)} over`)}</span>}</span>
                  <span><Money value={actual} className="font-semibold" />{target > 0 && <span className="text-xs text-muted"> / <Money value={target} /></span>}</span>
                </div>
                {target > 0 && <Meter value={actual} target={target} color={BUCKET_COLOR[b]} soft={`var(--${b}-soft)`} label={`${bucketName(b, lang)}: ${money(actual, lang)} ${L('מתוך', 'of')} ${money(target, lang)}`} />}
              </div>
            );
          })}
        </div>
      </Card>

      {toReview > 0 && (
        <Link to={`/month/${key}?s=3`} className="press flex items-center gap-3 rounded-2xl border border-warn bg-surface2 px-4 py-2.5 text-sm">
          <TriangleAlert size={17} className="shrink-0 text-warn" />
          <span className="min-w-0 flex-1 truncate"><b>{L('לא סופי', 'Not final')}</b> · {L(`${toReview} עסקאות מחכות לסיווג`, `${toReview} transactions waiting`)}</span>
          <span className="shrink-0 font-semibold text-accent">{L('לסיווג', 'Review')}</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <button key={t.v} type="button" onClick={() => openView(t.v)}
            className={cx('press flex min-h-[104px] flex-col rounded-2xl border border-line bg-surface p-3.5 text-start shadow-[var(--shadow)] hover:border-line-strong', t.empty && 'opacity-70')}>
            <span className="mb-2 flex w-full items-center gap-1.5 text-[13px] font-semibold text-ink2"><span className="text-accent">{t.icon}</span>{t.title}<Fwd size={15} className="ms-auto text-muted" /></span>
            <span className="mt-auto w-full min-w-0 text-sm text-ink2">{t.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
