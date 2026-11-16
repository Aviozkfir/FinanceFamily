import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { ArrowLeftRight, Check, CheckCheck, Globe, Layers, Pencil, Plus, Repeat, Search, Sparkles, Trash2, Wand2, SlidersHorizontal, X } from 'lucide-react';
import type { BucketId, Category, Tx } from '../lib/types';
import { bucketName, categoryName, emptyMonth, useL, useLang, useStore } from '../lib/store';
import { dayLabel, isMonthKey, merchantKey, money, monthLabel } from '../lib/format';
import { isTransfer, sourceOf, type Source } from '../lib/learn';
import { BUCKET_COLOR, Button, Dot, IconButton, Modal, Money, Segmented, TextInput, cx } from '../components/ui';

/** `source` is the least certain one among the item's transactions, so one guess marks the whole bubble. */
interface Item { id: string; txs: Tx[]; merchant: string; amount: number; categoryId: string | null; source: Source | null; hint?: string }
const RANK: Record<Source, number> = { user: 0, learned: 1, guess: 2 };
const weakest = (a: Source | null, b: Source | null): Source | null => (!a ? b : !b ? a : RANK[a] >= RANK[b] ? a : b);

function buildItems(txs: Tx[], grouped: boolean): Item[] {
  if (!grouped) return txs.map((t) => ({ id: t.id, txs: [t], merchant: t.merchant, amount: t.amount, categoryId: t.categoryId, source: sourceOf(t), hint: t.hint }));
  const map = new Map<string, Item>();
  for (const t of txs) {
    const id = `g:${merchantKey(t.merchant)}|${t.categoryId ?? ''}`;
    const it: Item = map.get(id) ?? { id, txs: [], merchant: t.merchant, amount: 0, categoryId: t.categoryId, source: null };
    it.txs.push(t); it.amount += t.amount;
    it.source = weakest(it.source, sourceOf(t)); it.hint ??= t.hint;
    map.set(id, it);
  }
  return [...map.values()];
}

function BubbleBody({ item, color, selected, overlay, extra }: { item: Item; color: string; selected?: boolean; overlay?: boolean; extra?: number }) {
  const lang = useLang();
  const abs = Math.abs(item.amount);
  const size = abs >= 500 ? 'px-4 py-2.5 text-[15px]' : abs >= 100 ? 'px-3.5 py-2 text-sm' : 'px-3 py-1.5 text-[13px]';
  const t0 = item.txs[0];
  const guess = item.source === 'guess';
  return (
    <span className={cx('inline-flex max-w-full select-none items-center gap-2 rounded-full border bg-surface2 font-medium transition-shadow', size,
      selected ? 'border-accent ring-2 ring-accent' : guess ? 'border-dashed border-warn' : 'border-line-strong hover:border-ink2', overlay && 'cursor-grabbing shadow-2xl')}
      style={{ boxShadow: overlay ? undefined : `inset 3px 0 0 ${color}, inset -3px 0 0 ${color}` }}>
      {guess && <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warn text-[11px] font-bold leading-none text-page">?</span>}
      {item.source === 'learned' && <Sparkles size={12} className="shrink-0 text-muted" />}
      <bdi className="truncate" style={{ maxWidth: 190 }}>{item.merchant}</bdi>
      {item.txs.length > 1 && <span className="rounded-full bg-surface3 px-1.5 text-[11px] text-ink2">×{item.txs.length}</span>}
      {item.txs.some((t) => t.standing) && <Repeat size={12} className="shrink-0 text-muted" />}
      {item.txs.some((t) => t.abroad) && <Globe size={12} className="shrink-0 text-muted" />}
      {isTransfer(item.merchant) && <ArrowLeftRight size={12} className="shrink-0 text-muted" />}
      {item.txs.length === 1 && t0.installment && <span className="text-[11px] text-muted" dir="ltr">{t0.installment.n}/{t0.installment.of}</span>}
      <span dir="ltr" className={cx('num shrink-0 font-bold', item.amount < 0 && 'text-good')}>{money(item.amount, lang, true)}</span>
      {extra ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-page">+{extra}</span> : null}
    </span>
  );
}

function Bubble({ item, color, selected, onToggle }: { item: Item; color: string; selected: boolean; onToggle: () => void }) {
  const lang = useLang();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  const title = item.txs.slice(0, 12).map((t) => `${dayLabel(t.date, lang)} · ${money(t.amount, lang, true)}${t.note ? ` · ${t.note}` : ''}${t.origAmount != null ? ` (${t.origCurrency}${t.origAmount})` : ''}`).join('\n');
  return (
    <button ref={setNodeRef} {...listeners} {...attributes} type="button" onClick={onToggle} title={title} aria-pressed={selected}
      className={cx('pop press max-w-full cursor-grab touch-manipulation rounded-full', isDragging && 'opacity-30')}>
      <BubbleBody item={item} color={color} selected={selected} />
    </button>
  );
}

function Zone({ id, className, children, highlight = true }: { id: string; className?: string; children: React.ReactNode; highlight?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={cx(className, 'transition-colors', isOver && highlight && '!border-accent !bg-accent-soft')}>{children}</div>;
}

// Savings is what is left of the income, so it is not a place to put a card transaction.
const BUCKETS: BucketId[] = ['needs', 'wants', 'ignore'];

export default function ClassifyPage() {
  const { month = '' } = useParams();
  const navigate = useNavigate();
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const { assign, confirm, suggestRest, addCategory, updateCategory, removeCategory } = useStore();
  const key = isMonthKey(month) ? month : '';
  const m = db.months[key] ?? emptyMonth(key);

  const [grouped, setGrouped] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [catModal, setCatModal] = useState<{ id?: string; name: string; bucket: BucketId } | null>(null);
  const [onlyGuesses, setOnlyGuesses] = useState(false);
  const [tools, setTools] = useState(false);
  const [toast, setToast] = useState('');

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }));

  const items = useMemo(() => buildItems(m.txs, grouped).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)), [m.txs, grouped]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const q = query.trim().toLowerCase();
  const guesses = items.filter((i) => i.source === 'guess');
  const reviewing = onlyGuesses && guesses.length > 0;
  const match = (i: Item) => (!q || i.merchant.toLowerCase().includes(q)) && (!reviewing || i.source === 'guess');
  const pool = items.filter((i) => !i.categoryId);
  // Needs first, then wants, then "don't count"; inside each, the plain "other" one comes last.
  const cats = BUCKETS.flatMap((b) => { const inB = db.categories.filter((c) => c.bucket === b); return [...inB.filter((c) => !c.builtin), ...inB.filter((c) => c.builtin)]; });
  const catById = new Map(cats.map((c) => [c.id, c]));
  const colorOf = (categoryId: string | null) => BUCKET_COLOR[categoryId ? catById.get(categoryId)?.bucket ?? 'none' : 'none'];

  // Selection ids can go stale when grouping changes or items move.
  useEffect(() => { setSelected((s) => { const next = new Set([...s].filter((id) => byId.has(id))); return next.size === s.size ? s : next; }); }, [byId]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);

  const idsFor = (itemIds: Iterable<string>) => [...itemIds].flatMap((id) => byId.get(id)?.txs.map((t) => t.id) ?? []);
  const moveItems = (itemIds: Iterable<string>, categoryId: string | null) => { assign(key, idsFor(itemIds), categoryId); setSelected(new Set()); };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    setDragId(null);
    if (!e.over) return;
    const target = e.over.id === 'pool' ? null : String(e.over.id);
    moveItems(selected.has(id) ? selected : [id], target);
  }

  // Number keys move the current selection: 1 = first category, 2 = second …
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || !selected.size || catModal) return;
      if (e.key === 'Escape') return setSelected(new Set());
      const n = Number(e.key);
      if (n >= 1 && n <= cats.length) moveItems(selected, cats[n - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function autoClassify() {
    const n = suggestRest(key);
    setToast(n ? L(`${n} עסקאות קיבלו הצעה — הן מסומנות ב-? עד שתאשר`, `${n} transactions got a suggestion — marked with ? until you confirm`) : L('אין לי עדיין מספיק מידע כדי להציע סיווג לאלה', 'I do not know enough yet to suggest a category for these'));
  }

  const classifiedCount = m.txs.filter((t) => t.categoryId).length;
  const dragItem = dragId ? byId.get(dragId) : null;
  const selAmount = [...selected].reduce((s, id) => s + (byId.get(id)?.amount ?? 0), 0);
  const selItems = [...selected].map((id) => byId.get(id)).filter((i): i is Item => !!i);
  const selUnconfirmed = selItems.some((i) => i.source === 'guess' || i.source === 'learned');
  const selHint = selItems.length === 1 && selItems[0].source === 'guess' ? selItems[0].hint : undefined;

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
      <div className="flex h-dvh flex-col">
        {/* Top bar: what this is, how far along, and the way out. Search and grouping sit behind one icon. */}
        <header className="border-b border-line bg-surface px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="me-auto min-w-0">
              <h1 className="truncate text-base font-bold">{L('סיווג', 'Classify')} · {monthLabel(key, lang)}</h1>
              <p className="text-[13px] text-muted">{L(`${classifiedCount} מתוך ${m.txs.length} סווגו`, `${classifiedCount} of ${m.txs.length} classified`)}</p>
            </div>
            <IconButton label={L('חיפוש ואפשרויות', 'Search and options')} aria-expanded={tools} onClick={() => setTools(!tools)} className={tools || query ? '!bg-surface2 !text-accent' : ''}><SlidersHorizontal size={17} /></IconButton>
            <Button size="sm" variant="primary" icon={<Check size={15} />} onClick={() => navigate(`/month/${key}`)}>{L('סיום', 'Done')}</Button>
          </div>
          {tools && (
            <div className="rise mt-2.5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-40 flex-1">
                <Search size={15} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted" />
                <TextInput autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L('חיפוש בית עסק', 'Search merchant')} className="!h-9 !ps-9" />
              </div>
              <Button size="sm" variant={grouped ? 'soft' : 'ghost'} icon={<Layers size={15} />} onClick={() => setGrouped(!grouped)} aria-pressed={grouped}>{L('קבץ לפי בית עסק', 'Group by merchant')}</Button>
            </div>
          )}
        </header>

        {/* What the app decided by itself, and how sure it is */}
        {guesses.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface2 px-4 py-2.5 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warn text-xs font-bold text-page">?</span>
            <span className="me-auto font-medium">{L(`${guesses.length} ניחושים לאישור`, `${guesses.length} guesses to confirm`)} · <Money value={guesses.reduce((s, i) => s + i.amount, 0)} /></span>
            <Button size="sm" variant={reviewing ? 'primary' : 'soft'} aria-pressed={reviewing} onClick={() => setOnlyGuesses(!onlyGuesses)}>{reviewing ? L('הצג הכול', 'Show all') : L('הצג רק ניחושים', 'Show only guesses')}</Button>
            <Button size="sm" icon={<CheckCheck size={15} />} onClick={() => { confirm(key, idsFor(guesses.map((i) => i.id))); setSelected(new Set()); }}>{L('אשר הכול', 'Confirm all')}</Button>
          </div>
        ) : items.some((i) => i.source === 'learned') ? (
          <p className="flex items-center gap-1.5 border-b border-line bg-surface2 px-4 py-2 text-[13px] text-muted"><Sparkles size={13} />{L('מסומן כך: סווג לבד, לפי מה שבחרת בעבר', 'Marked like this: classified automatically, from what you chose before')}</p>
        ) : null}

        {/* On a phone the whole board is one scroll, with what is still waiting pinned on top as a short strip.
            On a wide screen the two sit side by side, each scrolling by itself. */}
        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:overflow-hidden">
          {/* Pool */}
          <Zone id="pool" className="sticky top-0 z-10 max-h-[34dvh] overflow-y-auto border-b border-line bg-page px-4 py-3 lg:static lg:max-h-none lg:border-b-0 lg:border-e lg:p-4">
            <div className={cx('flex items-center justify-between', pool.length > 0 && 'mb-2.5')}>
              <h2 className="flex items-center gap-2 text-sm font-semibold">{pool.length ? <Dot color="var(--neutral-mark)" /> : <Check size={16} className="text-good" strokeWidth={3} />}{pool.length ? L('ממתינות לסיווג', 'Waiting to be classified') : m.txs.length ? L('הכול מסווג', 'Everything is classified') : L('אין עסקאות בחודש הזה', 'No transactions this month')}</h2>
              {pool.length > 0 && <span className="flex items-center gap-2 text-sm text-muted">{pool.length} · <Money value={pool.reduce((s, i) => s + i.amount, 0)} />
                <IconButton label={L('הצע סיווג', 'Suggest a category')} className="!h-8 !w-8" onClick={autoClassify}><Wand2 size={15} /></IconButton></span>}
            </div>
            {pool.length ? (
              <div className="flex flex-wrap gap-2">
                {pool.filter(match).map((i) => <Bubble key={i.id} item={i} color="transparent" selected={selected.has(i.id)} onToggle={() => toggle(i.id)} />)}
              </div>
            ) : null}
          </Zone>

          {/* Categories */}
          <div className="p-4 pb-24 lg:overflow-y-auto lg:pb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cats.map((c, idx) => {
                const inCat = items.filter((i) => i.categoryId === c.id);
                return (
                  <Fragment key={c.id}>
                  {(idx === 0 || cats[idx - 1].bucket !== c.bucket) && c.bucket !== 'ignore' && (
                    <h3 className="flex items-center gap-2 pt-1 text-sm font-semibold text-ink2 sm:col-span-2"><Dot color={BUCKET_COLOR[c.bucket]} />{bucketName(c.bucket, lang)}</h3>
                  )}
                  <Zone id={c.id} className={cx('flex flex-col rounded-2xl border border-line bg-surface p-3', inCat.length ? 'min-h-24' : 'min-h-0')}>
                    <div className={cx('flex items-center gap-2', inCat.length > 0 && 'mb-2')}>
                      <Dot color={BUCKET_COLOR[c.bucket]} className="!h-3 !w-3" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{categoryName(c, lang)}</p>
                      </div>
                      <span className="text-end text-sm"><Money value={inCat.reduce((s, i) => s + i.amount, 0)} className="font-bold" /><span className="block text-xs text-muted">{inCat.reduce((s, i) => s + i.txs.length, 0)}</span></span>
                      {!c.builtin && <IconButton label={L('עריכת קטגוריה', 'Edit category')} className="!h-7 !w-7" onClick={() => setCatModal({ id: c.id, name: c.name, bucket: c.bucket })}><Pencil size={13} /></IconButton>}
                      {idx < 9 && <kbd className="hidden rounded-md border border-line px-1.5 text-[11px] text-muted lg:block">{idx + 1}</kbd>}
                    </div>
                    <div className="flex flex-1 flex-wrap content-start gap-1.5">
                      {inCat.filter(match).map((i) => <Bubble key={i.id} item={i} color={BUCKET_COLOR[c.bucket]} selected={selected.has(i.id)} onToggle={() => toggle(i.id)} />)}
                    </div>
                  </Zone>
                  </Fragment>
                );
              })}
              <button onClick={() => setCatModal({ name: '', bucket: 'wants' })}
                className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong text-muted transition-colors hover:border-accent hover:text-ink">
                <Plus size={22} /><span className="text-sm font-semibold">{L('קטגוריה חדשה', 'New category')}</span>
                <span className="px-4 text-center text-xs">{L('למשל: מסעדות, רכב, ילדים', 'e.g. Restaurants, Car, Kids')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Selection bar */}
        {selected.size > 0 && (
          <div className="rise fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-line-strong bg-surface3 p-3 shadow-2xl">
            <span className="me-1 text-sm font-semibold">{L(`${selected.size} נבחרו`, `${selected.size} selected`)} · <Money value={selAmount} /></span>
            {selItems.some((i) => i.source === 'guess') && <span className="w-full text-[13px] text-warn">{selHint ? <>{L('ניחוש לפי', 'Guessed from')} <bdi>{selHint}</bdi></> : L('ניחוש — אשר, או העבר לקטגוריה הנכונה', 'A guess — confirm it, or move it to the right category')}</span>}
            {selItems.length > 0 && selItems.every((i) => isTransfer(i.merchant)) && <span className="w-full text-[13px] text-ink2">{L('העברה: כל פעם היא על משהו אחר, אז האפליקציה לא מנחשת ולא זוכרת. בחר לפי מה שהיא שילמה, או "לא לספור" אם הכסף רק עבר בין חשבונות.', 'A transfer: it pays for something different each time, so the app does not guess or remember. Choose by what it paid for, or "don\'t count" if the money only moved between accounts.')}</span>}
            {selUnconfirmed && selItems.every((i) => i.categoryId) && (
              <button onClick={() => { confirm(key, idsFor(selected)); setSelected(new Set()); }} className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-page">
                <Check size={14} />{L('נכון, אשר', 'Correct, confirm')}
              </button>
            )}
            {cats.map((c) => (
              <button key={c.id} onClick={() => moveItems(selected, c.id)} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-accent">
                <Dot color={BUCKET_COLOR[c.bucket]} />{categoryName(c, lang)}
              </button>
            ))}
            <button onClick={() => moveItems(selected, null)} className="rounded-full px-3 py-1.5 text-[13px] text-ink2 hover:bg-surface">{L('בטל סיווג', 'Unclassify')}</button>
            <IconButton label={L('נקה בחירה', 'Clear selection')} className="ms-auto" onClick={() => setSelected(new Set())}><X size={16} /></IconButton>
          </div>
        )}
        {toast && !selected.size && <div role="status" className="rise fixed inset-x-3 bottom-4 z-40 mx-auto w-fit max-w-[92vw] rounded-2xl border border-line-strong bg-surface3 px-5 py-3 text-sm shadow-2xl">{toast}</div>}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragItem && <BubbleBody item={dragItem} color={colorOf(dragItem.categoryId)} overlay extra={selected.has(dragItem.id) && selected.size > 1 ? selected.size - 1 : 0} />}
      </DragOverlay>

      {catModal && (
        <Modal title={catModal.id ? L('עריכת קטגוריה', 'Edit category') : L('קטגוריה חדשה', 'New category')} onClose={() => setCatModal(null)}>
          <form className="space-y-4" onSubmit={(e) => {
            e.preventDefault();
            const name = catModal.name.trim();
            if (!name) return;
            catModal.id ? updateCategory(catModal.id, { name, bucket: catModal.bucket }) : addCategory(name, catModal.bucket);
            setCatModal(null);
          }}>
            <label className="block"><span className="mb-1.5 block text-sm text-ink2">{L('שם', 'Name')}</span>
              <TextInput autoFocus value={catModal.name} onChange={(e) => setCatModal({ ...catModal, name: e.target.value })} placeholder={L('למשל: מסעדות', 'e.g. Restaurants')} /></label>
            <div><span className="mb-1.5 block text-sm text-ink2">{L('בניתוח 50/30/20 הקטגוריה נספרת תחת', 'In the 50/30/20 analysis this counts as')}</span>
              <div className="grid grid-cols-2 gap-2">
                {BUCKETS.map((b) => (
                  <button type="button" key={b} onClick={() => setCatModal({ ...catModal, bucket: b })} aria-pressed={catModal.bucket === b}
                    className={cx('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium', catModal.bucket === b ? 'border-accent bg-accent-soft' : 'border-line bg-surface2')}>
                    <Dot color={BUCKET_COLOR[b]} />{bucketName(b, lang)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              {catModal.id ? <Button type="button" variant="danger" icon={<Trash2 size={15} />} onClick={() => { removeCategory(catModal.id!); setCatModal(null); }}>{L('מחק', 'Delete')}</Button> : <span />}
              <Button type="submit" variant="primary" disabled={!catModal.name.trim()}>{catModal.id ? L('שמור', 'Save') : L('צור קטגוריה', 'Create category')}</Button>
            </div>
          </form>
        </Modal>
      )}
    </DndContext>
  );
}

export type { Category };
