// Filling in a month, one step per screen: income, the card statement, a review of what the
// classifier was not sure about, and whatever happened outside the card. A month that was
// started opens on a summary of those steps instead, and each line there jumps to its step.
//
// The step lives in the address (?s=2), so the phone's back button walks back through the steps.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, ArrowRight, BarChart3, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CreditCard, FileSpreadsheet, LayoutGrid, Plus, Repeat, Trash2, TriangleAlert, Upload } from 'lucide-react';
import type { ManualItem, Tx } from '../lib/types';
import { bucketName, categoryName, emptyMonth, sumItems, useL, useLang, useStore } from '../lib/store';
import { dayLabel, isMonthKey, merchantKey, monthLabel, shiftMonth, statementMonth, uid } from '../lib/format';
import { parseStatementFile, type ParsedStatement } from '../lib/parser/statement';
import { isTransfer, sourceOf } from '../lib/learn';
import { AmountInput, BUCKET_COLOR, Button, Card, Dot, IconButton, Money, Segmented, TextInput, cx } from '../components/ui';
import { IncomeEditor } from './Goal';

const STEPS = 4;

/** One merchant the user still has to decide about: every waiting transaction of it, taken together. */
interface ReviewItem { id: string; merchant: string; txs: Tx[]; amount: number; suggested: string | null; hint?: string }

function reviewQueue(txs: Tx[]): ReviewItem[] {
  const map = new Map<string, ReviewItem>();
  for (const t of txs) {
    const source = sourceOf(t);
    if (source === 'user' || source === 'learned') continue;
    const id = `${merchantKey(t.merchant)}|${t.categoryId ?? ''}`;
    const it = map.get(id) ?? { id, merchant: t.merchant, txs: [], amount: 0, suggested: t.categoryId, hint: t.hint };
    it.txs.push(t); it.amount += t.amount;
    map.set(id, it);
  }
  // The most money first: if the user stops halfway, the big ones are already right.
  return [...map.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/**
 * The month being filled in, as a chip that opens the list of months. A list (rather than
 * previous/next arrows) shows at a glance which months are done, and cannot be nudged by accident
 * in the middle of a step.
 */
function MonthPicker({ value, latest, onPick }: { value: string; latest: string; onPick: (key: string) => void }) {
  const L = useL();
  const lang = useLang();
  const months = useStore((s) => s.db.months);
  const [open, setOpen] = useState(false);
  // From the month being lived now, back through the last half year; plus the open one if it is older.
  const keys = Array.from({ length: 8 }, (_, i) => shiftMonth(latest, 1 - i));
  if (!keys.includes(value)) keys.push(value);
  const status = (k: string) => {
    const m = months[k];
    if (m && (m.txs.length > 0 || m.manual.length > 0)) return { text: L('מולא', 'Filled'), tone: 'text-good' };
    if (m && (m.incomes.length > 0 || m.goal)) return { text: L('התחלת', 'Started'), tone: 'text-warn' };
    return { text: L('ריק', 'Empty'), tone: 'text-muted' };
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox"
        className="press flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface2 px-3 text-sm font-semibold">
        <CalendarDays size={16} className="text-accent" />{monthLabel(value, lang)}<ChevronDown size={16} className={cx('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <button type="button" aria-label={L('סגור', 'Close')} className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul role="listbox" className="rise absolute start-0 top-full z-50 mt-1.5 w-60 rounded-2xl border border-line bg-surface p-1.5 shadow-2xl">
            {keys.map((k) => {
              const st = status(k);
              return (
                <li key={k}>
                  <button type="button" role="option" aria-selected={k === value} onClick={() => { setOpen(false); if (k !== value) onPick(k); }}
                    className={cx('press flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start text-sm', k === value ? 'bg-surface2 font-semibold' : 'hover:bg-surface2')}>
                    <span>{monthLabel(k, lang)}{k === latest && <span className="ms-1.5 text-xs font-normal text-muted">· {L('האחרון', 'latest')}</span>}</span>
                    <span className={cx('text-xs', st.tone)}>{st.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export default function MonthPage() {
  const { month = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const { setIncomes, importStatements, removeFile, moveFile, setManual, setRepeat, applyRecurring, updateMonth, assign, confirm } = useStore();
  // The month whose statement is the latest one out: the default, and where the home shortcut leads.
  const latest = statementMonth(db.settings.billingDay);
  const key = isMonthKey(month) ? month : latest;
  const m = db.months[key] ?? emptyMonth(key);
  const Fwd = lang === 'he' ? ArrowLeft : ArrowRight;
  const Back = lang === 'he' ? ChevronRight : ChevronLeft;

  // Standing orders reach a month the first time it is opened.
  useEffect(() => { applyRecurring(key); }, [key, applyRecurring]);

  const incomeTotal = sumItems(m.incomes);
  const queue = useMemo(() => reviewQueue(m.txs), [m.txs]);
  const started = incomeTotal > 0 || m.txs.length > 0 || m.manual.length > 0;
  const done = [incomeTotal > 0, m.files.length > 0, m.txs.length > 0 && queue.length === 0, true];
  const canAnalyze = m.txs.length > 0 || m.manual.length > 0;

  const requested = Number(params.get('s'));
  const step = requested >= 1 && requested <= STEPS ? requested : 0; // 0 = the summary
  // A month nobody touched yet starts straight at the first step.
  useEffect(() => { if (!step && !started) navigate(`/month/${key}?s=1`, { replace: true }); }, [step, started, key, navigate]);

  // Which way the screen should slide: forward when the step number grew.
  const prevStep = useRef(step);
  const direction = step >= prevStep.current ? 'step-next' : 'step-back';
  useEffect(() => { prevStep.current = step; window.scrollTo(0, 0); }, [step]);

  const go = (s: number) => navigate(s ? `/month/${key}?s=${s}` : `/month/${key}`);
  const finish = () => { updateMonth(key, (x) => ({ ...x, analyzedAt: new Date().toISOString() })); navigate(`/month/${key}/analysis`); };

  // ----- step 2: files -----
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  async function addFiles(list: FileList | File[]) {
    const files = [...list];
    if (!files.length) return;
    setBusy(true); setNotice(null);
    const parsed: ParsedStatement[] = [];
    const failed: string[] = [];
    for (const f of files) {
      try {
        const p = await parseStatementFile(f);
        if (p.txs.length) parsed.push(p); else failed.push(f.name);
      } catch { failed.push(f.name); }
    }
    const { added, skipped } = parsed.length ? importStatements(key, parsed) : { added: 0, skipped: 0 };
    setBusy(false);
    const parts: string[] = [];
    if (added) parts.push(L(`נוספו ${added} עסקאות`, `${added} transactions added`));
    if (skipped) parts.push(L(`${skipped} כבר היו קיימות ודולגו`, `${skipped} already existed and were skipped`));
    if (failed.length) parts.push(L(`לא זוהו עסקאות בקובץ: ${failed.join(', ')}`, `No transactions found in: ${failed.join(', ')}`));
    setNotice({ tone: failed.length && !added ? 'bad' : 'good', text: parts.join(' · ') });
  }

  // ----- step 3: one merchant at a time -----
  const [skipped, setSkipped] = useState<string[]>([]);
  const reviewTotal = useRef(0);
  useEffect(() => { if (step === 3) reviewTotal.current = Math.max(reviewTotal.current, queue.length); else reviewTotal.current = 0; }, [step, queue.length]);
  // Skipped ones go to the back of the line rather than away.
  const ordered = [...queue.filter((q) => !skipped.includes(q.id)), ...queue.filter((q) => skipped.includes(q.id))];
  const current = ordered[0];
  const total = Math.max(reviewTotal.current, queue.length);
  const cats = db.categories.filter((c) => c.bucket !== 'invest');
  const catById = new Map(db.categories.map((c) => [c.id, c]));

  // ----- step 4 -----
  const prevIncomes = db.months[shiftMonth(key, -1)]?.incomes ?? [];
  const goalIncome = m.goal ? sumItems(m.goal.incomes) : 0;
  const manualPatch = (id: string, p: Partial<ManualItem>) => setManual(key, m.manual.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const titles = [
    [L('הכנסות', 'Income'), L('מה באמת נכנס החודש', 'What actually came in this month')],
    [L('דף החיוב', 'Card statement'), L('קובץ Excel או CSV מאתר חברת האשראי. אפשר כמה קבצים.', 'An Excel or CSV file from your card issuer. Several files are fine.')],
    [L('סיווג', 'Classification'), L('רק מה שהאפליקציה לא בטוחה לגביו', 'Only what the app is not sure about')],
    [L('מחוץ לאשראי', 'Outside the card'), L('שכר דירה, הוראות קבע, מזומן. אפשר לדלג.', 'Rent, standing orders, cash. You can skip this.')],
  ];

  // ================= summary =================
  if (!step) {
    const firstOpen = done.findIndex((d) => !d) + 1;
    const allDone = firstOpen === 0;
    const lines: [string, React.ReactNode][] = [
      [titles[0][0], incomeTotal > 0 ? <Money value={incomeTotal} className="font-semibold" /> : L('לא הוזנו', 'Not entered')],
      [titles[1][0], m.files.length ? <>{L(m.files.length === 1 ? 'קובץ אחד' : `${m.files.length} קבצים`, `${m.files.length} file${m.files.length === 1 ? '' : 's'}`)} · <Money value={m.files.reduce((t, f) => t + f.total, 0)} /></> : L('לא הועלה', 'Not uploaded')],
      [titles[2][0], !m.txs.length ? L('אין עסקאות', 'No transactions') : queue.length ? L(`${queue.length} מחכים להחלטה`, `${queue.length} waiting for you`) : L(`כל ${m.txs.length} העסקאות סווגו`, `All ${m.txs.length} classified`)],
      [titles[3][0], m.manual.length ? L(m.manual.length === 1 ? 'שורה אחת' : `${m.manual.length} שורות`, `${m.manual.length} line${m.manual.length === 1 ? '' : 's'}`) : L('אין', 'None')],
    ];
    return (
      <div className="rise space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{monthLabel(key, lang)}</h1>
            <p className="mt-1 text-sm text-muted">{allDone ? L('החודש מוכן', 'This month is ready') : L('החודש עוד לא הושלם', 'This month is not finished yet')}</p>
          </div>
          <MonthPicker value={key} latest={latest} onPick={(k) => navigate(`/month/${k}`)} />
        </header>

        <Card className="!p-2">
          <ul>
            {lines.map(([label, value], i) => (
              <li key={i}>
                <button type="button" onClick={() => go(i + 1)} className="press flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start hover:bg-surface2">
                  <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', done[i] ? 'bg-good text-page' : 'bg-surface3 text-ink2')}>
                    {done[i]
                      ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path className="draw" style={{ animationDelay: `${0.1 + i * 0.12}s` }} d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      : <span className="text-sm font-bold">{i + 1}</span>}
                  </span>
                  <span className="me-auto text-[15px] font-medium">{label}</span>
                  <span className={cx('text-sm', done[i] ? 'text-ink2' : 'text-warn')}>{value}</span>
                  <Back size={16} className="rotate-180 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <p className="px-1 text-[13px] text-muted">
          {m.goal
            ? <>{L('יעד החודש: הכנסה צפויה', 'Goal: expected income')} <Money value={goalIncome} className="font-semibold text-ink2" /> · </>
            : <>{L('לא הוגדר יעד לחודש הזה.', 'No goal is set for this month.')} </>}
          <Link to={`/goal/${key}`} className="font-medium text-accent hover:underline">{m.goal ? L('עריכת היעד', 'Edit the goal') : L('הגדר יעד', 'Set a goal')}</Link>
        </p>

        <div className="space-y-2 pt-1">
          {!allDone && <Button variant="primary" size="lg" className="w-full" onClick={() => go(firstOpen)}>{L('המשך מאיפה שעצרת', 'Continue where you stopped')}<Fwd size={17} /></Button>}
          <Button variant={allDone ? 'primary' : 'soft'} size="lg" className="w-full" disabled={!canAnalyze} icon={<BarChart3 size={18} />} onClick={finish}>
            {L('לתמונה של החודש', 'See the picture of the month')}
          </Button>
        </div>
      </div>
    );
  }

  // ================= a step =================
  return (
    <div className="pb-24">
      {/* Where you are. A segment is also the way back to its step. */}
      <div className="mb-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <MonthPicker value={key} latest={latest} onPick={(k) => navigate(`/month/${k}`)} />
          <span className="text-[13px] text-muted">{L(`שלב ${step} מתוך ${STEPS}`, `Step ${step} of ${STEPS}`)}</span>
        </div>
        <div className="flex gap-1.5" role="list">
          {titles.map(([t], i) => (
            <button key={i} type="button" role="listitem" aria-label={t} aria-current={i + 1 === step ? 'step' : undefined} onClick={() => go(i + 1)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface3">
              <span className={cx('block h-full rounded-full transition-[width] duration-300', i + 1 === step ? 'bg-accent' : 'bg-good')} style={{ width: i + 1 < step || (i + 1 > step && done[i]) || i + 1 === step ? '100%' : '0%', opacity: i + 1 > step ? 0.45 : 1 }} />
            </button>
          ))}
        </div>
      </div>

      <div key={step} className={direction}>
        <h1 className="text-2xl font-bold tracking-tight">{titles[step - 1][0]}</h1>
        <p className="mb-5 mt-1 text-sm text-muted">{titles[step - 1][1]}</p>

        {step === 1 && (
          <Card>
            {!m.incomes.length && (m.goal || prevIncomes.length > 0) && (
              <div className="mb-4 space-y-2">
                {prevIncomes.length > 0 && (
                  <Button variant="primary" size="lg" className="w-full" onClick={() => setIncomes(key, prevIncomes.map((i) => ({ ...i, id: uid() })))}>
                    {L('כמו בחודש הקודם', 'Same as last month')} · <Money value={sumItems(prevIncomes)} />
                  </Button>
                )}
                {m.goal && (
                  <Button className="w-full" onClick={() => setIncomes(key, m.goal!.incomes.map((i) => ({ ...i, id: uid() })))}>
                    {L('כמו ביעד', 'Same as the goal')} · <Money value={goalIncome} />
                  </Button>
                )}
              </div>
            )}
            <IncomeEditor items={m.incomes} onChange={(v) => setIncomes(key, v)} placeholder={L('מקור ההכנסה', 'Income source')} />
            {incomeTotal > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                <span className="text-sm text-muted">{L('סך הכול', 'Total')}</span><Money value={incomeTotal} className="text-xl font-bold" />
              </div>
            )}
          </Card>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <input ref={fileInput} type="file" multiple accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/comma-separated-values,application/csv" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            <button type="button" onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              className={cx('press flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-6 text-center', m.files.length ? 'py-5' : 'py-12',
                dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:border-accent')}>
              <Upload size={m.files.length ? 22 : 30} className="text-accent" />
              <span className="font-semibold">{busy ? L('קורא קבצים…', 'Reading files…') : m.files.length ? L('הוסף קובץ נוסף', 'Add another file') : L('בחר קובץ', 'Choose a file')}</span>
              {!m.files.length && <span className="text-[13px] text-muted">{L('למשל', 'e.g.')} <bdi dir="ltr">1234_11_2026.xlsx</bdi></span>}
            </button>
            {notice && <p role="status" className={cx('text-sm', notice.tone === 'good' ? 'text-good' : 'text-bad')}>{notice.text}</p>}

            {m.files.map((f) => {
              const verified = f.statedTotal != null && m.txs.filter((t) => t.fileId === f.id && !t.offCycle).reduce((s, t) => s + t.amount, 0).toFixed(2) === f.statedTotal.toFixed(2);
              const mismatch = f.statementMonth && f.statementMonth !== key;
              return (
                <Card key={f.id} className="pop !p-4">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet size={22} className="shrink-0 text-good" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold"><bdi>{f.name}</bdi></p>
                      <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                        <span className="flex items-center gap-1"><CreditCard size={13} />{f.card}</span>
                        <span>{L(`${f.count} עסקאות`, `${f.count} transactions`)}</span>
                      </p>
                    </div>
                    <Money value={f.total} agorot className="font-semibold" />
                    <IconButton label={L('הסר קובץ', 'Remove file')} onClick={() => removeFile(key, f.id)}><Trash2 size={16} /></IconButton>
                  </div>
                  {verified && <p className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-[13px] text-good"><Check size={14} />{L('הסכום תואם לסך הכול שבדף החיוב', 'The total matches the one printed on the statement')}</p>}
                  {mismatch && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-[13px] text-warn">
                      <TriangleAlert size={14} />
                      {L(`הקובץ הוא של חיוב ${monthLabel(f.statementMonth!, lang)}, ואתה ממלא את ${monthLabel(key, lang)}.`, `This file is the ${monthLabel(f.statementMonth!, lang)} statement, and you are filling in ${monthLabel(key, lang)}.`)}
                      <button className="font-semibold text-accent hover:underline" onClick={() => { moveFile(key, f.id, f.statementMonth!); navigate(`/month/${f.statementMonth}?s=2`); }}>
                        {L(`העבר ל${monthLabel(f.statementMonth!, lang)}`, `Move to ${monthLabel(f.statementMonth!, lang)}`)}
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {step === 3 && (
          !m.txs.length ? (
            <Card><p className="text-sm text-muted">{L('אין עדיין עסקאות. חזור לשלב הקודם והעלה דף חיוב.', 'No transactions yet. Go back a step and upload a statement.')}</p></Card>
          ) : !current ? (
            <Card className="text-center">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-good text-page">
                <svg width="26" height="26" viewBox="0 0 14 14" aria-hidden><path className="draw" d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <p className="text-lg font-bold">{L('הכול מסווג', 'Everything is classified')}</p>
              <p className="mt-1 text-sm text-muted">{L(`${m.txs.length} עסקאות, כולן במקום.`, `${m.txs.length} transactions, all in place.`)}</p>
              <Button className="mt-4" size="sm" icon={<LayoutGrid size={15} />} onClick={() => navigate(`/month/${key}/classify`)}>{L('ראה את הכול בלוח', 'See everything on the board')}</Button>
            </Card>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-3 text-[13px] text-muted">
                <span>{L(`${total - queue.length + 1} מתוך ${total}`, `${total - queue.length + 1} of ${total}`)}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface3"><span className="block h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${((total - queue.length) / Math.max(total, 1)) * 100}%` }} /></span>
                <button type="button" className="font-medium text-accent" onClick={() => navigate(`/month/${key}/classify`)}>{L('ללוח המלא', 'Full board')}</button>
              </div>

              <Card key={current.id} className="step-next">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xl font-bold"><bdi className="truncate">{current.merchant}</bdi>{isTransfer(current.merchant) && <ArrowLeftRight size={16} className="shrink-0 text-muted" />}</p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {current.txs.length > 1 ? L(`${current.txs.length} עסקאות`, `${current.txs.length} transactions`) : dayLabel(current.txs[0].date, lang)}
                      {current.txs[0].note ? ` · ${current.txs[0].note}` : ''}
                    </p>
                  </div>
                  <Money value={current.amount} className={cx('shrink-0 text-xl font-bold', current.amount < 0 && 'text-good')} />
                </div>

                {isTransfer(current.merchant) && <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-[13px] text-ink2">{L('העברה: כל פעם היא על משהו אחר, אז האפליקציה לא מנחשת. בחר לפי מה שהיא שילמה, או "לא לספור" אם הכסף רק עבר בין חשבונות.', 'A transfer: it pays for something different each time, so the app does not guess. Choose by what it paid for, or "don\'t count" if the money only moved between accounts.')}</p>}

                {current.suggested && catById.get(current.suggested) && (
                  <div className="mt-4 rounded-2xl border border-dashed border-warn p-3">
                    <p className="text-[13px] text-ink2">{L('ההצעה של האפליקציה', "The app's suggestion")}{current.hint ? <> · {L('לפי', 'from')} <bdi>{current.hint}</bdi></> : null}</p>
                    <p className="mt-1 flex items-center gap-2 text-lg font-bold"><Dot color={BUCKET_COLOR[catById.get(current.suggested)!.bucket]} className="!h-3 !w-3" />{categoryName(catById.get(current.suggested), lang)}</p>
                    <Button variant="primary" size="lg" className="mt-3 w-full" icon={<Check size={18} />} onClick={() => confirm(key, current.txs.map((t) => t.id))}>{L('נכון', 'Correct')}</Button>
                  </div>
                )}

                <p className="mb-2 mt-5 text-[13px] text-muted">{current.suggested ? L('או בחר קטגוריה אחרת', 'Or choose another category') : L('לאיזו קטגוריה זה שייך?', 'Which category does this belong to?')}</p>
                {(['needs', 'wants', 'ignore'] as const).map((b) => {
                  const inB = cats.filter((c) => c.bucket === b);
                  const list = [...inB.filter((c) => !c.builtin), ...inB.filter((c) => c.builtin)];
                  return (
                    <div key={b} className="mb-3">
                      {b !== 'ignore' && <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink2"><Dot color={BUCKET_COLOR[b]} />{bucketName(b, lang)}</p>}
                      <div className="grid grid-cols-2 gap-2">
                        {list.map((c) => (
                          <button key={c.id} type="button" onClick={() => assign(key, current.txs.map((t) => t.id), c.id)}
                            className={cx('press flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-start text-sm font-medium', c.id === current.suggested ? 'border-line bg-surface2 text-muted' : 'border-line bg-surface2 hover:border-accent')}>
                            <Dot color={BUCKET_COLOR[c.bucket]} /><span className="truncate">{categoryName(c, lang)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {queue.length > 1 && <Button variant="ghost" size="sm" className="mt-1" onClick={() => setSkipped((s) => [...s.filter((x) => x !== current.id), current.id])}>{L('אחזור לזה אחר כך', 'I will come back to this')}</Button>}
              </Card>
            </>
          )
        )}

        {step === 4 && (
          <div className="space-y-3">
            {m.manual.map((x) => (
              <Card key={x.id} className="!p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented size="sm" value={x.kind} onChange={(kind) => manualPatch(x.id, { kind, categoryId: kind === 'income' ? null : x.categoryId ?? 'needs' })}
                    options={[{ value: 'expense', label: L('הוצאה', 'Expense') }, { value: 'income', label: L('הכנסה', 'Income') }]} />
                  <button type="button" onClick={() => setRepeat(key, x.id, !x.repeat)} aria-pressed={!!x.repeat}
                    className={cx('press flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[13px] font-medium', x.repeat ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted')}>
                    <Repeat size={14} />{L('כל חודש', 'Monthly')}
                  </button>
                  <IconButton label={L('הסר', 'Remove')} className="ms-auto" onClick={() => setManual(key, m.manual.filter((y) => y.id !== x.id))}><Trash2 size={16} /></IconButton>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <TextInput value={x.label} placeholder={L('תיאור, למשל שכר דירה', 'Description, e.g. rent')} onChange={(e) => manualPatch(x.id, { label: e.target.value })} className="flex-1" />
                  <AmountInput value={x.amount} onChange={(amount) => manualPatch(x.id, { amount })} className="w-28" />
                </div>
                {x.kind === 'expense' && (
                  <select value={x.categoryId ?? ''} onChange={(e) => manualPatch(x.id, { categoryId: e.target.value || null })} aria-label={L('קטגוריה', 'Category')}
                    className="mt-2 h-10 w-full rounded-xl border border-line bg-surface2 px-2 text-sm focus:border-accent focus:outline-none">
                    {db.categories.filter((c) => c.bucket !== 'ignore').map((c) => <option key={c.id} value={c.id}>{categoryName(c, lang)}</option>)}
                  </select>
                )}
              </Card>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <Button icon={<Plus size={15} />} onClick={() => setManual(key, [...m.manual, { id: uid(), kind: 'expense', label: '', amount: 0, categoryId: 'needs' }])}>{L('הוסף הוצאה', 'Add expense')}</Button>
              <Button icon={<Plus size={15} />} onClick={() => setManual(key, [...m.manual, { id: uid(), kind: 'income', label: '', amount: 0, categoryId: null }])}>{L('הוסף הכנסה', 'Add income')}</Button>
            </div>
            <p className="px-1 text-[13px] text-muted">{L('"כל חודש" הופך שורה להוראת קבע שמתווספת לבד לחודשים הבאים. הפקדה לחיסכון מסמנים כ"חיסכון", והיא לא נספרת כהוצאה.', '"Monthly" makes a line a standing order that is added to later months by itself. Mark a savings deposit as "Savings"; it is not counted as spending.')}</p>
          </div>
        )}
      </div>

      {/* Back and Next stay in thumb reach on every step. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:start-60">
        <div className="mx-auto flex max-w-xl gap-3">
          <Button size="lg" className="flex-1" icon={<Back size={18} />} onClick={() => (step === 1 && !started ? navigate('/') : go(step - 1))}>{step === 1 ? (started ? L('סיכום', 'Summary') : L('ביטול', 'Cancel')) : L('הקודם', 'Back')}</Button>
          <Button size="lg" variant={done[step - 1] ? 'primary' : 'soft'} className="flex-[2]" onClick={() => go(step === STEPS ? 0 : step + 1)}>
            {step === STEPS ? L('סיום', 'Finish') : done[step - 1] ? L('הבא', 'Next') : L('דלג בינתיים', 'Skip for now')}<Fwd size={17} />
          </Button>
        </div>
      </div>
    </div>
  );
}
