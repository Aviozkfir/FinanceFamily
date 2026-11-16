import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { IncomeItem, Split } from '../lib/types';
import { SPEND_BUCKETS } from '../lib/types';
import { bucketName, sumItems, useL, useLang, useStore } from '../lib/store';
import { isMonthKey, monthLabel, shiftMonth, statementMonth, uid } from '../lib/format';
import { AmountInput, BUCKET_COLOR, Button, Card, CardTitle, Dot, IconButton, Money, MonthSwitcher, PageHeader, TextInput, cx } from '../components/ui';

export function IncomeEditor({ items, onChange, placeholder }: { items: IncomeItem[]; onChange: (items: IncomeItem[]) => void; placeholder: string }) {
  const L = useL();
  const patch = (id: string, p: Partial<IncomeItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-2">
          <TextInput value={it.label} placeholder={placeholder} onChange={(e) => patch(it.id, { label: e.target.value })} className="flex-1" />
          <AmountInput value={it.amount} onChange={(amount) => patch(it.id, { amount })} className="w-36" aria-label={L('סכום', 'Amount')} />
          <IconButton label={L('הסר', 'Remove')} onClick={() => onChange(items.filter((i) => i.id !== it.id))}><Trash2 size={16} /></IconButton>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => onChange([...items, { id: uid(), label: '', amount: 0 }])}>
        {L('הוסף הכנסה', 'Add income')}
      </Button>
    </div>
  );
}

const BUCKET_HINT = {
  needs: ['שכר דירה, חשבונות, סופר, דלק, ביטוחים', 'Rent, bills, groceries, fuel, insurance'],
  wants: ['מסעדות, בילויים, קניות, מנויים', 'Restaurants, leisure, shopping, subscriptions'],
  invest: ['חיסכון, השקעות, קרן חירום', 'Savings, investments, emergency fund'],
} as const;

export default function GoalPage() {
  const { month = '' } = useParams();
  const navigate = useNavigate();
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const { setGoal, clearGoal } = useStore();
  const key = isMonthKey(month) ? month : shiftMonth(statementMonth(db.settings.billingDay), 1);
  const saved = db.months[key]?.goal;

  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [split, setSplit] = useState<Split>(db.settings.split);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    // Start from the saved goal, or from the previous month's goal as a template.
    const template = saved ?? db.months[shiftMonth(key, -1)]?.goal;
    setIncomes(saved ? saved.incomes : template ? template.incomes.map((i) => ({ ...i, id: uid() })) : [{ id: uid(), label: L('משכורת', 'Salary'), amount: 0 }]);
    setSplit(saved?.split ?? db.settings.split);
    setJustSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const total = sumItems(incomes);
  const splitSum = split.needs + split.wants + split.invest;
  const valid = total > 0 && splitSum === 100;
  const dirty = JSON.stringify({ incomes, split }) !== JSON.stringify({ incomes: saved?.incomes, split: saved?.split });

  const save = () => { setGoal(key, incomes.filter((i) => i.amount > 0), split); setJustSaved(true); };

  return (
    <div className="rise">
      <PageHeader title={L('יעד חודשי', 'Monthly goal')} subtitle={L('כמה צפוי להיכנס — וכמה מותר להוציא על כל דבר', 'What you expect to earn — and how much each bucket may take')}>
        <Button onClick={() => navigate(`/month/${key}`)}>{L('לחודש עצמו', 'To the month itself')}</Button>
        <MonthSwitcher value={key} onChange={(k) => navigate(`/goal/${k}`)} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardTitle hint={L('משכורת, הכנסה נוספת, קצבאות — כל מה שצפוי להיכנס', 'Salary, side income, benefits — everything you expect')}>
              {L('הכנסות צפויות', 'Expected income')}
            </CardTitle>
            <IncomeEditor items={incomes} onChange={(v) => { setIncomes(v); setJustSaved(false); }} placeholder={L('מקור ההכנסה', 'Income source')} />
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <span className="text-sm text-muted">{L('סך הכול', 'Total')}</span>
              <Money value={total} className="text-xl font-bold" />
            </div>
          </Card>

          <Card>
            <CardTitle hint={L('ברירת המחדל היא 50/30/20. אפשר להתאים לחודש הזה.', 'The default is 50/30/20. You can adjust it for this month.')}>
              {L('חלוקה', 'Split')}
            </CardTitle>
            <div className="grid grid-cols-3 gap-3">
              {SPEND_BUCKETS.map((b) => (
                <label key={b} className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[13px] text-ink2"><Dot color={BUCKET_COLOR[b]} />{bucketName(b, lang)}</span>
                  <div className="relative" dir="ltr">
                    <input type="number" min={0} max={100} dir="ltr" value={split[b]}
                      onChange={(e) => { setSplit({ ...split, [b]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) }); setJustSaved(false); }}
                      className="num h-10 w-full rounded-xl border border-line bg-surface2 pl-3 pr-8 text-sm font-semibold focus:border-accent focus:outline-none" />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">%</span>
                  </div>
                </label>
              ))}
            </div>
            {splitSum !== 100 && <p role="alert" className="mt-3 text-sm text-bad">{L(`החלוקה מסתכמת ב-${splitSum}% — צריך להגיע ל-100%.`, `The split adds up to ${splitSum}% — it must total 100%.`)}</p>}
          </Card>
        </div>

        <Card className="flex flex-col">
          <CardTitle hint={monthLabel(key, lang)}>{L('התוכנית שלך', 'Your plan')}</CardTitle>
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-2">
            <div className="w-full">
              <p className="mb-3 flex items-baseline gap-2"><span className="text-sm text-ink2">{L('הכנסה צפויה', 'Expected income')}</span><Money value={total} className="text-3xl font-bold tracking-tight" /></p>
              <div className="flex h-7 gap-0.5 overflow-hidden rounded-md">
                {SPEND_BUCKETS.map((b) => split[b] > 0 && <div key={b} className="grow" title={`${bucketName(b, lang)} ${split[b]}%`} style={{ width: `${split[b]}%`, background: BUCKET_COLOR[b] }} />)}
              </div>
            </div>
            <div className="w-full space-y-2">
              {SPEND_BUCKETS.map((b) => (
                <div key={b} className="flex items-center justify-between gap-3 rounded-2xl bg-surface2 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Dot color={BUCKET_COLOR[b]} className="!h-3 !w-3" />
                    <div className="min-w-0">
                      <p className="font-semibold">{bucketName(b, lang)} <span className="text-sm font-normal text-muted">{split[b]}%</span></p>
                      <p className="truncate text-xs text-muted">{BUCKET_HINT[b][lang === 'he' ? 0 : 1]}</p>
                    </div>
                  </div>
                  <Money value={(total * split[b]) / 100} className="text-lg font-bold" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            {saved
              ? <Button variant="danger" size="sm" onClick={() => { clearGoal(key); setJustSaved(false); }}>{L('מחק יעד', 'Delete goal')}</Button>
              : <span />}
            <div className="flex items-center gap-3">
              {justSaved && !dirty && (
                <Link to={`/month/${key}`} className="text-sm font-medium text-accent hover:underline">{L('למילוי החודש', 'Fill in this month')}</Link>
              )}
              <Button variant="primary" onClick={save} disabled={!valid || (!dirty && !!saved)} icon={!dirty && saved ? <Check size={16} /> : undefined}
                className={cx(!dirty && saved && '!opacity-100')}>
                {!dirty && saved ? L('היעד נשמר', 'Goal saved') : saved ? L('עדכן יעד', 'Update goal') : L('שמור יעד', 'Save goal')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
