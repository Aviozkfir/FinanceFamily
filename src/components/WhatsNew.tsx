import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useL, useLang, useStore } from '../lib/store';
import { CURRENT } from '../lib/update';
import { linesOf, markChangesSeen, unseenChanges } from '../lib/changelog';
import { IconButton } from './ui';

/** Shown once after the app moved to a new version: what changed since the one the user last saw. */
export default function WhatsNew() {
  const L = useL();
  const lang = useLang();
  const hasData = useStore((s) => Object.keys(s.db.months).length > 0);
  const [entries, setEntries] = useState(() => {
    const unseen = unseenChanges(CURRENT.version, hasData);
    if (!unseen.length) markChangesSeen(CURRENT.version);
    return unseen;
  });
  if (!entries.length) return null;
  return (
    <div role="status" className="mx-4 mt-3 rounded-xl border border-line bg-surface2 px-4 py-3 text-sm lg:mx-8">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="shrink-0 text-accent" />
        <p className="me-auto font-semibold">{L('מה חדש', "What's new")}</p>
        <IconButton label={L('סגור', 'Close')} className="!h-7 !w-7" onClick={() => { markChangesSeen(CURRENT.version); setEntries([]); }}><X size={15} /></IconButton>
      </div>
      {entries.map((e) => (
        <div key={e.version} className="mt-1.5">
          {entries.length > 1 && <p className="text-[13px] font-medium text-muted"><bdi dir="ltr">{e.version}</bdi></p>}
          <ul className="list-disc space-y-1 ps-5 text-ink2">{linesOf(e, lang).map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
