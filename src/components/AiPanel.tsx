import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, RefreshCw, Sparkles, Square, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AiState, ChatMsg } from '../lib/types';
import { aiErrorText, askAi, fetchAiStatus, type AiStatus } from '../lib/ai';
import { useL, useLang, useStore } from '../lib/store';
import { isNative } from '../lib/platform';
import { Button, Card, IconButton, Pill, cx } from './ui';

export function AiText({ text }: { text: string }) {
  return (
    <div className="prose-ai text-[14.5px] leading-relaxed" dir="auto">
      <Markdown remarkPlugins={[remarkGfm]} components={{ table: (p) => <div className="table-wrap"><table {...p} /></div> }}>{text}</Markdown>
    </div>
  );
}

const Typing = () => <span className="typing inline-flex gap-1 text-muted" aria-label="…"><span>●</span><span>●</span><span>●</span></span>;

interface Props {
  /** JSON data the assistant answers from. */
  context: string;
  ai: AiState;
  onChange: (fn: (ai: AiState) => AiState) => void;
  summaryPrompt: string;
  suggestions: string[];
  disabledReason?: string;
}

export function AiPanel({ context, ai, onChange, summaryPrompt, suggestions, disabledReason }: Props) {
  const L = useL();
  const lang = useLang();
  const db = useStore((s) => s.db);
  const [status, setStatus] = useState<AiStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState<'summary' | 'chat' | null>(null);
  const [live, setLive] = useState('');
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchAiStatus().then(setStatus); }, []);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { if (busy === 'chat') endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [live, busy]);

  const provider = db.settings.aiProvider;
  const usingCli = !isNative() && (provider === 'claude-code' || (provider === 'auto' && status?.cli));
  const available = status && (usingCli ? status.cli : status.hasApiKey);

  async function run(kind: 'summary' | 'chat', messages: ChatMsg[]) {
    setBusy(kind); setLive(''); setError('');
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const full = await askAi({ context, messages, db, signal: abort.signal }, setLive);
      if (full) {
        if (kind === 'summary') onChange((a) => ({ ...a, summary: full, summaryAt: new Date().toISOString() }));
        else onChange((a) => ({ ...a, chat: [...messages, { role: 'assistant', content: full }] }));
      }
    } catch (e) {
      setError(aiErrorText(e instanceof Error ? e.message : String(e), lang));
    } finally {
      setBusy(null); setLive('');
    }
  }

  function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    // The summary is part of the conversation, so follow-up questions can refer to it.
    const history: ChatMsg[] = ai.chat.length || !ai.summary ? ai.chat : [{ role: 'user', content: summaryPrompt }, { role: 'assistant', content: ai.summary }];
    const messages: ChatMsg[] = [...history, { role: 'user', content: q }];
    onChange((a) => ({ ...a, chat: messages }));
    run('chat', messages);
  }

  const visibleChat = ai.chat.filter((m, i) => !(i < 2 && ai.summary && (m.content === summaryPrompt || m.content === ai.summary)));

  return (
    <Card className="overflow-hidden !p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-accent-soft/40 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><Sparkles size={18} /></span>
          <div>
            <h3 className="font-semibold">{L('העוזר שלך · Claude', 'Your assistant · Claude')}</h3>
            <p className="text-[13px] text-muted">{L('סיכום, תובנות ושאלות — על בסיס הנתונים שמילאת', 'Summary, insights and questions — grounded in your data')}</p>
          </div>
        </div>
        {status === undefined ? null : available
          ? <Pill tone="good">● {usingCli ? L('מחובר דרך Claude Code', 'Connected via Claude Code') : L('מחובר עם מפתח API', 'Connected with API key')}</Pill>
          : <Link to="/settings"><Pill tone="warn">{L('נדרש חיבור — להגדרות', 'Connection needed — Settings')}</Pill></Link>}
      </div>

      <div className="space-y-5 p-5">
        {disabledReason ? (
          <p className="text-sm text-muted">{disabledReason}</p>
        ) : (
          <>
            {/* Summary */}
            {busy === 'summary' ? (
              live ? <AiText text={live} /> : <p className="flex items-center gap-2 text-sm text-muted"><Typing /> {L('Claude קורא את הנתונים…', 'Claude is reading your data…')}</p>
            ) : ai.summary ? (
              <div>
                <AiText text={ai.summary} />
                <div className="mt-3 flex items-center gap-1">
                  <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => run('summary', [{ role: 'user', content: summaryPrompt }])} disabled={!!busy}>
                    {L('נתח מחדש', 'Analyze again')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink2">{L('קבל סיכום חכם: מה בלט, איפה אפשר להשתפר ומה כדאי לצמצם.', 'Get a smart summary: what stood out, where to improve and what to cut.')}</p>
                <Button variant="primary" icon={<Sparkles size={16} />} onClick={() => run('summary', [{ role: 'user', content: summaryPrompt }])} disabled={!!busy}>
                  {L('צור סיכום ותובנות', 'Generate summary & insights')}
                </Button>
              </div>
            )}

            {/* Chat */}
            {(visibleChat.length > 0 || busy === 'chat') && (
              <div className="space-y-3 border-t border-line pt-5">
                {visibleChat.map((m, i) => (
                  <div key={i} className={cx('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}>
                    <div className={cx('max-w-[92%] rounded-2xl px-4 py-2.5', m.role === 'user' ? 'bg-ink text-page' : 'border border-line bg-surface2')}>
                      {m.role === 'user' ? <p className="whitespace-pre-wrap text-sm" dir="auto">{m.content}</p> : <AiText text={m.content} />}
                    </div>
                  </div>
                ))}
                {busy === 'chat' && (
                  <div className="flex justify-end">
                    <div className="max-w-[92%] rounded-2xl border border-line bg-surface2 px-4 py-2.5">{live ? <AiText text={live} /> : <Typing />}</div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}

            {error && <p role="alert" className="rounded-xl border border-line bg-surface2 px-4 py-3 text-sm text-bad">{error}</p>}

            <div className="space-y-2.5">
              {!busy && visibleChat.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-surface2 px-3 py-1.5 text-[13px] text-ink2 transition-colors hover:border-accent hover:text-ink">{s}</button>
                  ))}
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2 rounded-2xl border border-line bg-surface2 p-1.5 focus-within:border-accent">
                <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} dir="auto"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  placeholder={L('שאל כל דבר על הניתוח…', 'Ask anything about this analysis…')}
                  className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-3 py-1.5 text-sm placeholder:text-muted focus:outline-none" />
                {visibleChat.length > 0 && !busy && (
                  <IconButton type="button" label={L('נקה שיחה', 'Clear chat')} onClick={() => onChange((a) => ({ ...a, chat: [] }))}><Trash2 size={16} /></IconButton>
                )}
                {busy
                  ? <IconButton type="button" label={L('עצור', 'Stop')} onClick={() => abortRef.current?.abort()} className="!bg-surface3 !text-ink"><Square size={14} /></IconButton>
                  : <IconButton type="submit" label={L('שלח', 'Send')} disabled={!input.trim()} className="!bg-ink !text-page"><ArrowUp size={17} /></IconButton>}
              </form>
              <p className="text-xs text-muted">{L('הנתונים של החודש נשלחים ל-Claude רק כשאתה מבקש סיכום או שואל שאלה.', 'Your data is sent to Claude only when you ask for a summary or a question.')}</p>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
