# 🕌 Moroccan Salat & Iqama GNOME Extension

A clean, lightweight, and modular GNOME Shell extension for Moroccan prayer times and Iqama countdowns, built for **GNOME Shell 42.9** and powered officially by the Moroccan Ministry of Awqaf & Islamic Affairs (Habous API).

### 🌟 Features
- **Official Prayer Times**: Fetched live from the Moroccan Ministry of Awqaf & Islamic Affairs (Habous API).
- **Iqama Countdown**: Dynamic countdown until congregation prayer with customizable per-prayer delays.
- **Auto-Lock Screen**: Automatically invokes `ft_lock` when the Iqama countdown reaches zero.
- **Audio Adhan**: Plays `adan.mp3` asynchronously with desktop notification upon Adhan time.
- **Custom Panel Icon**: Features a clean SVG mosque icon (`mosque_pic.svg`) in the top panel.
- **Preferences UI**: GTK4 / Libadwaita preferences window to configure city, language, and Iqama delays.

---

## 🏗 Project Architecture

```
salat-gnome-extension/
├── Makefile             # Build, compile, install, check & package commands
├── tsconfig.json        # TypeScript compiler configuration
├── README.md            # Documentation
├── dist/legacy/         # Pre-compiled JavaScript extension files (for GNOME Shell 42.9)
├── adan.mp3             # Adhan audio asset
├── mosque_pic.svg     # Top panel status icon
└── src/                 # Extension TypeScript Source Directory
    ├── metadata.json    # Extension metadata (GNOME 42 / 42.9)
    ├── types.d.ts       # GJS & GNOME Shell ambient TypeScript definitions
    ├── constants.ts     # City list, default delays & icons
    ├── i18n.ts          # Internationalization (EN, AR, FR)
    ├── config.ts        # User config storage & file watching
    ├── api.ts           # Habous API network fetching
    ├── calculator.ts    # Prayer times & countdown calculations
    ├── ui.ts            # Panel text & interactive menu component
    ├── extension.ts     # Extension lifecycle entrypoint (init/enable/disable)
    └── prefs.ts         # GTK4 / Libadwaita Preferences window
```

---

## 🛠 Makefile Commands

| Command | Description |
| :--- | :--- |
| `make install` | Install extension for GNOME Shell 42.9 directly to `~/.local/share/gnome-shell/extensions/` |
| `make compile` | Compile TypeScript source code and build for GNOME Shell 42.9 |
| `make check` | Run JavaScript syntax check across all compiled modules |
| `make prefs` | Open extension Preferences Settings window directly |
| `make uninstall` | Disable and remove extension from system |
| `make pack` | Create `salat-timer@moroccan-habous.zip` bundle for GNOME Shell 42.9 |
| `make clean` | Remove `dist/` and `.zip` build artifacts |
| `make re` | Clean, compile, check, and reinstall extension |

---

## 🚀 Installation & Usage

1. **Install extension**:
   ```bash
   make install
   ```

2. **Reload GNOME Shell**:
   - **X11**: Press `Alt + F2`, type `r`, and hit `Enter` (or run `kill -HUP $(pgrep gnome-shell | xargs)`).

3. **Enable the extension explicitly**:
   ```bash
   gnome-extensions enable salat-timer@moroccan-habous
   ```

4. **Verify that it is running**:
   ```bash
   gnome-extensions info salat-timer@moroccan-habous
   ```

   The output should contain:
   ```text
   State: ENABLED
   ```

The prayer timer appears in the **top-right GNOME panel**. It does not create an icon on the desktop.

---

## 🔧 Troubleshooting: Installed but Not Visible

If reloading GNOME Shell does not make the timer appear, check whether it is enabled:

```bash
gsettings get org.gnome.shell enabled-extensions
```

The returned list must contain:

```text
salat-timer@moroccan-habous
```

If `gnome-extensions info` reports `State: INITIALIZED`, GNOME recognizes the extension but has not enabled it. Run:

```bash
gnome-extensions enable salat-timer@moroccan-habous
```
