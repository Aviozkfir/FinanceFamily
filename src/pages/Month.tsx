import { useRef, useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BarChart3, Check, CreditCard, FileSpreadsheet, LayoutGrid, Plus, Target, Trash2, TriangleAlert, Upload, Repeat, Pencil } from 'lucide-react';
import type { ManualItem } from '../lib/types';
import { SPEND_BUCKETS } from '../lib/types';
import { bucketName, categoryName, emptyMonth, sumItems, useL, useLang, useStore } from '../lib/store';
import { isMonthKey, monthLabel, shiftMonth, statementMonth, uid } from '../lib/format';
import { parseStatementFile, type ParsedStatement } from '../lib/parser/statement';
import { sourceOf } from '../lib/learn';
import { AmountInput, BUCKET_COLOR, Button, Card, CardTitle, Dot, IconButton, Money, MonthSwitcher, PageHeader, Pill, Segmented, TextInput, cx } from '../components/ui';
import { IncomeEditor } from './Goal';

function Step({ n, done, title, hint, children, action }: { n: number; done: boolean; title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold', done ? 'bg-good text-page' : 'bg-surface3 text-ink2')}>
            {done ? <Check size={15} strokeWidth={3} /> : n}
          </span>
          <div>
            <h3 className="font-semibold">{title}</h3>
            {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default function MonthPage() {
  const { month = '' } = useParams();
  const navigate = useNavigate();
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const { setIncomes, importStatements, removeFile, moveFile, setManual, setRepeat, applyRecurring, updateMonth } = useStore();
  const key = isMonthKey(month) ? month : statementMonth(db.settings.billingDay);
  const m = db.months[key] ?? emptyMonth(key);
  const Arrow = lang === 'he' ? ArrowLeft : ArrowRight;

  // Standing orders reach a month the first time it is opened.
  useEffect(() => { applyRecurring(key); }, [key, applyRecurring]);

  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [key]);
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

  const classified = m.txs.filter((t) => t.categoryId).length;
  const guesses = m.txs.filter((t) => sourceOf(t) === 'guess').length;
  const incomeTotal = sumItems(m.incomes);
  const prevIncomes = db.months[shiftMonth(key, -1)]?.incomes ?? [];
  const goalIncome = m.goal ? sumItems(m.goal.incomes) : 0;
  const manualPatch = (id: string, p: Partial<ManualItem>) => setManual(key, m.manual.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const canAnalyze = m.txs.length > 0 || m.manual.length > 0;
  const complete = incomeTotal > 0 && m.txs.length > 0 && m.txs.every((t) => t.categoryId && sourceOf(t) !== 'guess');
  const showSteps = editing || !complete;

  return (
    <div className="rise space-y-4">
      <PageHeader title={monthLabel(key, lang)} subtitle={L(`דף החיוב של ${db.settings.billingDay} ב${monthLabel(key, lang).split(' ')[0]}, וההכנסות וההוצאות של אותו חודש`, `The statement charged on day ${db.settings.billingDay} of ${monthLabel(key, lang).split(' ')[0]}, with that month's income and expenses`)}>
        <MonthSwitcher value={key} onChange={(k) => navigate(`/month/${k}`)} />
      </PageHeader>

      {m.goal ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-accent-soft/50 px-5 py-3.5">
          <span className="flex items-center gap-2 font-semibold"><Target size={17} className="text-accent" />{L('היעד לחודש הזה', 'Goal for this month')}</span>
          <span className="text-sm text-ink2">{L('הכנסה צפויה', 'Expected income')} <Money value={goalIncome} className="font-semibold text-ink" /></span>
          {SPEND_BUCKETS.map((b) => (
            <span key={b} className="flex items-center gap-1.5 text-sm text-ink2"><Dot color={BUCKET_COLOR[b]} />{bucketName(b, lang)} <Money value={(goalIncome * m.goal!.split[b]) / 100} className="font-semibold text-ink" /></span>
          ))}
          <Link to={`/goal/${key}`} className="ms-auto text-sm font-medium text-accent hover:underline">{L('עריכה', 'Edit')}</Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line-strong px-5 py-3 text-sm text-muted">
          <span>{L('לא הוגדר יעד לחודש הזה — הניתוח יתבסס על ההכנסה בפועל, בחלוקת 50/30/20.', 'No goal was set for this month — the analysis will use actual income with a 50/30/20 split.')}</span>
          <Link to={`/goal/${key}`} className="font-medium text-accent hover:underline">{L('הגדר יעד', 'Set a goal')}</Link>
        </div>
      )}

      {/* A finished month reads as a summary; the editors open on request. */}
      {!showSteps && (
        <Card>
          <ul className="divide-y divide-line">
            {[
              [L('הכנסות', 'Income'), <Money key="i" value={incomeTotal} className="font-semibold" />],
              [L('דפי חיוב', 'Statements'), <span key="f" className="font-semibold">{L(m.files.length === 1 ? 'קובץ אחד' : `${m.files.length} קבצים`, `${m.files.length} file${m.files.length === 1 ? '' : 's'}`)} · <Money value={m.files.reduce((t, f) => t + f.total, 0)} /></span>],
              [L('סיווג', 'Classification'), <span key="c" className="font-semibold">{L(`כל ${m.txs.length} העסקאות סווגו`, `All ${m.txs.length} transactions classified`)}</span>],
              [L('הכנסות והוצאות נוספות', 'Other income & expenses'), <span key="m" className="font-semibold">{m.manual.length ? L(m.manual.length === 1 ? 'שורה אחת' : `${m.manual.length} שורות`, `${m.manual.length} line${m.manual.length === 1 ? '' : 's'}`) : L('אין', 'None')}</span>],
            ].map(([label, value], n) => (
              <li key={n} className="flex items-center gap-3 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-good text-page"><Check size={14} strokeWidth={3} /></span>
                <span className="me-auto text-sm text-ink2">{label}</span>
                <span className="text-sm">{value}</span>
              </li>
            ))}
          </ul>
          <Button className="mt-3" icon={<Pencil size={15} />} onClick={() => setEditing(true)}>{L('עריכת החודש', 'Edit this month')}</Button>
        </Card>
      )}

      {showSteps && <>
      <Step n={1} done={incomeTotal > 0} title={L('הכנסות בפועל', 'Actual income')} hint={L('מה באמת נכנס החודש', 'What actually came in this month')}
        action={incomeTotal > 0 ? <Money value={incomeTotal} className="text-lg font-bold" /> : undefined}>
        {!m.incomes.length && (m.goal || prevIncomes.length > 0) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {prevIncomes.length > 0 && (
              <Button size="sm" variant="primary" onClick={() => setIncomes(key, prevIncomes.map((i) => ({ ...i, id: uid() })))}>
                {L('כמו בחודש הקודם', 'Same as last month')} · <Money value={sumItems(prevIncomes)} />
              </Button>
            )}
            {m.goal && (
              <Button size="sm" onClick={() => setIncomes(key, m.goal!.incomes.map((i) => ({ ...i, id: uid() })))}>
                {L('העתק מהיעד', 'Copy from goal')} · <Money value={goalIncome} />
              </Button>
            )}
          </div>
        )}
        <IncomeEditor items={m.incomes} onChange={(v) => setIncomes(key, v)} placeholder={L('מקור ההכנסה', 'Income source')} />
      </Step>

      <Step n={2} done={m.files.length > 0} title={L('פירוט אשראי', 'Card statements')}
        hint={L('קובצי Excel או CSV מאתר חברת האשראי. אפשר כמה קבצים יחד, ואפשר להוסיף עוד בכל שלב.', 'Excel or CSV files from your card issuer. Add several at once, and more at any time.')}>
        <input ref={fileInput} type="file" multiple accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/comma-separated-values,application/csv" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        <button type="button" onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          className={cx('flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
            dragging ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-accent hover:bg-surface2')}>
          <Upload size={26} className="text-accent" />
          <span className="font-semibold">{busy ? L('קורא קבצים…', 'Reading files…') : L('גרור לכאן קבצים, או לחץ לבחירה', 'Drop files here, or click to choose')}</span>
          <span className="text-[13px] text-muted">{L('למשל', 'e.g.')} <bdi dir="ltr">1234_11_2026.xlsx</bdi> — {L('כרטיס 1234, חיוב נובמבר 2026', 'card 1234, November 2026 statement')}</span>
        </button>
        {notice && <p role="status" className={cx('mt-3 text-sm', notice.tone === 'good' ? 'text-good' : 'text-bad')}>{notice.text}</p>}

        {m.files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {m.files.map((f) => {
              const verified = f.statedTotal != null && m.txs.filter((t) => t.fileId === f.id && !t.offCycle).reduce((s, t) => s + t.amount, 0).toFixed(2) === f.statedTotal.toFixed(2);
              const mismatch = f.statementMonth && f.statementMonth !== key;
              return (
                <li key={f.id} className="rounded-2xl bg-surface2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet size={20} className="shrink-0 text-good" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold"><bdi>{f.name}</bdi></p>
                      <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                        <span className="flex items-center gap-1"><CreditCard size={13} />{f.card}</span>
                        <span>{L(`${f.count} עסקאות`, `${f.count} transactions`)}</span>
                        {verified && <span className="flex items-center gap-1 text-good"><Check size={13} />{L('תואם לסכום בדף החיוב', 'Matches the statement total')}</span>}
                      </p>
                    </div>
                    <Money value={f.total} agorot className="font-semibold" />
                    <IconButton label={L('הסר קובץ', 'Remove file')} onClick={() => removeFile(key, f.id)}><Trash2 size={16} /></IconButton>
                  </div>
                  {mismatch && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-[13px] text-warn">
                      <TriangleAlert size={14} />
                      {L(`הקובץ הוא של חיוב ${monthLabel(f.statementMonth!, lang)}, ואתה ממלא את ${monthLabel(key, lang)}.`, `This file is the ${monthLabel(f.statementMonth!, lang)} statement, and you are filling in ${monthLabel(key, lang)}.`)}
                      <button className="font-semibold text-accent hover:underline" onClick={() => { moveFile(key, f.id, f.statementMonth!); navigate(`/month/${f.statementMonth}`); }}>
                        {L(`העבר ל${monthLabel(f.statementMonth!, lang)}`, `Move to ${monthLabel(f.statementMonth!, lang)}`)}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Step>

      <Step n={3} done={m.txs.length > 0 && classified === m.txs.length && guesses === 0} title={L('סיווג עסקאות', 'Classify transactions')}
        hint={L('האפליקציה מסווגת לבד לפי מה שלמדה ממך. נשאר לך רק לאשר ניחושים ולסווג את החדשים', 'The app classifies by what it learned from you. You only confirm guesses and place new merchants')}>
        {m.txs.length ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-48 flex-1">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-ink2">{L(`${classified} מתוך ${m.txs.length} סווגו`, `${classified} of ${m.txs.length} classified`)}</span>
                <span className="flex gap-1.5">
                  {guesses > 0 && <Pill tone="warn">{L(`${guesses} ניחושים לאישור`, `${guesses} guesses to confirm`)}</Pill>}
                  {classified < m.txs.length && <Pill tone="warn">{L(`נותרו ${m.txs.length - classified}`, `${m.txs.length - classified} left`)}</Pill>}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface3"><div className="grow h-full rounded-full bg-accent transition-all" style={{ width: `${(classified / m.txs.length) * 100}%` }} /></div>
            </div>
            <Button variant={classified < m.txs.length || guesses > 0 ? 'primary' : 'soft'} icon={<LayoutGrid size={16} />} onClick={() => navigate(`/month/${key}/classify`)}>
              {classified < m.txs.length || guesses > 0 ? L('פתח את לוח הסיווג', 'Open the board') : L('עריכת הסיווג', 'Edit classification')}
            </Button>
          </div>
        ) : <p className="text-sm text-muted">{L('העלה קובץ אשראי כדי להתחיל לסווג.', 'Upload a statement to start classifying.')}</p>}
      </Step>

      <Step n={4} done={m.manual.length > 0} title={L('הכנסות והוצאות נוספות', 'Other income & expenses')}
        hint={L('מה שלא עובר באשראי: שכר דירה, העברות, מזומן. סמן "כל חודש" כדי להפוך שורה להוראת קבע שתתווסף לבד לחודשים הבאים. הפקדה לחיסכון מסמנים כ"חיסכון" — היא לא נספרת כהוצאה', 'Anything outside the card: rent, transfers, cash. Mark a line "Monthly" to make it a standing order that is added to later months by itself. Mark a savings deposit as "Savings" — it is not counted as spending')}>
        <div className="space-y-2">
          {m.manual.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface2 p-2 sm:flex-nowrap sm:bg-transparent sm:p-0">
              <Segmented size="sm" value={x.kind} onChange={(kind) => manualPatch(x.id, { kind, categoryId: kind === 'income' ? null : x.categoryId ?? 'needs' })}
                options={[{ value: 'expense', label: L('הוצאה', 'Expense') }, { value: 'income', label: L('הכנסה', 'Income') }]} />
              <TextInput value={x.label} placeholder={L('תיאור', 'Description')} onChange={(e) => manualPatch(x.id, { label: e.target.value })} className="min-w-32 flex-1" />
              {x.kind === 'expense' && (
                <select value={x.categoryId ?? ''} onChange={(e) => manualPatch(x.id, { categoryId: e.target.value || null })} aria-label={L('קטגוריה', 'Category')}
                  className="h-10 rounded-xl border border-line bg-surface2 px-2 text-sm focus:border-accent focus:outline-none">
                  {db.categories.filter((c) => c.bucket !== 'ignore').map((c) => <option key={c.id} value={c.id}>{categoryName(c, lang)}</option>)}
                </select>
              )}
              <AmountInput value={x.amount} onChange={(amount) => manualPatch(x.id, { amount })} className="w-32" />
              <button type="button" onClick={() => setRepeat(key, x.id, !x.repeat)} aria-pressed={!!x.repeat} title={L('הוראת קבע: חוזר כל חודש', 'Standing order: repeats every month')}
                className={cx('flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-[13px] font-medium', x.repeat ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink')}>
                <Repeat size={14} />{L('כל חודש', 'Monthly')}
              </button>
              <IconButton label={L('הסר', 'Remove')} onClick={() => setManual(key, m.manual.filter((y) => y.id !== x.id))}><Trash2 size={16} /></IconButton>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setManual(key, [...m.manual, { id: uid(), kind: 'expense', label: '', amount: 0, categoryId: 'needs' }])}>{L('הוסף הוצאה', 'Add expense')}</Button>
            <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setManual(key, [...m.manual, { id: uid(), kind: 'income', label: '', amount: 0, categoryId: null }])}>{L('הוסף הכנסה', 'Add income')}</Button>
          </div>
        </div>
      </Step>

      </>}

      <div className="flex justify-center pt-2">
        <Button variant="primary" size="lg" disabled={!canAnalyze} className="w-full sm:w-auto" icon={<BarChart3 size={18} />}
          onClick={() => { updateMonth(key, (x) => ({ ...x, analyzedAt: new Date().toISOString() })); navigate(`/month/${key}/analysis`); }}>
          {complete && !editing ? L('לתמונה של החודש', 'See the picture of the month') : L('נתח את החודש', 'Analyze this month')}<Arrow size={17} />
        </Button>
      </div>
    </div>
  );
}
