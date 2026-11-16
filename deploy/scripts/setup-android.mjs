// One-time setup: downloads a private copy of the Android build tools into deploy/.toolchain.
//   npm run apk:setup          asks before downloading
//   npm run apk:setup -- --yes skips the question
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { buildEnv, jdkDir, ready, run, sdkDir, toolchain } from './toolchain.mjs';

const JDK_URL = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse';
const TOOLS_URL = 'https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip';
const PACKAGES = ['platform-tools', 'platforms;android-36', 'build-tools;35.0.0'];
const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');

if (process.platform !== 'win32') { console.error('This setup script is written for Windows.'); process.exit(1); }
if (ready()) { console.log('Android build tools are already installed in deploy/.toolchain.'); process.exit(0); }

console.log(`This will download into ${toolchain}:
  - Java 21 (Eclipse Temurin, from adoptium.net)            ~205 MB
  - Android command-line tools (from dl.google.com)          ~150 MB
  - Android platform 36, build-tools and platform-tools      ~250 MB
Installing the Android packages means accepting Google's Android SDK license:
  https://developer.android.com/studio/terms`);
if (!process.argv.includes('--yes')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nDownload and accept the license? (y/N) ');
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) { console.log('Cancelled.'); process.exit(1); }
}

async function download(url, file) {
  console.log(`\nDownloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
}
// -m: skip restoring file times, which fails on drives formatted as exFAT.
function unzip(file, into) {
  fs.mkdirSync(into, { recursive: true });
  const res = spawnSync(tar, ['-xmf', file, '-C', into], { stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`Could not extract ${file}`);
}

fs.mkdirSync(toolchain, { recursive: true });

if (!fs.existsSync(path.join(jdkDir, 'bin', 'java.exe'))) {
  const zip = path.join(toolchain, 'jdk.zip');
  const tmp = path.join(toolchain, 'jdk-tmp');
  await download(JDK_URL, zip);
  fs.rmSync(tmp, { recursive: true, force: true });
  unzip(zip, tmp);
  // The archive holds a single versioned folder, e.g. jdk-21.0.x+y
  fs.rmSync(jdkDir, { recursive: true, force: true });
  fs.renameSync(path.join(tmp, fs.readdirSync(tmp)[0]), jdkDir);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(zip);
}

const sdkmanager = path.join(sdkDir, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
if (!fs.existsSync(sdkmanager)) {
  const zip = path.join(toolchain, 'cmdline-tools.zip');
  const tmp = path.join(toolchain, 'tools-tmp');
  await download(TOOLS_URL, zip);
  fs.rmSync(tmp, { recursive: true, force: true });
  unzip(zip, tmp);
  fs.mkdirSync(path.join(sdkDir, 'cmdline-tools'), { recursive: true });
  fs.renameSync(path.join(tmp, 'cmdline-tools'), path.join(sdkDir, 'cmdline-tools', 'latest'));
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(zip);
}

// The question above is the consent; "y" answers sdkmanager's license prompts.
const yes = 'y\n'.repeat(40);
const env = buildEnv();
for (const args of [['--licenses'], PACKAGES.map((p) => `"${p}"`)]) {
  console.log(`\n> sdkmanager ${args.join(' ')}`);
  const res = spawnSync(`"${sdkmanager}"`, [`--sdk_root="${sdkDir}"`, ...args], { input: yes, stdio: ['pipe', 'inherit', 'inherit'], shell: true, env });
  if (res.status !== 0) { console.error('sdkmanager failed.'); process.exit(res.status ?? 1); }
}

console.log('\nAndroid build tools are ready. Build the app with:  npm run apk');
void run;
