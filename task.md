Here is the step-by-step architectural breakdown of how to implement **playing `adan.mp3` at Adhan time** and **running `ft_lock` when Iqama finishes**.

---

### Step 1: Asset Placement & Build Pipeline
You need to make sure `adan.mp3` is packaged and accessible at runtime alongside `mosque_pic.svg`:
1. **Source directory**: Keep `adan.mp3` in `src/adan.mp3` (and root).
2. **Build script ([`Makefile`](file:///home/ael-biss/Student_projects/vibecode/salat-gnome-extension/Makefile))**:
   - In `compile-esm`: copy `adan.mp3` to `dist/esm/`.
   - In `pack`: include `--extra-source=adan.mp3` so it gets bundled into the `.zip` release.
3. **Legacy transpiler ([`scripts/transpile-legacy.js`](file:///home/ael-biss/Student_projects/vibecode/salat-gnome-extension/scripts/transpile-legacy.js))**:
   - Non-`.js` files (like `.mp3`) in `dist/esm/` are copied automatically into `dist/legacy/`.

---

### Step 2: Locating the Audio File at Runtime
In GNOME Shell extensions, paths change whether running under modern ESM (`this.dir` / `this.path`) or legacy GJS (`ExtensionUtils.getCurrentExtension()`).

Create a helper function to resolve `adan.mp3`:
```typescript
private getAdhanAudioPath(): string | null {
    try {
        if (this.dir) {
            let file = this.dir.get_child('adan.mp3');
            if (file.query_exists(null)) return file.get_path();
        }
        if (this.path) {
            let p = GLib.build_filenamev([this.path, 'adan.mp3']);
            if (GLib.file_test(p, GLib.FileTest.EXISTS)) return p;
        }
    } catch (e) {
        log('[SalatExtension] Error finding adan.mp3: ' + e.message);
    }
    return null;
}
```

---

### Step 3: Audio Playback Mechanism
GNOME Shell runs the entire compositor UI thread. Audio playback must **never run synchronously** inside GNOME Shell's main loop.

Spawning a lightweight background process with `GLib.spawn_command_line_async` is the safest, non-blocking approach:

```typescript
private playAdhanSound(): void {
    const audioPath = this.getAdhanAudioPath();
    if (!audioPath) {
        log('[SalatExtension] Cannot play adhan: adan.mp3 not found.');
        return;
    }

    log('[SalatExtension] 📢 Triggering Adhan audio playback...');
    try {
        if (GLib.find_program_in_path('cvlc')) {
            // Headless VLC without GUI/video
            GLib.spawn_command_line_async(`cvlc --play-and-exit --no-video "${audioPath}"`);
        } else if (GLib.find_program_in_path('pw-play')) {
            GLib.spawn_command_line_async(`pw-play "${audioPath}"`);
        } else if (GLib.find_program_in_path('paplay')) {
            GLib.spawn_command_line_async(`paplay "${audioPath}"`);
        } else {
            // Universal fallback: GStreamer via background python one-liner
            const pyScript = `import gi, sys; gi.require_version('Gst', '1.0'); from gi.repository import Gst, GLib; Gst.init(None); p = Gst.ElementFactory.make('playbin', 'p'); p.set_property('uri', 'file://' + sys.argv[1]); p.set_state(Gst.State.PLAYING); loop = GLib.MainLoop(); b = p.get_bus(); b.add_watch(GLib.PRIORITY_DEFAULT, lambda bus, msg: loop.quit() if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR) else True); loop.run()`;
            GLib.spawn_command_line_async(`python3 -c "${pyScript}" "${audioPath}"`);
        }
    } catch (e) {
        log('[SalatExtension] Audio playback failed: ' + e.message);
    }
}
```

---

### Step 4: Shell Command Execution for `ft_lock`
When Iqama finishes, execute `ft_lock` asynchronously:

```typescript
private runFtLock(): void {
    log('[SalatExtension] 🔒 Iqama finished! Triggering ft_lock...');
    try {
        if (GLib.find_program_in_path('ft_lock')) {
            GLib.spawn_command_line_async('ft_lock');
        } else if (GLib.file_test('/usr/share/42/ft_lock', GLib.FileTest.IS_EXECUTABLE)) {
            GLib.spawn_command_line_async('/usr/share/42/ft_lock');
        } else if (GLib.file_test('/usr/local/bin/ft_lock', GLib.FileTest.IS_EXECUTABLE)) {
            GLib.spawn_command_line_async('/usr/local/bin/ft_lock');
        }
    } catch (e) {
        log('[SalatExtension] Error executing ft_lock: ' + e.message);
    }
}
```

---

### Step 5: Event Detection & State Tracking (Preventing Duplicates)
Because the extension's timer loop runs every second (`GLib.timeout_add_seconds`), you need a debounce mechanism to ensure events fire **only once** per prayer per day.

#### 1. State Map in `SalatExtension`:
```typescript
private triggeredAdhans: Record<string, boolean> = {};
private triggeredIqamas: Record<string, boolean> = {};
```

#### 2. Event Checking Function (`checkPrayerEvents`):
Called every second inside the existing 1-second timeout loop in [`src/extension.ts`](file:///home/ael-biss/Student_projects/vibecode/salat-gnome-extension/src/extension.ts):

```typescript
private checkPrayerEvents(now: Date): void {
    if (!this.prayerTimesData || !this.config) return;

    const prayers = Calculator.getPrayerEntries(
        this.prayerTimesData,
        this.config.iqamaDelays,
        this.config.lang,
        now
    );

    const datePrefix = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

    for (let p of prayers) {
        const adhanKey = `${datePrefix}_${p.key}_adhan`;
        const iqamaKey = `${datePrefix}_${p.key}_iqama`;

        // 1. Adhan Trigger: now >= adhanDate (within a 30s window to handle system lag/sleep)
        const adhanDiff = now.getTime() - p.adhanDate.getTime();
        if (adhanDiff >= 0 && !this.triggeredAdhans[adhanKey]) {
            this.triggeredAdhans[adhanKey] = true;
            if (adhanDiff <= 30000) { // Only fire if current time is within 30s of Adhan
                this.playAdhanSound();
            }
        }

        // 2. Iqama Finish Trigger: now >= iqamaDate
        const iqamaDiff = now.getTime() - p.iqamaDate.getTime();
        if (iqamaDiff >= 0 && !this.triggeredIqamas[iqamaKey]) {
            this.triggeredIqamas[iqamaKey] = true;
            if (iqamaDiff <= 30000) { // Only fire if current time is within 30s of Iqama finish
                this.runFtLock();
            }
        }
    }
}
```

---

### Summary of How the Flow Works
1. **Adhan arrives (`now == adhanDate`)**:
   - `checkPrayerEvents` detects `now >= p.adhanDate`.
   - Fires `playAdhanSound()` (invoking `cvlc` / `GStreamer` in the background).
   - Marks `${today}_${prayer}_adhan` as handled.
2. **Iqama countdown runs**:
   - Indicator text shows live countdown (`📢 Iqama (Dhuhr) in 14m 59s`).
3. **Iqama finishes (`now == iqamaDate`)**:
   - `checkPrayerEvents` detects `now >= p.iqamaDate`.
   - Fires `runFtLock()` (`/usr/local/bin/ft_lock` shell command).
   - Marks `${today}_${prayer}_iqama` as handled.
   - Indicator transitions to `NEXT_ADHAN` for the next prayer.
