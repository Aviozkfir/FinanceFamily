import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { BucketId } from '../lib/types';
import { money, monthLabel, shiftMonth } from '../lib/format';
import { useLang } from '../lib/store';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export const BUCKET_COLOR: Record<BucketId | 'none', string> = {
  needs: 'var(--needs)', wants: 'var(--wants)', invest: 'var(--invest)', ignore: 'var(--neutral-mark)', none: 'var(--neutral-mark)',
};

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-[26px] border border-line bg-surface p-5 shadow-[var(--shadow)]', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, hint, action }: { children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{children}</h3>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode };
export function Button({ variant = 'soft', size = 'md', icon, className, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cx(
        'press inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium disabled:opacity-45',
        size === 'sm' && 'h-8 px-3 text-[13px]', size === 'md' && 'h-10 px-4 text-sm', size === 'lg' && 'h-12 px-6 text-[15px]',
        variant === 'primary' && 'bg-[var(--btn)] font-semibold text-[var(--btn-ink)] hover:opacity-90',
        variant === 'soft' && 'border border-line bg-surface2 text-ink hover:bg-surface3',
        variant === 'ghost' && 'text-ink2 hover:bg-surface2 hover:text-ink',
        variant === 'danger' && 'text-bad hover:bg-surface2',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...rest} aria-label={label} title={label}
      className={cx('press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink2 hover:bg-surface2 hover:text-ink disabled:opacity-40', className)}>
      {children}
    </button>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...rest}
      className={cx('h-10 w-full min-w-0 rounded-xl border border-line bg-surface2 px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none', className)} />
  );
}

/** Shekel amount field. Empty shows as empty rather than 0. */
export function AmountInput({ value, onChange, className, ...rest }: { value: number; onChange: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div dir="ltr" className={cx('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">₪</span>
      <input {...rest} type="number" inputMode="decimal" min={0} step="any" dir="ltr"
        value={value || ''} placeholder="0"
        onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
        className="num h-10 w-full rounded-xl border border-line bg-surface2 pl-7 pr-3 text-left text-sm font-medium text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className="inline-flex rounded-xl border border-line bg-surface2 p-1">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={cx('press rounded-lg font-medium', size === 'sm' ? 'px-2.5 py-1 text-[13px]' : 'px-3.5 py-1.5 text-sm',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}
        className={cx('rise max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-6 shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton label="✕" onClick={onClose}><X size={18} /></IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Money({ value, agorot, className }: { value: number; agorot?: boolean; className?: string }) {
  const lang = useLang();
  return <span dir="ltr" className={cx('num whitespace-nowrap', className)}>{money(value, lang, agorot)}</span>;
}

/** Counts from the previous value to the new one over a moment; jumps straight there when motion is reduced. */
export function useCountUp(target: number, ms = 700): number {
  const [shown, setShown] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = target; setShown(target); return; }
    const start = from.current, t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - t0) / ms, 1);
      const eased = 1 - (1 - t) ** 3;
      const v = start + (target - start) * eased;
      from.current = v; setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}

/** A headline amount that counts up to its value. Screen readers get the final value at once. */
export function CountMoney({ value, className }: { value: number; className?: string }) {
  const lang = useLang();
  const shown = useCountUp(value);
  return <span dir="ltr" className={cx('num whitespace-nowrap', className)} aria-label={money(value, lang)}><span aria-hidden>{money(Math.round(shown), lang)}</span></span>;
}

/**
 * One amount against its limit, as a bar: the track is the soft step of the same color, the
 * fill grows to the amount, and a line marks the limit. `overIsBad` (spending) turns the part
 * past the limit into the warning color; for savings, passing the line is the point.
 */
export function Meter({ value, target, color, soft, overIsBad = true, label }: { value: number; target: number; color: string; soft: string; overIsBad?: boolean; label?: string }) {
  const scale = Math.max(target, value, 1) * (target > 0 ? 1.06 : 1);
  const pctOf = (v: number) => `${(Math.max(v, 0) / scale) * 100}%`;
  const over = overIsBad && target > 0 && value > target;
  return (
    <div className="relative h-2 rounded-full" style={{ background: soft }} role="img" aria-label={label}>
      <div className="grow absolute inset-y-0 start-0 rounded-full" style={{ width: pctOf(over ? target : value), background: color }} />
      {over && <div className="grow-late absolute inset-y-0 rounded-e-full" style={{ insetInlineStart: pctOf(target), width: pctOf(value - target), background: 'var(--bad)' }} />}
      {target > 0 && <div className="appear-late absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ insetInlineStart: pctOf(target) }} />}
    </div>
  );
}

export function PageHeader({ title, subtitle, children, back }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function MonthSwitcher({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const lang = useLang();
  const Prev = lang === 'he' ? ChevronRight : ChevronLeft;
  const Next = lang === 'he' ? ChevronLeft : ChevronRight;
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface2">
      <IconButton label={lang === 'he' ? 'חודש קודם' : 'Previous month'} onClick={() => onChange(shiftMonth(value, -1))}><Prev size={18} /></IconButton>
      <span className="min-w-28 px-1 text-center text-sm font-semibold">{monthLabel(value, lang)}</span>
      <IconButton label={lang === 'he' ? 'חודש הבא' : 'Next month'} onClick={() => onChange(shiftMonth(value, 1))}><Next size={18} /></IconButton>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1.5 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />;
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
      tone === 'neutral' && 'bg-surface2 text-ink2', tone === 'good' && 'bg-surface2 text-good', tone === 'warn' && 'bg-surface2 text-warn',
      tone === 'bad' && 'bg-surface2 text-bad', tone === 'accent' && 'bg-accent-soft text-accent')}>
      {children}
    </span>
  );
}
