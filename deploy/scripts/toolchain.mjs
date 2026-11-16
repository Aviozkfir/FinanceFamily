// Where the Android build tools live. Everything stays inside deploy/.toolchain (not in git).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const deployDir = path.join(root, 'deploy');
export const toolchain = path.join(deployDir, '.toolchain');
export const jdkDir = path.join(toolchain, 'jdk');
export const sdkDir = path.join(toolchain, 'android-sdk');
export const gradleHome = path.join(toolchain, 'gradle-home');
export const androidDir = path.join(deployDir, 'android');
export const outDir = path.join(deployDir, 'out');

export const ready = () =>
  fs.existsSync(path.join(jdkDir, 'bin', 'java.exe')) && fs.existsSync(path.join(sdkDir, 'platforms'));

export const buildEnv = () => ({
  ...process.env,
  JAVA_HOME: jdkDir,
  ANDROID_HOME: sdkDir,
  ANDROID_SDK_ROOT: sdkDir,
  GRADLE_USER_HOME: gradleHome,
  PATH: `${path.join(jdkDir, 'bin')}${path.delimiter}${process.env.PATH}`,
});

/** Runs a command, streaming its output; exits the script if it fails. */
export function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: root, ...opts });
  if (res.status !== 0) {
    console.error(`\nFailed: ${cmd} (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
}
