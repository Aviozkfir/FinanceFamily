// Builds the Android package:  npm run apk
// Result: deploy/out/FinanceFamily-debug.apk (copy it to the phone and open it to install).
import fs from 'node:fs';
import path from 'node:path';
import { androidDir, buildEnv, outDir, ready, run, sdkDir } from './toolchain.mjs';
import { gradleArgs } from './version.mjs';

if (!ready()) {
  console.error('Android build tools are not installed yet. Run this once first:\n\n  npm run apk:setup\n');
  process.exit(1);
}

const env = buildEnv();
run('npm', ['run', 'build'], { env });                 // 1. build the web app into dist/
run('npx', ['cap', 'sync', 'android'], { env });       // 2. copy it into the Android project
fs.writeFileSync(path.join(androidDir, 'local.properties'), `sdk.dir=${sdkDir.replace(/\\/g, '/')}\n`);
run(`"${path.join(androidDir, 'gradlew.bat')}"`, ['assembleDebug', '--console=plain', ...gradleArgs()], { cwd: androidDir, env }); // 3. package it

const built = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
fs.mkdirSync(outDir, { recursive: true });
const target = path.join(outDir, 'FinanceFamily-debug.apk');
fs.copyFileSync(built, target);
console.log(`\nDone: ${target}  (${(fs.statSync(target).size / 1048576).toFixed(1)} MB)`);
