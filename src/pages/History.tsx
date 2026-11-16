import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, History as HistoryIcon, Target, Trash2, TrendingUp } from 'lucide-react';
import { SPEND_BUCKETS } from '../lib/types';
import { bucketName, useL, useLang, useStore } from '../lib/store';
import { monthLabel, pct } from '../lib/format';
import { analyzeMonth } from '../lib/analysis/compute';
import { BUCKET_COLOR, Button, Dot, Empty, IconButton, Modal, Money, PageHeader, Pill, cx } from '../components/ui';

export default function HistoryPage() {
  const L = useL();
  const lang = useLang();
  const navigate = useNavigate();
  const db = useStore((s) => s.db);
  const deleteMonth = useStore((s) => s.deleteMonth);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<string | null>(null);

  const months = Object.values(db.months)
    .filter((m) => m.txs.length || m.manual.length || m.incomes.length || m.goal)
    .sort((a, b) => b.key.localeCompare(a.key));
  const analyzable = months.filter((m) => m.txs.length || m.manual.length);
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="rise">
      <PageHeader title={L('היסטוריה', 'History')} subtitle={L('כל החודשים שמילאת. סמן כמה חודשים כדי לנתח אותם יחד.', 'Every month you filled in. Select several to analyze them together.')}>
        {analyzable.length > 1 && (
          <Button onClick={() => setPicked(picked.size === analyzable.length ? new Set() : new Set(analyzable.map((m) => m.key)))}>
            {picked.size === analyzable.length ? L('נקה בחירה', 'Clear selection') : L('בחר הכול', 'Select all')}
          </Button>
        )}
        <Button variant="primary" icon={<TrendingUp size={16} />} disabled={picked.size < 1}
          onClick={() => navigate(`/trends?m=${[...picked].sort().join(',')}`)}>
          {picked.size > 1 ? L(`נתח ${picked.size} חודשים יחד`, `Analyze ${picked.size} months together`) : L('ניתוח משולב', 'Combined analysis')}
        </Button>
      </PageHeader>

      {!months.length ? (
        <Empty icon={<HistoryIcon size={30} />} title={L('עדיין אין היסטוריה', 'No history yet')}>
          {L('אחרי שתמלא חודש ראשון הוא יופיע כאן.', 'Once you fill in your first month it will appear here.')}
        </Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {months.map((m) => {
            const has = m.txs.length > 0 || m.manual.length > 0;
            const a = analyzeMonth(m, db);
            const on = picked.has(m.key);
            return (
              <li key={m.key} className={cx('rounded-2xl border bg-surface p-4 shadow-[var(--shadow)] transition-colors', on ? 'border-accent' : 'border-line')}>
                <div className="flex items-start gap-3">
                  {has && (
                    <button role="checkbox" aria-checked={on} aria-label={L('בחר לניתוח משולב', 'Select for combined analysis')} onClick={() => toggle(m.key)}
                      className={cx('mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', on ? 'border-accent bg-accent text-page' : 'border-line-strong')}>
                      {on && <Check size={13} strokeWidth={3.5} />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={has ? `/month/${m.key}/analysis` : m.goal ? `/goal/${m.key}` : `/month/${m.key}`} className="text-lg font-bold hover:underline">{monthLabel(m.key, lang)}</Link>
                      {m.goal && <Pill tone="accent"><Target size={11} />{L('יעד', 'Goal')}</Pill>}
                      {a.unclassified.count > 0 && <Pill tone="warn">{L(`${a.unclassified.count} לא מסווגות`, `${a.unclassified.count} unclassified`)}</Pill>}
                      {m.ai?.summary && <Pill>{L('סיכום AI', 'AI summary')}</Pill>}
                    </div>
                    {has ? (
                      <>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                          <div><p className="text-xs text-muted">{L('הכנסה', 'Income')}</p><Money value={a.income} className="font-semibold" /></div>
                          <div><p className="text-xs text-muted">{L('הוצאות', 'Spent')}</p><Money value={a.totalSpent} className="font-semibold" /></div>
                          <div><p className="text-xs text-muted">{L('חיסכון', 'Savings')}</p><span className="font-semibold">{a.savingsRate == null ? '—' : pct(a.savingsRate)}</span></div>
                        </div>
                        <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface2">
                          {SPEND_BUCKETS.map((b) => a.spent[b] > 0 && <span key={b} title={bucketName(b, lang)} style={{ flex: a.spent[b], background: BUCKET_COLOR[b] }} />)}
                          {a.unclassified.total > 0 && <span style={{ flex: a.unclassified.total, background: 'var(--neutral-mark)' }} />}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                          {SPEND_BUCKETS.map((b) => <span key={b} className="flex items-center gap-1"><Dot color={BUCKET_COLOR[b]} className="!h-2 !w-2" />{bucketName(b, lang)} <Money value={a.spent[b]} /></span>)}
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-muted">{m.goal ? L('הוגדר יעד, החודש טרם מולא.', 'A goal is set; the month is not filled in yet.') : L('הוזנו הכנסות בלבד.', 'Only income was entered.')}
                        {' '}<Link to={`/month/${m.key}`} className="font-medium text-accent hover:underline">{L('למילוי', 'Fill in')}</Link></p>
                    )}
                  </div>
                  <IconButton label={L('מחק חודש', 'Delete month')} onClick={() => setToDelete(m.key)}><Trash2 size={16} /></IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {toDelete && (
        <Modal title={L(`למחוק את ${monthLabel(toDelete, lang)}?`, `Delete ${monthLabel(toDelete, lang)}?`)} onClose={() => setToDelete(null)}>
          <p className="text-sm text-ink2">{L('היעד, ההכנסות, העסקאות והשיחות עם העוזר של החודש הזה יימחקו. אי אפשר לבטל את הפעולה.', 'The goal, income, transactions and assistant conversations for this month will be deleted. This cannot be undone.')}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => setToDelete(null)}>{L('ביטול', 'Cancel')}</Button>
            <Button variant="primary" className="!bg-bad !text-white" onClick={() => { deleteMonth(toDelete); setPicked((s) => { const n = new Set(s); n.delete(toDelete); return n; }); setToDelete(null); }}>{L('מחק חודש', 'Delete month')}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
