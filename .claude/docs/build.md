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
