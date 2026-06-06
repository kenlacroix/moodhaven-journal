# Cross-Platform Build Guide

## Prerequisites (all platforms)
- Node.js 18+ and npm
- Rust toolchain (rustup, cargo)

## Linux
```bash
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
# Optional hardware key support:
sudo apt install -y libudev-dev

npm install && npm run tauri build
# With hardware key: cd src-tauri && cargo build --release --features hardware-key
```
Output: `src-tauri/target/release/bundle/` (.AppImage + .deb)

## Windows
- Visual Studio Build Tools 2022 with "Desktop development with C++"
- WebView2 Runtime (pre-installed on Win 10/11)
```powershell
npm install && npm run tauri build
```
Output: .msi + .exe NSIS installer

## macOS
```bash
xcode-select --install
npm install && npm run tauri build
# Universal binary: npm run tauri build -- --target universal-apple-darwin
```
Output: .app bundle + .dmg

## iOS (requires macOS + Xcode)

### Prerequisites
- macOS 13+ with Xcode 15+
- Apple Developer account (free for Simulator; paid for device/TestFlight)
- Rust iOS targets:
```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
```

### First-time setup (run once per machine)
```bash
npm run tauri ios init
# Generates: src-tauri/gen/apple/ (Xcode project)
```

After `ios init`, open the generated project in Xcode and:
1. Set your team: Signing & Capabilities → Team → select your Apple Developer account
   (replaces the `REPLACE_WITH_APPLE_TEAM_ID` placeholder in `tauri.conf.json`)
2. Add capabilities in Xcode:
   - Background Modes → Background fetch + Background processing (for deferred sync)
   - Push Notifications (for reminders)
3. Info.plist usage descriptions (add manually or via Xcode):
   - `NSUserNotificationsUsageDescription` — "Receive journaling reminders"
   - `NSFaceIDUsageDescription` — "Unlock MoodHaven with Face ID" (Phase 5)
   - `NSMicrophoneUsageDescription` — "Record voice journal entries" (Phase 5 STT)

### Build and run
```bash
npm run tauri ios dev       # hot-reload to Simulator or connected device
npm run tauri ios build     # production .ipa
```
Output: `src-tauri/gen/apple/` (Xcode project + build artifacts)

### Notes
- `bundle.iOS.developmentTeam` in `tauri.conf.json` must match your Apple Team ID
- STT (whisper.cpp sidecar) is **not available** on iOS — sidecar processes are blocked by the App Sandbox. The mic button is hidden on iOS via `usePlatform().isIOS`.
- Peer sync (mDNS) is unreliable in iOS foreground — peer sync UI is hidden on iOS.
- The writer breakout window is desktop-only — hidden on iOS.

## Troubleshooting
| Issue | Solution |
|-------|----------|
| Rust compilation errors | `rustup update` |
| WebKit not found (Linux) | Install `libwebkit2gtk-4.1-dev` |
| `libudev` not found (Linux) | Install `libudev-dev` OR build without `--features hardware-key` |
| Code signing failed | Check cert/key paths |

## Release Checklist
- [ ] Version bumped: `package.json`, `Cargo.toml`, `tauri.conf.json`
- [ ] `npm run typecheck` passes
- [ ] `cargo check` passes
- [ ] `npm audit` + `cargo audit` clean
- [ ] Linux: AppImage works on Ubuntu 22.04+
- [ ] Windows: MSI installs on 10/11
- [ ] macOS: DMG installs on 10.15+
- [ ] GitHub release created with changelog
