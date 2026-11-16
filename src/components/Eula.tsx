import { Languages } from 'lucide-react';
import { useL, useLang, useStore } from '../lib/store';
import { eulaText } from '../lib/eula';
import { Button } from './ui';

/** The body of the terms; also shown in Settings. */
export function EulaBody() {
  const t = eulaText(useLang());
  return (
    <div className="space-y-3 text-sm">
      {t.sections.map(([title, body]) => <div key={title}><p className="font-semibold">{title}</p><p className="mt-0.5 text-ink2">{body}</p></div>)}
    </div>
  );
}

/** First launch: nothing else is reachable until the terms are accepted. */
export default function EulaGate({ onAccept }: { onAccept: () => void }) {
  const L = useL();
  const lang = useLang();
  const setSettings = useStore((s) => s.setSettings);
  const t = eulaText(lang);
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <button onClick={() => setSettings({ lang: lang === 'he' ? 'en' : 'he' })} className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-ink2 hover:bg-surface2">
          <Languages size={16} />{lang === 'he' ? 'English' : 'עברית'}
        </button>
      </div>
      <p className="mt-2 text-sm text-ink2">{t.intro}</p>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-line bg-surface p-4"><EulaBody /></div>
      <Button variant="primary" size="lg" className="mt-4 w-full" onClick={onAccept}>{L('קראתי ואני מסכים', 'I have read and agree')}</Button>
    </div>
  );
}
