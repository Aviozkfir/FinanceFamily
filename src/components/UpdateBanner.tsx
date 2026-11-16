import { Download, RefreshCw } from 'lucide-react';
import { useL, useLang } from '../lib/store';
import { linesOf } from '../lib/changelog';
import { installUpdate, useUpdate } from '../lib/update';
import { Button } from './ui';

/** Shown on the phone when a newer version was published. */
export default function UpdateBanner() {
  const L = useL();
  const lang = useLang();
  const u = useUpdate();
  if (u.phase === 'idle' || u.phase === 'checking' || !u.latest) return null;
  const busy = u.phase !== 'available';
  return (
    <div role="status" className="mx-4 mt-3 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-accent bg-accent-soft px-4 py-2.5 text-sm lg:mx-8">
      <RefreshCw size={16} className={busy ? 'mt-0.5 shrink-0 animate-spin text-accent' : 'mt-0.5 shrink-0 text-accent'} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {u.phase === 'available' && (u.goingBack
            ? L(`חזרה לגרסה היציבה: ${u.latest.version}`, `Back to the stable version: ${u.latest.version}`)
            : u.latest.channel === 'dev'
              ? L(`גרסת פיתוח חדשה: ${u.latest.version}`, `A new developer version: ${u.latest.version}`)
              : L(`גרסה חדשה זמינה: ${u.latest.version}`, `A new version is available: ${u.latest.version}`))}
          {u.phase === 'downloading' && L(`מוריד את העדכון… ${u.percent ?? 0}%`, `Downloading the update… ${u.percent ?? 0}%`)}
          {u.phase === 'installing' && L('אשר את ההתקנה בחלון של אנדרואיד', 'Confirm the installation in the Android window')}
          {u.phase === 'restarting' && L('מפעיל מחדש…', 'Restarting…')}
        </p>
        {u.phase === 'available' && u.kind === 'apk' && !u.error && (
          <p className="text-[13px] text-ink2">{L('העדכון הזה מותקן דרך אנדרואיד: אשר את ההתקנה ואז לחץ "פתח". הנתונים נשמרים.', 'This update installs through Android: confirm it, then tap "Open". Your data is kept.')}</p>
        )}
        {u.phase === 'available' && u.latest.notes && !u.goingBack && (
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-[13px] text-ink2">{linesOf(u.latest.notes, lang).map((line) => <li key={line}>{line}</li>)}</ul>
        )}
        {u.error === 'failed' && <p className="text-[13px] text-bad">{L('העדכון נכשל. נסה שוב.', 'The update failed. Try again.')}{u.detail ? ` (${u.detail})` : ''}</p>}
      </div>
      {u.phase === 'available' && (
        <Button size="sm" variant="primary" icon={<Download size={15} />} onClick={() => void installUpdate()}>{L('עדכן', 'Update')}</Button>
      )}
    </div>
  );
}
