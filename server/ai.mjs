// AI providers for the finance assistant.
//  - "claude-code": uses the Claude Code CLI already signed in on this machine (no API key).
//  - "api":         uses the Anthropic API through the official SDK.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { INSTRUCTIONS, buildSystem, DEFAULT_API_MODEL } from '../shared/ai-prompt.mjs';

export { DEFAULT_API_MODEL };

let cliCache = null;
export function cliStatus() {
  if (cliCache) return Promise.resolve(cliCache);
  return new Promise((resolve) => {
    execFile('claude', ['--version'], { timeout: 8000, windowsHide: true }, (err, stdout) => {
      cliCache = err ? { available: false } : { available: true, version: String(stdout).trim() };
      if (err) setTimeout(() => (cliCache = null), 30_000);
      resolve(cliCache);
    });
  });
}

/**
 * Streams an answer. `emit(text)` receives text deltas.
 * @param {{provider:'claude-code'|'api', context:string, lang:string, messages:{role:'user'|'assistant',content:string}[], model?:string, apiKey?:string, signal:AbortSignal}} opts
 */
export async function streamAnswer(opts, emit) {
  if (opts.provider === 'claude-code') return viaClaudeCode(opts, emit);
  return viaApi(opts, emit);
}

// ---------- Claude Code (existing login) ----------
function viaClaudeCode({ context, lang, messages, model, signal }, emit) {
  return new Promise((resolve, reject) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-ai-'));
    const args = [
      '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--system-prompt', INSTRUCTIONS.replace(/\r?\n/g, ' '),
      '--tools', '', '--strict-mcp-config', '--disable-slash-commands',
      '--no-session-persistence', '--setting-sources', '',
    ];
    if (model) args.push('--model', model);
    const child = spawn('claude', args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });

    const history = messages.slice(0, -1);
    const last = messages[messages.length - 1];
    const prompt = [
      `<language>${lang === 'en' ? 'en' : 'he'}</language>`,
      `<data>\n${context}\n</data>`,
      history.length
        ? `<conversation_so_far>\n${history.map((m) => `[${m.role}]\n${m.content}`).join('\n\n')}\n</conversation_so_far>`
        : '',
      `Respond to this message from the user:\n${last.content}`,
    ].filter(Boolean).join('\n\n');
    child.stdin.end(prompt, 'utf8');

    let buf = '', streamed = false, stderr = '', settled = false;
    const cleanup = () => fs.rm(cwd, { recursive: true, force: true }, () => {});
    const finish = (err) => { if (settled) return; settled = true; cleanup(); err ? reject(err) : resolve(); };
    const onAbort = () => { child.kill(); finish(); };
    signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
          streamed = true;
          emit(ev.event.delta.text);
        } else if (ev.type === 'result') {
          if (ev.is_error) return finish(new Error(ev.result || 'Claude Code returned an error'));
          if (!streamed && ev.result) emit(ev.result);
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => finish(new Error(e.code === 'ENOENT' ? 'CLI_NOT_FOUND' : e.message)));
    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort);
      if (code && !streamed) return finish(new Error(stderr.trim().slice(0, 500) || `claude exited with code ${code}`));
      finish();
    });
  });
}

// ---------- Anthropic API ----------
async function viaApi({ context, lang, messages, model, apiKey, signal }, emit) {
  // With no explicit key the SDK resolves ANTHROPIC_API_KEY / an `ant auth login` profile.
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: model || DEFAULT_API_MODEL,
      max_tokens: 32000,
      output_config: { effort: 'medium' },
      // If a safety classifier declines, let the API retry on its default fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: buildSystem(context, lang), cache_control: { type: 'ephemeral' } }],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }, { signal });
    stream.on('text', (delta) => emit(delta));
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new Error('REFUSED');
    if (final.stop_reason === 'max_tokens') emit('\n\n…');
  } catch (err) {
    if (signal.aborted) return;
    if (err instanceof Anthropic.AuthenticationError) throw new Error('BAD_API_KEY');
    if (err instanceof Anthropic.RateLimitError) throw new Error('RATE_LIMITED');
    if (err instanceof Anthropic.APIError) throw new Error(`API ${err.status ?? ''}: ${err.message}`);
    if (/apiKey|authToken|credentials/i.test(String(err?.message))) throw new Error('NO_API_KEY');
    throw err;
  }
}
