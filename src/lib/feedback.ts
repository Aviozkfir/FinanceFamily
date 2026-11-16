// Feedback from inside the app. There is no server: the message goes to a form-forwarding
// service (Web3Forms), which emails it to the developer. Only what is listed in `send` leaves
// the device — never any financial data.
import { CURRENT, currentChannel } from './update';
import { isNative } from './platform';

/**
 * The public access key of the developer's Web3Forms form. It only allows sending to that form,
 * so it is safe in the code. While it is empty the feedback form is not shown.
 */
const ACCESS_KEY = '';

export const feedbackEnabled = () => ACCESS_KEY !== '';
export type FeedbackKind = 'bug' | 'idea' | 'other';

export async function sendFeedback(o: { kind: FeedbackKind; message: string; contact?: string; lang: string }): Promise<void> {
  const res = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      access_key: ACCESS_KEY,
      subject: `FinanceFamily ${o.kind}: ${o.message.slice(0, 60)}`,
      from_name: 'FinanceFamily app',
      kind: o.kind,
      message: o.message,
      contact: o.contact || '(not given)',
      version: `${CURRENT.version} (build ${CURRENT.build}, ${currentChannel()}, ${CURRENT.commit})`,
      device: `${isNative() ? 'Android app' : 'browser'} · ${o.lang} · ${navigator.userAgent}`,
    }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
  if (!res.ok || !body?.success) throw new Error(body?.message || `HTTP ${res.status}`);
}
