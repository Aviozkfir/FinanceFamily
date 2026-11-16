# deploy — packaging the app for Android

| Path | What it is | In git |
|---|---|---|
| `android/` | The Android project (Capacitor) that wraps the web app | yes |
| `scripts/` | Setup and build scripts | yes |
| `build-apk.bat` | Double-click to build | yes |
| `../.github/workflows/android-apk.yml` | GitHub action that builds and publishes the APK | yes |
| `.toolchain/` | Private copy of Java and the Android SDK | no |
| `out/` | The built `.apk` | no |

## Build

```
npm run apk:setup   # once: downloads Java 21 + Android SDK into deploy/.toolchain (~600 MB)
npm run apk         # every time: builds deploy/out/FinanceFamily-debug.apk
```

Copy the `.apk` to the phone and open it. Android will ask to allow installing from this source.

## Download from GitHub

Every push to `main` runs the **Android APK** action (`.github/workflows/android-apk.yml`), which
builds the app and replaces the files in the **Latest APK** release:

https://github.com/Aviozkfir/FinanceFamily/releases/tag/latest-apk

Open that page on the phone and download
`FinanceFamily.apk`. The action can also be started by hand from the repo's Actions tab.

Builds from this computer and from GitHub are signed with the same test key
(`android/app/debug.keystore`), so a new version installs over the old one and keeps the data.

## Versions

Every build has three numbers, worked out by `scripts/version.mjs`:

| Number | Where it comes from | What it is for |
|---|---|---|
| `version` (e.g. 1.1.0) | `package.json` | The name people see. Bump it when a change deserves a new name. |
| `build` | Time of the commit, in minutes since 1 Jan 2025 | Grows with every commit. The app offers an update when the published build is higher than its own. |
| `native` | Same, for the last commit that touched `deploy/android` or `capacitor.config.json` | Tells whether an update needs a new APK. |

To release a new version name:

```
npm version minor --no-git-tag-version   # or patch / major; edits package.json
# add an entry for the new version at the top of changelog.json (he and en lines)
git commit -am "Version 1.2.0" && git push
```

`changelog.json` is the one place that says what changed: the app shows the entry in the update
banner, once after updating, and in Settings, and the build copies it into the release notes.
The build fails if the version has no entry.

The action then also creates a permanent `v1.2.0` release with that APK. Pushes that do not change
the version still reach the phones as updates (same name, higher build).

Settings in the app shows the running version, build, commit and date.

## Updates on the phone

On start and whenever it comes back to the front, the app reads the notes of the **Latest APK**
release. If the published build is newer, a banner with an **Update** button appears.

- **Content update (the usual case):** the app downloads `bundle.zip`, unpacks it into its private
  storage and restarts into it within a few seconds. No Android prompts.
- **APK update (only when `native` grew):** the app downloads `FinanceFamily.apk` and opens the
  Android installer. Confirm, then tap Open. The first time, Android asks to allow installs from this app.
- **Safety net:** if freshly installed content does not start, the next launch returns to the
  content inside the APK and that build is not offered again automatically ("Check for updates" in
  Settings offers it again).

The app reads the release without signing in, so the repository must be public (GitHub → repo
Settings → General → Danger Zone → Change visibility). Nothing needs to be set up on the phones.

After upgrading Capacitor itself (`@capacitor/*` in `package.json`), also commit the changes
`npx cap sync android` makes under `deploy/android`, so phones get an APK rather than a content update.

## How the phone version differs

- There is no local server on the phone: data is stored on the device only.
- To move data from the computer: Settings → Download backup on the computer, then Restore from backup on the phone.
