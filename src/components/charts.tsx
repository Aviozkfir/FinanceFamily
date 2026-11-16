// Hand-drawn SVG/HTML charts. Marks carry the bucket color; all text stays in ink tokens.
import { useRef, useState, type ReactNode } from 'react';
import type { Lang, SpendBucket } from '../lib/types';
import { SPEND_BUCKETS } from '../lib/types';
import { dayLabel, money, moneyCompact, monthLabel, niceScale, pct } from '../lib/format';
import { bucketName, useLang } from '../lib/store';
import type { MonthAnalysis } from '../lib/analysis/compute';
import { BUCKET_COLOR, CountMoney, Dot, Meter, Money, cx } from './ui';

// ---------- tooltip ----------
interface Tip { x: number; y: number; content: ReactNode }
function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: React.MouseEvent | React.FocusEvent, content: ReactNode) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const r = (e.currentTarget as Element).getBoundingClientRect();
    const x = 'clientX' in e && e.clientX ? e.clientX : r.left + r.width / 2;
    const y = 'clientY' in e && e.clientY ? e.clientY : r.top;
    setTip({ x: x - box.left, y: y - box.top, content });
  };
  const node = tip && (
    <div role="tooltip" className="pointer-events-none absolute z-20 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-line-strong bg-surface3 px-3 py-2 text-[13px] shadow-xl"
      style={{ left: Math.max(70, Math.min(tip.x, (ref.current?.clientWidth ?? 9999) - 70)), top: tip.y - 10 }}>
      {tip.content}
    </div>
  );
  return { ref, show, hide: () => setTip(null), node };
}

function TipRow({ color, label, value }: { color?: string; label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-ink2">{color && <Dot color={color} />}{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

// ---------- donut ("cake") ----------
export interface Slice { id: string; label: string; value: number; color: string }

function arc(cx0: number, cy0: number, rOut: number, rIn: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${cx0 + r * Math.sin(a)} ${cy0 - r * Math.cos(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(rOut, a0)} A ${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)} L ${p(rIn, a1)} A ${rIn} ${rIn} 0 ${large} 0 ${p(rIn, a0)} Z`;
}

export function Donut({ slices, size = 220, center, thickness = 0.26 }: { slices: Slice[]; size?: number; center?: ReactNode; thickness?: number }) {
  const lang = useLang();
  const tip = useTip();
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + Math.max(x.value, 0), 0);
  const R = 100, rIn = R * (1 - thickness);
  const gap = 2 / R; // ≈2px surface gap between slices
  let angle = 0;
  const shown = slices.filter((s) => s.value > 0);
  return (
    <div ref={tip.ref} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="-104 -104 208 208" width={size} height={size} role="img"
        aria-label={shown.map((s) => `${s.label} ${pct(s.value / (total || 1))}`).join(', ')}>
        {total <= 0 && <circle r={(R + rIn) / 2} fill="none" stroke="var(--surface2)" strokeWidth={R - rIn} />}
        {shown.map((s) => {
          const sweep = (s.value / total) * Math.PI * 2;
          const a0 = angle + (shown.length > 1 ? gap / 2 : 0);
          const a1 = angle + sweep - (shown.length > 1 ? gap / 2 : 0.0001);
          angle += sweep;
          return (
            <path key={s.id} d={arc(0, 0, R, rIn, a0, Math.max(a1, a0 + 0.001))} fill={s.color} tabIndex={0}
              opacity={hover && hover !== s.id ? 0.45 : 1} style={{ transition: 'opacity .15s', outline: 'none' }}
              onMouseMove={(e) => { setHover(s.id); tip.show(e, <TipRow color={s.color} label={s.label} value={`${money(s.value, lang)} · ${pct(s.value / total)}`} />); }}
              onFocus={(e) => { setHover(s.id); tip.show(e, <TipRow color={s.color} label={s.label} value={`${money(s.value, lang)} · ${pct(s.value / total)}`} />); }}
              onMouseLeave={() => { setHover(null); tip.hide(); }} onBlur={() => { setHover(null); tip.hide(); }} />
          );
        })}
      </svg>
      {center && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
      {tip.node}
    </div>
  );
}

// ---------- bucket meters: actual vs target ----------
export function BucketMeters({ a }: { a: MonthAnalysis }) {
  const lang = useLang();
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  return (
    <div className="space-y-5">
      {SPEND_BUCKETS.map((b) => {
        const target = a.target[b];
        // Savings is what was left of the income, so there more is better.
        const actual = a.spent[b];
        const guessed = b === 'invest' ? 0 : a.guessed[b];
        const scale = Math.max(target, actual, 1) * 1.08;
        const over = b !== 'invest' && target > 0 && actual > target;
        const diff = b === 'invest' ? actual - target : target - actual;
        return (
          <div key={b}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="flex items-center gap-2 font-medium"><Dot color={BUCKET_COLOR[b]} />{bucketName(b, lang)}
                <span className="text-xs font-normal text-muted">{a.split[b]}%</span></span>
              <span className="text-sm text-ink2">
                <Money value={actual} className="font-semibold text-ink" />
                {target > 0 && <> {L('מתוך', 'of')} <Money value={target} /></>}
              </span>
            </div>
            <div className="relative h-3 rounded-full" style={{ background: `var(--${b}-soft)` }}>
              <div className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${(actual / scale) * 100}%`, background: BUCKET_COLOR[b] }} />
              {target > 0 && <div className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ insetInlineStart: `${(target / scale) * 100}%` }} title={L('יעד', 'Target')} />}
            </div>
            {target > 0 && (
              <p className={cx('mt-1.5 text-[13px]', over || (b === 'invest' && diff < 0) ? 'text-bad' : 'text-muted')}>
                {b === 'invest'
                  ? diff >= 0
                    ? L(`עומד ביעד${diff > 0 ? ` · ${money(diff, lang)} מעליו` : ''}`, `On target${diff > 0 ? ` · ${money(diff, lang)} above it` : ''}`)
                    : L(`▼ חסרים ${money(-diff, lang)} ליעד`, `▼ ${money(-diff, lang)} short of target`)
                  : over
                    ? L(`▲ חריגה של ${money(-diff, lang)} (${pct(actual / target)} מהיעד)`, `▲ ${money(-diff, lang)} over (${pct(actual / target)} of target)`)
                    : L(`נשארו ${money(diff, lang)}`, `${money(diff, lang)} left`)}
              </p>
            )}
            {guessed !== 0 && <p className="mt-0.5 text-[13px] text-warn">{L(`מתוכם ${money(guessed, lang)} לפי ניחוש שלא אושר`, `${money(guessed, lang)} of this is an unconfirmed guess`)}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ---------- shared plot frame ----------
function Axis({ max, step, h, w, padL }: { max: number; step: number; h: number; w: number; padL: number }) {
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  const compact = max >= 10000;
  return (
    <g>
      {ticks.map((v) => {
        const y = h - (v / max) * h;
        return (
          <g key={v}>
            <line x1={padL} x2={w} y1={y} y2={y} stroke={v === 0 ? 'var(--line-strong)' : 'var(--grid)'} strokeWidth={1} />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="num">{moneyCompact(v, compact)}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Column with a rounded top and a square base. */
const column = (x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, h, w / 2);
  return `M ${x} ${y + h} V ${y + rr} Q ${x} ${y} ${x + rr} ${y} H ${x + w - rr} Q ${x + w} ${y} ${x + w} ${y + rr} V ${y + h} Z`;
};

// ---------- daily spending ----------
export function DailyChart({ daily }: { daily: { date: string; total: number }[] }) {
  const lang = useLang();
  const tip = useTip();
  const W = 720, H = 190, padL = 44, padB = 22;
  const data = daily.filter((d) => d.total > 0);
  if (!data.length) return null;
  const [max, step] = niceScale(Math.max(...data.map((d) => d.total)));
  const slot = (W - padL) / data.length;
  const bw = Math.min(18, Math.max(3, slot - 2));
  const every = Math.ceil(data.length / 8);
  return (
    <div ref={tip.ref} className="relative" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H + padB}`} className="w-full" role="img" aria-label={lang === 'he' ? 'הוצאות לפי יום' : 'Spending by day'}>
        <Axis max={max} step={step} h={H} w={W} padL={padL} />
        {data.map((d, n) => {
          const i = lang === 'he' ? data.length - 1 - n : n;
          const x = padL + slot * i + (slot - bw) / 2;
          const h = (d.total / max) * H;
          return (
            <g key={d.date}>
              <path d={column(x, H - h, bw, h, 4)} fill="var(--accent)" />
              <rect x={padL + slot * i} y={0} width={slot} height={H} fill="transparent"
                onMouseMove={(e) => tip.show(e, <TipRow label={dayLabel(d.date, lang)} value={money(d.total, lang)} />)} onMouseLeave={tip.hide} />
              {n % every === 0 && <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">{dayLabel(d.date, lang)}</text>}
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

// ---------- months: stacked buckets + income marker ----------
export function Legend({ items }: { items: { color: string; label: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.line ? <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: i.color }} /> : <Dot color={i.color} />}{i.label}
        </span>
      ))}
    </div>
  );
}

export function MonthsChart({ analyses, forecast }: { analyses: MonthAnalysis[]; forecast?: { month: string; values: Record<SpendBucket, number> } | null }) {
  const lang = useLang();
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  const tip = useTip();
  const cols = [
    ...analyses.map((a) => ({ key: a.key, values: a.spent, other: a.unclassified.total, income: a.income, forecast: false })),
    ...(forecast ? [{ key: forecast.month, values: forecast.values, other: 0, income: 0, forecast: true }] : []),
  ];
  const W = 720, H = 220, padL = 48, padB = 24;
  const top = Math.max(...cols.map((c) => Math.max(c.income, c.values.needs + c.values.wants + c.values.invest + c.other)), 1);
  const [max, step] = niceScale(top);
  const slot = (W - padL) / cols.length;
  const bw = Math.min(24, slot * 0.5);
  const hasOther = cols.some((c) => c.other > 0);
  return (
    <div ref={tip.ref} className="relative">
      <div className="mb-3">
        <Legend items={[
          ...SPEND_BUCKETS.map((b) => ({ color: BUCKET_COLOR[b], label: bucketName(b, lang) })),
          ...(hasOther ? [{ color: 'var(--neutral-mark)', label: L('לא מסווג', 'Unclassified') }] : []),
          { color: 'var(--ink)', label: L('הכנסה', 'Income'), line: true },
        ]} />
      </div>
      <div dir="ltr">
        <svg viewBox={`0 0 ${W} ${H + padB}`} className="w-full" role="img" aria-label={L('הוצאות לפי חודש', 'Spending by month')}>
          <Axis max={max} step={step} h={H} w={W} padL={padL} />
          {cols.map((c, n) => {
            // Time runs the way the language reads: right to left in Hebrew.
            const i = lang === 'he' ? cols.length - 1 - n : n;
            const x = padL + slot * i + (slot - bw) / 2;
            const parts = [...SPEND_BUCKETS.map((b) => ({ v: c.values[b], color: BUCKET_COLOR[b] })), { v: c.other, color: 'var(--neutral-mark)' }].filter((p) => p.v > 0);
            let y = H;
            const total = parts.reduce((s, p) => s + p.v, 0);
            return (
              <g key={c.key} opacity={c.forecast ? 0.55 : 1}>
                {parts.map((p, j) => {
                  const h = Math.max((p.v / max) * H - (j < parts.length - 1 ? 2 : 0), 1);
                  const top0 = y - (p.v / max) * H;
                  y = top0;
                  const isTop = j === parts.length - 1;
                  return isTop
                    ? <path key={j} d={column(x, top0, bw, h, 4)} fill={p.color} />
                    : <rect key={j} x={x} y={top0 + 2} width={bw} height={h} fill={p.color} />;
                })}
                {c.income > 0 && <line x1={x - 7} x2={x + bw + 7} y1={H - (c.income / max) * H} y2={H - (c.income / max) * H} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />}
                <text x={x + bw / 2} y={H + 17} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {monthLabel(c.key, lang, true)}{c.forecast ? ' *' : ''}
                </text>
                <rect x={padL + slot * i} y={0} width={slot} height={H} fill="transparent" onMouseLeave={tip.hide}
                  onMouseMove={(e) => tip.show(e, (
                    <div className="space-y-0.5">
                      <div className="mb-1 font-semibold">{monthLabel(c.key, lang)}{c.forecast ? ` · ${L('תחזית', 'forecast')}` : ''}</div>
                      {SPEND_BUCKETS.map((b) => <TipRow key={b} color={BUCKET_COLOR[b]} label={bucketName(b, lang)} value={money(c.values[b], lang)} />)}
                      {c.other > 0 && <TipRow color="var(--neutral-mark)" label={L('לא מסווג', 'Unclassified')} value={money(c.other, lang)} />}
                      <TipRow label={L('סך הכול', 'Total')} value={money(total, lang)} />
                      {c.income > 0 && <TipRow label={L('הכנסה', 'Income')} value={money(c.income, lang)} />}
                    </div>
                  ))} />
              </g>
            );
          })}
        </svg>
      </div>
      {forecast && <p className="mt-1 text-xs text-muted">* {L('תחזית', 'Forecast')}</p>}
      {tip.node}
    </div>
  );
}

// ---------- ranked horizontal bars ----------
export function RankBars({ rows, lang }: { rows: { key: string; label: string; sub?: string; value: number; color: string }[]; lang: Lang }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate"><bdi>{r.label}</bdi>{r.sub && <span className="ms-1.5 text-xs text-muted">{r.sub}</span>}</span>
            <span className="num shrink-0 font-semibold" dir="ltr">{money(r.value, lang)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface2">
            <div className="grow h-full rounded-full" style={{ width: `${Math.max((Math.max(r.value, 0) / max) * 100, 1)}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- the month in one picture: where the income went, against the plan ----------
/**
 * One bar the width of the income, cut into needs, wants and what was saved, with the planned
 * split drawn right under it on the same scale. When spending passed the income the bar runs
 * past a marked "income" line instead.
 */
export function MonthPicture({ a, legend }: { a: MonthAnalysis; legend?: boolean }) {
  const lang = useLang();
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  const scale = Math.max(a.income, a.totalSpent, 1);
  const w = (v: number) => `${(Math.max(v, 0) / scale) * 100}%`;
  const actual = [
    { id: 'needs', label: bucketName('needs', lang), value: a.spent.needs, color: BUCKET_COLOR.needs },
    { id: 'wants', label: bucketName('wants', lang), value: a.spent.wants, color: BUCKET_COLOR.wants },
    { id: 'un', label: L('לא מסווג', 'Unclassified'), value: a.unclassified.total, color: 'var(--neutral-mark)' },
    { id: 'invest', label: bucketName('invest', lang), value: a.spent.invest, color: BUCKET_COLOR.invest },
  ].filter((x) => x.value > 0);
  const planned = a.basis === 'none' ? [] : SPEND_BUCKETS.map((b) => ({ id: b, label: bucketName(b, lang), value: a.target[b], color: BUCKET_COLOR[b] })).filter((x) => x.value > 0);
  const over = a.income > 0 && a.totalSpent > a.income;
  const row = 'flex gap-0.5 overflow-hidden rounded-md';
  return (
    <div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs text-muted">
        <span>{L('בפועל', 'Actual')}</span>
        <div className="relative">
          <div className={cx(row, 'h-7')}>
            {actual.map((x) => <div key={x.id} className="grow" title={`${x.label} · ${money(x.value, lang)}`} style={{ width: w(x.value), background: x.color }} />)}
          </div>
          {over && <div className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ insetInlineStart: w(a.income) }} title={L('הכנסה', 'Income')} />}
        </div>
        {planned.length > 0 && <>
          <span>{L('יעד', 'Plan')}</span>
          <div className={cx(row, 'h-2.5')}>
            {planned.map((x) => <div key={x.id} className="grow-late opacity-50" title={`${x.label} · ${money(x.value, lang)}`} style={{ width: w(x.value), background: x.color }} />)}
          </div>
        </>}
      </div>
      {over && <p className="mt-2 text-[13px] text-ink2">{L('הקו מסמן את ההכנסה — ההוצאות עברו אותו.', 'The line marks your income — spending went past it.')}</p>}
      {legend && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {actual.map((x) => <li key={x.id} className="flex items-center gap-1.5 text-ink2"><Dot color={x.color} />{x.label} <Money value={x.value} className="font-semibold text-ink" /></li>)}
        </ul>
      )}
    </div>
  );
}

// ---------- sparkline: how one figure moved over the months ----------
/** A small line with no axes. The line is quiet; the last point, the current value, is marked. */
export function Sparkline({ values: inOrder, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  const lang = useLang();
  if (inOrder.length < 2) return null;
  // Oldest first in reading order, so the marked current value sits at the reading end.
  const values = lang === 'he' ? [...inOrder].reverse() : inOrder;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1, pad = 4;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), pad + (1 - (v - min) / span) * (height - pad * 2)] as const);
  const [lx, ly] = pts[lang === 'he' ? 0 : pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="max-w-full overflow-visible">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--neutral-mark)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

// ---------- the month's headline: how much was saved, and how spending sat against the plan ----------
/** A ring filled to the share of income that was saved. Past the target it simply keeps filling. */
function SavingsRing({ rate, bad }: { rate: number; bad?: boolean }) {
  const lang = useLang();
  const r = 48, full = 2 * Math.PI * r, shown = Math.max(0, Math.min(rate, 1)) * full;
  return (
    <svg width={112} height={112} viewBox="0 0 118 118" className="shrink-0" role="img" aria-label={`${pct(rate)} ${lang === 'he' ? 'מההכנסה נחסכו' : 'of income saved'}`}>
      <circle cx={59} cy={59} r={r} fill="none" stroke="var(--track)" strokeWidth={12} />
      {shown > 0 && <circle className="ring-draw" cx={59} cy={59} r={r} fill="none" stroke={bad ? 'var(--bad)' : 'var(--ring)'} strokeWidth={12} strokeLinecap="round"
        strokeDasharray={`${shown} ${full}`} transform="rotate(-90 59 59)" style={{ ['--ring-full' as string]: `${shown}` }} />}
      <text x={59} y={57} textAnchor="middle" fill="var(--ink)" style={{ font: '800 24px var(--font-sans)' }}>{pct(Math.max(rate, 0))}</text>
      <text x={59} y={75} textAnchor="middle" fill="var(--muted)" style={{ font: '400 11px var(--font-sans)' }}>{lang === 'he' ? 'מההכנסה' : 'of income'}</text>
    </svg>
  );
}

export function MonthHero({ a }: { a: MonthAnalysis }) {
  const lang = useLang();
  const L = (he: string, en: string) => (lang === 'he' ? he : en);
  const hasIncome = a.income > 0;
  const saved = Math.max(a.leftover, 0);
  const met = a.target.invest > 0 && saved >= a.target.invest;
  return (
    <div>
      <div className="flex items-center gap-4">
        {hasIncome && <SavingsRing rate={a.savingsRate ?? 0} bad={a.leftover < 0} />}
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{!hasIncome ? L('הוצאת החודש', 'You spent this month') : a.leftover >= 0 ? L('חסכת החודש', 'You saved this month') : L('חרגת מההכנסה ב-', 'You overspent by')}</p>
          <CountMoney value={hasIncome ? Math.abs(a.leftover) : a.totalSpent} className={cx('block text-[34px] font-extrabold leading-tight tracking-tight', hasIncome && a.leftover < 0 && 'text-bad')} />
          {hasIncome && a.leftover >= 0 && a.target.invest > 0 && (
            <span className={cx('mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', met ? 'bg-accent-soft text-[var(--accent-ink)]' : 'bg-surface2 text-warn')}>
              {met ? L(`✓ מעל היעד של ${a.split.invest}%`, `✓ Above the ${a.split.invest}% target`) : L(`חסרים ${money(a.target.invest - saved, lang)} ליעד`, `${money(a.target.invest - saved, lang)} short of target`)}
            </span>
          )}
        </div>
      </div>
      {(['needs', 'wants'] as const).map((b) => {
        const actual = a.spent[b], target = a.target[b], left = target - actual;
        return (
          <div key={b} className="mt-4">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2"><Dot color={BUCKET_COLOR[b]} />{bucketName(b, lang)}</span>
              <Money value={actual} className="font-bold" />
            </div>
            {target > 0 && (
              <>
                <p className={cx('mb-1.5 text-[12.5px]', left < 0 ? 'text-bad' : 'text-muted')}>
                  {left >= 0 ? L(`נשארו ${money(left, lang)} מתוך ${money(target, lang)}`, `${money(left, lang)} left of ${money(target, lang)}`) : L(`חריגה של ${money(-left, lang)} מעל ${money(target, lang)}`, `${money(-left, lang)} over ${money(target, lang)}`)}
                </p>
                <Meter value={actual} target={target} color={BUCKET_COLOR[b]} soft="var(--track)" label={`${bucketName(b, lang)}: ${money(actual, lang)} ${L('מתוך', 'of')} ${money(target, lang)}`} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
