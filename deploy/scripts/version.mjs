// The version of a build, worked out from package.json and git. Used by the web build
// (vite.config.ts), the Android build, and the GitHub action, so all three agree.
//
//   version  the human version from package.json, e.g. "1.1.0". Bump it with `npm version minor`.
//   build    a number that grows with every commit (minutes from 1 Jan 2025 to the commit's time).
//            The app offers an update when the published build is higher than its own.
//   native   the same kind of number for the last commit that changed the Android wrapper.
//            When it is higher than the installed app's, the update needs a new APK;
//            otherwise the app only swaps its web content.
//
//   channel  'stable' for a build of main, 'dev' for a build of any other branch (APP_CHANNEL,
//            set by the GitHub action). Phones follow stable unless developer versions are
//            switched on in Settings.
//   notes    what changed in this version, from changelog.json at the repo root (he / en lines).
//            It travels in the release notes, so an app can show it before updating.
//
//   node deploy/scripts/version.mjs            prints the values as JSON
//   node deploy/scripts/version.mjs --github   prints key=value lines for $GITHUB_OUTPUT;
//                                              fails when the version has no changelog entry
//   node deploy/scripts/version.mjs --notes    prints the changelog entry as release-note text
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EPOCH = Date.UTC(2025, 0, 1) / 1000;
/** Paths whose changes need a new APK rather than a content update. */
const NATIVE_PATHS = ['deploy/android', 'capacitor.config.json'];

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}
const stamp = (seconds) => (seconds ? Math.max(1, Math.floor((Number(seconds) - EPOCH) / 60)) : 0);

export function getVersion() {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const time = git('log', '-1', '--format=%ct');
  return {
    version,
    build: stamp(time),
    native: stamp(git('log', '-1', '--format=%ct', '--', ...NATIVE_PATHS)),
    commit: git('rev-parse', '--short', 'HEAD'),
    channel: process.env.APP_CHANNEL === 'stable' ? 'stable' : 'dev',
    date: time ? new Date(Number(time) * 1000).toISOString() : '',
  };
}

/** The changelog entry of the current version: { he: string[], en: string[] }, or null. */
export function getNotes() {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const entry = JSON.parse(fs.readFileSync(path.join(root, 'changelog.json'), 'utf8')).find((e) => e.version === version);
  return entry?.he?.length && entry?.en?.length ? { he: entry.he, en: entry.en } : null;
}

/** Flags that hand the version to Gradle. */
export const gradleArgs = (v = getVersion()) => [`-PappVersionName=${v.version}`, `-PappVersionCode=${v.build || 1}`, `-PnativeLevel=${v.native}`];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const v = getVersion();
  const notes = getNotes();
  if (process.argv.includes('--notes') || process.argv.includes('--github')) {
    if (!notes) {
      console.error(`changelog.json has no entry for version ${v.version}. Add one (he and en lines) before releasing.`);
      process.exit(1);
    }
  }
  if (process.argv.includes('--notes')) {
    console.log([...notes.en.map((l) => `- ${l}`), '', ...notes.he.map((l) => `- ${l}`)].join('\n'));
  } else if (process.argv.includes('--github')) {
    console.log(Object.entries({ ...v, json: JSON.stringify({ ...v, notes }), gradle: gradleArgs(v).join(' ') }).map(([k, val]) => `${k}=${val}`).join('\n'));
  } else console.log(JSON.stringify({ ...v, notes }, null, 2));
}
