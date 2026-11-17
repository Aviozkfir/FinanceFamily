// The default way to classify: one transaction at a time, swiped left for needs or right for wants.
// Directions are physical, the same in Hebrew and English, and the labels sit on the matching side.
// Buttons do the same for anyone who would rather tap, and "don't count" and undo sit below.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, ArrowRight, Ban, CreditCard, Globe, Repeat, Undo2 } from 'lucide-react';
import type { Tx } from '../lib/types';
import { bucketName, offeredCategories, shownCategoryName, useCardLabel, useL, useLang, useStore } from '../lib/store';
import { dayLabel } from '../lib/format';
import { isTransfer } from '../lib/learn';
import { BUCKET_COLOR, Button, Card, Dot, Money, cx } from './ui';

type Choice = 'needs' | 'wants' | 'ignore' | string;

export default function SwipeDeck({ monthKey, txs }: { monthKey: string; txs: Tx[] }) {
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const assign = useStore((s) => s.assign);
  const cardLabel = useCardLabel();

  // In statement order, so the deck reads like the statement.
  const queue = txs.filter((t) => !t.categoryId).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const total = useRef(0);
  total.current = Math.max(total.current, queue.length);
  const [history, setHistory] = useState<string[]>([]);
  const [dx, setDx] = useState(0);
  const [flying, setFlying] = useState<'left' | 'right' | 'down' | null>(null);
  const [showSubs, setShowSubs] = useState(false);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const width = useRef(320);
  const cardRef = useRef<HTMLDivElement>(null);

  const current = queue[0];
  const next = queue[1];
  useEffect(() => { setDx(0); setFlying(null); setShowSubs(false); }, [current?.id]);

  function commit(choice: Choice) {
    if (!current || flying) return;
    const dir = choice === 'needs' ? 'left' : choice === 'wants' ? 'right' : 'down';
    setFlying(dir);
    setHistory((h) => [...h, current.id]);
    // Let the card leave before the next one takes its place.
    const id = current.id;
    setTimeout(() => assign(monthKey, [id], choice), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220);
  }
  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    assign(monthKey, [last], null);
  }

  // ----- dragging -----
  const onDown = (e: React.PointerEvent) => {
    if (flying) return;
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    width.current = cardRef.current?.offsetWidth ?? 320;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => { if (start.current) setDx(e.clientX - start.current.x); };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const moved = e.clientX - start.current.x;
    const speed = Math.abs(moved) / Math.max(performance.now() - start.current.t, 1);
    start.current = null;
    // Far enough, or a quick flick.
    if (Math.abs(moved) > width.current * 0.3 || (speed > 0.6 && Math.abs(moved) > 40)) commit(moved < 0 ? 'needs' : 'wants');
    else setDx(0);
  };

  const pull = Math.max(-1, Math.min(1, dx / (width.current * 0.3)));
  const done = total.current - queue.length;
  const subs = db.settings.subcategories ? offeredCategories(db).filter((c) => !c.builtin) : [];
  const catById = new Map(db.categories.map((c) => [c.id, c]));

  if (!current) {
    return (
      <Card className="text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-good text-page">
          <svg width="26" height="26" viewBox="0 0 14 14" aria-hidden><path className="draw" d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <p className="text-lg font-bold">{L('הכול מסווג', 'Everything is classified')}</p>
        <p className="mt-1 text-sm text-muted">{L(`${txs.length} עסקאות, כולן במקום.`, `${txs.length} transactions, all in place.`)}</p>
        {history.length > 0 && <Button size="sm" variant="ghost" className="mt-3" icon={<Undo2 size={15} />} onClick={undo}>{L('בטל את האחרונה', 'Undo the last one')}</Button>}
      </Card>
    );
  }

  const fly = flying === 'left' ? 'translate(-140%, 0) rotate(-18deg)' : flying === 'right' ? 'translate(140%, 0) rotate(18deg)' : flying === 'down' ? 'translate(0, 60%) scale(0.9)' : `translate(${dx}px, 0) rotate(${pull * 10}deg)`;
  const moving = start.current != null;

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 text-[13px] text-muted">
        <span>{L(`${done + 1} מתוך ${total.current}`, `${done + 1} of ${total.current}`)}</span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface3"><span className="block h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(done / Math.max(total.current, 1)) * 100}%` }} /></span>
      </div>

      {/* The two destinations, physically left and right whatever the language. */}
      <div dir="ltr" className="mb-2 flex justify-between text-sm font-semibold">
        <span className="flex items-center gap-1.5 transition-opacity" style={{ opacity: 0.45 + Math.max(-pull, 0) * 0.55, color: BUCKET_COLOR.needs }}><ArrowLeft size={16} />{bucketName('needs', lang)}</span>
        <span className="flex items-center gap-1.5 transition-opacity" style={{ opacity: 0.45 + Math.max(pull, 0) * 0.55, color: BUCKET_COLOR.wants }}>{bucketName('wants', lang)}<ArrowRight size={16} /></span>
      </div>

      <div className="relative h-60 touch-pan-y select-none">
        {next && (
          <div className="absolute inset-0 rounded-3xl border border-line bg-surface shadow-[var(--shadow)] transition-transform duration-200" style={{ transform: `scale(${0.94 + Math.min(Math.abs(pull), 1) * 0.06}) translateY(10px)` }} aria-hidden />
        )}
        <div ref={cardRef} key={current.id} role="group" aria-label={current.merchant}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { start.current = null; setDx(0); }}
          className={cx('pop absolute inset-0 flex cursor-grab flex-col rounded-3xl border bg-surface p-5 shadow-xl active:cursor-grabbing', !moving && 'transition-transform duration-200 ease-out')}
          style={{ transform: fly, borderColor: pull < -0.15 ? BUCKET_COLOR.needs : pull > 0.15 ? BUCKET_COLOR.wants : 'var(--line)', opacity: flying ? 0 : 1, transition: moving ? 'none' : 'transform .22s ease-out, opacity .22s ease-out, border-color .15s' }}>
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-2xl font-bold leading-tight"><bdi>{current.merchant}</bdi></p>
            <Money value={current.amount} agorot className={cx('shrink-0 text-2xl font-bold', current.amount < 0 && 'text-good')} />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink2">
            <span className="flex items-center gap-1.5"><CreditCard size={15} className="text-muted" /><bdi>{cardLabel(current.card)}</bdi></span>
            <span className="text-muted">{dayLabel(current.date, lang)}</span>
          </p>
          <div className="mt-auto flex flex-wrap gap-1.5 text-xs text-ink2">
            {current.installment && <span className="rounded-full bg-surface2 px-2.5 py-1">{L(`תשלום ${current.installment.n} מתוך ${current.installment.of}`, `Payment ${current.installment.n} of ${current.installment.of}`)}</span>}
            {current.standing && <span className="flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-1"><Repeat size={12} />{L('הוראת קבע', 'Standing order')}</span>}
            {current.abroad && <span className="flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-1"><Globe size={12} />{L('חו"ל', 'Abroad')}</span>}
            {isTransfer(current.merchant) && <span className="flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-1"><ArrowLeftRight size={12} />{L('העברה — שאל את עצמך על מה שילמת', 'A transfer — think of what it paid for')}</span>}
            {current.note && !current.installment && <span className="rounded-full bg-surface2 px-2.5 py-1"><bdi>{current.note}</bdi></span>}
          </div>
        </div>
      </div>

      <div dir="ltr" className="mt-5 grid grid-cols-2 gap-3">
        <Button size="lg" className="!h-14" style={{ borderColor: BUCKET_COLOR.needs }} onClick={() => commit('needs')}><ArrowLeft size={18} />{bucketName('needs', lang)}</Button>
        <Button size="lg" className="!h-14" style={{ borderColor: BUCKET_COLOR.wants }} onClick={() => commit('wants')}>{bucketName('wants', lang)}<ArrowRight size={18} /></Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" variant="ghost" icon={<Ban size={15} />} onClick={() => commit('ignore')}>{bucketName('ignore', lang)}</Button>
        {subs.length > 0 && <Button size="sm" variant="ghost" aria-expanded={showSubs} onClick={() => setShowSubs(!showSubs)}>{L('תת-קטגוריה', 'Sub-category')}</Button>}
        {history.length > 0 && <Button size="sm" variant="ghost" icon={<Undo2 size={15} />} onClick={undo}>{L('בטל', 'Undo')}</Button>}
      </div>
      {showSubs && (
        <div className="rise mt-2 grid grid-cols-2 gap-2">
          {subs.map((c) => (
            <button key={c.id} type="button" onClick={() => commit(c.id)} className="press flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-start text-sm font-medium hover:border-accent">
              <Dot color={BUCKET_COLOR[c.bucket]} /><span className="truncate">{shownCategoryName(db, catById.get(c.id), lang)}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-4 text-center text-xs text-muted">{L('גרור את הכרטיס שמאלה לצרכים או ימינה לרצונות', 'Drag the card left for needs or right for wants')}</p>
    </div>
  );
}
