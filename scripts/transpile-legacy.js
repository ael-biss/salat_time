const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, '..', '.build-tmp');
const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

console.log(' 🔄 Transpiling to GNOME 42.9 format in dist/...');

// Helper to convert ESM code to Legacy GJS format
function transpileModule(filename, code) {
    // 1. Special handling for extension.js
    if (filename === 'extension.js') {
        return transpileExtensionFile(code);
    }

    // 2. Special handling for prefs.js
    if (filename === 'prefs.js') {
        return transpilePrefsFile(code);
    }

    let output = code;

    // Remove reference comments if any
    output = output.replace(/^\s*\/\/\/ <reference path=.*\/>[\r\n]*/gm, '');

    // Transpile imports
    output = output.replace(/^\s*import\s+(\w+)\s+from\s+['"]gi:\/\/(\w+)(?:\?version=.*)?['"];?/gm, 'var $1 = imports.gi.$2;');
    output = output.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]resource:\/\/\/org\/gnome\/shell\/ui\/(\w+)\.js['"];?/gm, 'var $1 = imports.ui.$2;');
    output = output.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]resource:\/\/\/org\/gnome\/Shell\/Extensions\/js\/(\w+)\.js['"];?/gm, 'var $1 = imports.misc.$2;');

    // Local module imports: import * as Foo from './foo.js';
    output = output.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]\.\/(\w+)\.js['"];?/gm, (match, varName, modName) => {
        return `var ${varName} = imports.misc.extensionUtils.getCurrentExtension().imports.${modName};`;
    });

    // Remove standard import of Extension / ExtensionPreferences base classes
    output = output.replace(/^\s*import\s+\{\s*(?:Extension|ExtensionPreferences)\s*\}\s+from\s+['"].*['"];?/gm, '');

    // Convert exports to top-level declarations
    output = output.replace(/export\s+const\s+/g, 'var ');
    output = output.replace(/export\s+let\s+/g, 'var ');
    output = output.replace(/export\s+function\s+/g, 'function ');
    output = output.replace(/export\s+class\s+/g, 'var ');

    return output;
}

function transpileExtensionFile(code) {
    // Check if code contains class SalatExtension
    if (code.includes('class SalatExtension')) {
        let legacyCode = `var { St, Clutter, GLib, Gio } = imports.gi;
var Main = imports.ui.main;
var PanelMenu = imports.ui.panelMenu;
var ExtensionUtils = imports.misc.extensionUtils;

let indicator = null;
let timeoutId = 0;
let httpSession = null;
let config = null;
let configMonitor = null;
let prayerTimesData = null;
let triggeredAdhans = {};
let triggeredIqamas = {};
let triggeredFridayReminders = {};
let triggeredWuduReminders = {};
let wuduDone = false;
let lastWuduPrayerKey = '';

function _getModules() {
    const Me = ExtensionUtils.getCurrentExtension();
    return {
        Constants: Me.imports.constants,
        Config: Me.imports.config,
        Api: Me.imports.api,
        UI: Me.imports.ui,
        I18n: Me.imports.i18n,
        Calculator: Me.imports.calculator
    };
}

function destroyOldStatusAreaRole() {
    try {
        if (Main.panel.statusArea['salat-indicator']) {
            log('[SalatExtension Legacy] Cleaning up pre-existing salat-indicator statusArea entry...');
            Main.panel.statusArea['salat-indicator'].destroy();
        }
    } catch (e) {
        log('[SalatExtension Legacy] Note on statusArea cleanup: ' + e.message);
    }
}

function reloadAndSyncUI() {
    try {
        log('[SalatExtension Legacy] Syncing UI...');
        const { Constants, Config, UI } = _getModules();
        if (!config) return;
        UI.updatePanelText(indicator, prayerTimesData, config.iqamaDelays, config.lang, wuduDone);
        UI.rebuildMenu(indicator, config, prayerTimesData, {
            onSelectCity: (city) => {
                log('[SalatExtension Legacy] City selected: ' + city.name);
                if (config) {
                    config.city = city;
                    Config.saveConfig(config);
                }
                recreatePanelIndicator();
            },
            onSelectLang: (langCode) => {
                log('[SalatExtension Legacy] Language selected: ' + langCode);
                if (config) {
                    config.lang = langCode;
                    Config.saveConfig(config);
                }
                recreatePanelIndicator();
            },
            onSetIqamaDelay: (prayerKey, minutes) => {
                log('[SalatExtension Legacy] Delay set for ' + prayerKey + ': +' + minutes + 'm');
                if (config) {
                    config.iqamaDelays[prayerKey] = minutes;
                    Config.saveConfig(config);
                }
                recreatePanelIndicator();
            },
            onResetIqamaDefaults: () => {
                log('[SalatExtension Legacy] Iqama delays reset to defaults.');
                if (config) {
                    config.iqamaDelays = Object.assign({}, Constants.DEFAULT_IQAMA_DELAYS);
                    Config.saveConfig(config);
                }
                recreatePanelIndicator();
            },
            onToggleLock: (enabled) => {
                log('[SalatExtension Legacy] Lock toggled: ' + enabled);
                if (config) {
                    config.lockEnabled = enabled;
                    Config.saveConfig(config);
                }
            },
            onQuickWudu: () => {
                toggleQuickWudu();
            },
            onOpenScheduleWindow: () => {
                openScheduleWindow();
            }
        }, wuduDone);
        log('[SalatExtension Legacy] UI sync completed successfully.');
    } catch (e) {
        log('[SalatExtension Legacy] Error in reloadAndSyncUI: ' + e.message + '\\n' + e.stack);
    }
}

function refreshPrayerTimes() {
    const { Api } = _getModules();
    if (!httpSession || !config) {
        log('[SalatExtension Legacy] Cannot refresh prayer times: httpSession or config missing.');
        return;
    }
    log('[SalatExtension Legacy] Refreshing prayer times for city ID ' + config.city.id + ' (' + config.city.name + ')...');
    Api.fetchPrayerTimes(
        httpSession,
        config.city.id,
        (data) => {
            log('[SalatExtension Legacy] Received prayer times data successfully.');
            prayerTimesData = data;
            reloadAndSyncUI();
        },
        (err) => {
            log('[SalatExtension Legacy] Failed to fetch prayer times: ' + err.message);
        }
    );
}

function getIconFile() {
    try {
        const Me = ExtensionUtils.getCurrentExtension();
        if (Me && Me.dir) {
            let file = Me.dir.get_child('mosque_pic.svg');
            if (file.query_exists(null)) return file;
        }
        if (Me && Me.path) {
            let path = GLib.build_filenamev([Me.path, 'mosque_pic.svg']);
            let file = Gio.File.new_for_path(path);
            if (file.query_exists(null)) return file;
        }
        let curFile = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_current_dir(), 'mosque_pic.svg']));
        if (curFile.query_exists(null)) return curFile;
    } catch (e) {
        log('[SalatExtension Legacy] Error locating mosque_pic.svg: ' + e.message);
    }
    return null;
}

function getAdhanAudioPath() {
    try {
        if (config && config.adhanAudioPath && config.adhanAudioPath.trim().length > 0) {
            let customPath = config.adhanAudioPath.trim();
            if (customPath.startsWith('~')) {
                customPath = GLib.get_home_dir() + customPath.slice(1);
            }
            if (GLib.file_test(customPath, GLib.FileTest.EXISTS)) {
                return customPath;
            } else {
                log('[SalatExtension Legacy] Custom adhan path not found: ' + customPath + ', falling back to bundled audio.');
            }
        }

        const Me = ExtensionUtils.getCurrentExtension();
        if (Me && Me.dir) {
            let file = Me.dir.get_child('adan.mp3');
            if (file.query_exists(null)) return file.get_path();
        }
        if (Me && Me.path) {
            let p = GLib.build_filenamev([Me.path, 'adan.mp3']);
            if (GLib.file_test(p, GLib.FileTest.EXISTS)) return p;
        }
        let cur = GLib.build_filenamev([GLib.get_current_dir(), 'adan.mp3']);
        if (GLib.file_test(cur, GLib.FileTest.EXISTS)) return cur;
    } catch (e) {
        log('[SalatExtension Legacy] Error finding adan.mp3: ' + e.message);
    }
    return null;
}

function playAdhanSound() {
    const audioPath = getAdhanAudioPath();
    if (!audioPath) {
        log('[SalatExtension Legacy] Cannot play adhan: audio file not found.');
        return;
    }

    log('[SalatExtension Legacy] 📢 Triggering Adhan audio playback: ' + audioPath);
    try {
        GLib.spawn_command_line_async('notify-send "Salat Timer" "📢 Adhan time!"');
        if (GLib.find_program_in_path('cvlc')) {
            GLib.spawn_command_line_async('cvlc --play-and-exit --no-video "' + audioPath + '"');
        } else if (GLib.find_program_in_path('pw-play')) {
            GLib.spawn_command_line_async('pw-play "' + audioPath + '"');
        } else if (GLib.find_program_in_path('paplay')) {
            GLib.spawn_command_line_async('paplay "' + audioPath + '"');
        } else {
            const pyScript = 'import gi, sys; gi.require_version("Gst", "1.0"); from gi.repository import Gst, GLib; Gst.init(None); p = Gst.ElementFactory.make("playbin", "p"); p.set_property("uri", "file://" + sys.argv[1]); p.set_state(Gst.State.PLAYING); loop = GLib.MainLoop(); b = p.get_bus(); b.add_watch(GLib.PRIORITY_DEFAULT, lambda bus, msg: loop.quit() if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR) else True); loop.run()';
            GLib.spawn_command_line_async('python3 -c "' + pyScript + '" "' + audioPath + '"');
        }
    } catch (e) {
        log('[SalatExtension Legacy] Audio playback failed: ' + e.message);
    }
}

function runFtLock() {
    if (!config || !config.lockEnabled) {
        log('[SalatExtension Legacy] Lock feature disabled in settings. Skipping lock.');
        return;
    }
    log('[SalatExtension Legacy] 🔒 Iqama finished! Triggering screen lock...');
    try {
        GLib.spawn_command_line_async('notify-send -u critical "Salat Timer" "🔒 Iqama finished! Locking screen..."');

        if (config.customLockCommand && config.customLockCommand.trim().length > 0) {
            GLib.spawn_command_line_async(config.customLockCommand.trim());
            return;
        }

        if (GLib.find_program_in_path('ft_lock')) {
            GLib.spawn_command_line_async('ft_lock');
        } else if (GLib.file_test('/usr/share/42/ft_lock', GLib.FileTest.IS_EXECUTABLE)) {
            GLib.spawn_command_line_async('/usr/share/42/ft_lock');
        } else if (GLib.file_test('/usr/local/bin/ft_lock', GLib.FileTest.IS_EXECUTABLE)) {
            GLib.spawn_command_line_async('/usr/local/bin/ft_lock');
        } else {
            log('[SalatExtension Legacy] ft_lock executable not found on system.');
        }
    } catch (e) {
        log('[SalatExtension Legacy] Error executing lock: ' + e.message);
    }
}

function checkPrayerEvents(now) {
    if (!prayerTimesData || !config) return;
    const { Calculator } = _getModules();

    const prayers = Calculator.getPrayerEntries(
        prayerTimesData,
        config.iqamaDelays,
        config.lang,
        now
    );

    const active = Calculator.findActivePrayer(prayers, config.iqamaDelays, now);
    if (active && wuduDone && lastWuduPrayerKey && active.prayer.key !== lastWuduPrayerKey) {
        log('[SalatExtension Legacy] Prayer cycle transitioned (' + lastWuduPrayerKey + ' -> ' + active.prayer.key + '). Resetting Wudu mark.');
        wuduDone = false;
        lastWuduPrayerKey = '';
        reloadAndSyncUI();
    }

    const datePrefix = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();

    for (let p of prayers) {
        const adhanKey = datePrefix + '_' + p.key + '_adhan';
        const iqamaKey = datePrefix + '_' + p.key + '_iqama';
        const wuduKey = datePrefix + '_' + p.key + '_wudu';

        if (config.wuduReminderEnabled !== false) {
            const wuduMins = config.wuduReminderMinutes !== undefined ? config.wuduReminderMinutes : 15;
            const wuduTime = new Date(p.adhanDate.getTime() - wuduMins * 60000);
            const wuduDiff = now.getTime() - wuduTime.getTime();

            if (wuduDiff >= 0 && !triggeredWuduReminders[wuduKey]) {
                triggeredWuduReminders[wuduKey] = true;
                if (wuduDiff <= 60000) {
                    triggerWuduReminder(p.name, wuduMins);
                }
            }
        }

        const adhanDiff = now.getTime() - p.adhanDate.getTime();
        if (adhanDiff >= 0 && !triggeredAdhans[adhanKey]) {
            triggeredAdhans[adhanKey] = true;
            if (adhanDiff <= 30000) {
                playAdhanSound();

                if (config.duaaAfterAdhan !== false) {
                    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 15, () => {
                        showDuaaAfterAdhan();
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }
        }

        const iqamaDiff = now.getTime() - p.iqamaDate.getTime();
        if (iqamaDiff >= 0 && !triggeredIqamas[iqamaKey]) {
            triggeredIqamas[iqamaKey] = true;
            if (iqamaDiff <= 30000) {
                if (config.lockEnabled) {
                    runFtLock();
                } else {
                    try {
                        GLib.spawn_command_line_async('notify-send "Salat Timer" "🕌 Iqama time for ' + p.name + '!"');
                    } catch (e) {}
                }
            }
        }
    }

    if (now.getDay() === 5 && config.fridayReminderEnabled !== false) {
        const dhuhr = prayers.find((pr) => pr.key === 'Dhuhr');
        if (dhuhr) {
            const reminderMins = config.fridayReminderMinutes !== undefined ? config.fridayReminderMinutes : 60;
            const reminderTime = new Date(dhuhr.adhanDate.getTime() - reminderMins * 60000);
            const fridayDiff = now.getTime() - reminderTime.getTime();
            const fridayKey = datePrefix + '_friday_reminder';

            if (fridayDiff >= 0 && !triggeredFridayReminders[fridayKey]) {
                triggeredFridayReminders[fridayKey] = true;
                if (fridayDiff <= 60000) {
                    triggerFridayReminder(reminderMins);
                }
            }
        }
    }
}

function showDuaaAfterAdhan() {
    log("[SalatExtension Legacy] 🤲 Showing Du'aa after Adhan...");
    const { I18n } = _getModules();
    const lang = config ? config.lang : 'auto';
    const title = I18n.t('duaa_title', lang);
    let body = I18n.t('duaa_text', lang);
    if (lang === 'en') {
        body += "\\n\\nO Allah, Lord of this perfect call and established prayer, grant Muhammad the intercession and distinction, and resurrect him to the praised position You have promised him.";
    } else if (lang === 'fr') {
        body += "\\n\\nÔ Allah, Seigneur de cet appel parfait et de la prière établie, accorde à Muhammad l'intercession et l'éminence, et ressuscite-le au rang louable que Tu lui as promis.";
    }

    try {
        const safeTitle = title.replace(/"/g, '\\\\"');
        const safeBody = body.replace(/"/g, '\\\\"');
        GLib.spawn_command_line_async('notify-send -u normal "' + safeTitle + '" "' + safeBody + '"');
    } catch (e) {
        log("[SalatExtension Legacy] Error sending Du'aa notification: " + e.message);
    }

    if (config && config.duaaAudioPath && config.duaaAudioPath.trim().length > 0) {
        let audio = config.duaaAudioPath.trim();
        if (audio.startsWith('~')) audio = GLib.get_home_dir() + audio.slice(1);
        if (GLib.file_test(audio, GLib.FileTest.EXISTS)) {
            playAudioFile(audio);
        }
    }
}

function triggerFridayReminder(minutes) {
    log('[SalatExtension Legacy] 🕌 Triggering Friday Jumuaah reminder (' + minutes + 'm before Dhuhr)...');
    const { I18n } = _getModules();
    const lang = config ? config.lang : 'auto';
    const title = I18n.t('friday_reminder_title', lang);
    const body = I18n.t('friday_reminder_body', lang, { minutes: minutes });
    try {
        const safeTitle = title.replace(/"/g, '\\\\"');
        const safeBody = body.replace(/"/g, '\\\\"');
        GLib.spawn_command_line_async('notify-send -u critical "' + safeTitle + '" "' + safeBody + '"');
    } catch (e) {
        log('[SalatExtension Legacy] Error sending Friday reminder: ' + e.message);
    }
}

function triggerWuduReminder(prayerName, minutes) {
    log("[SalatExtension Legacy] 💧 Triggering Wudu reminder for " + prayerName + " (" + minutes + "m before Adhan)...");
    const { I18n } = _getModules();
    const lang = config ? config.lang : 'auto';
    const title = I18n.t('wudu_reminder_title', lang);
    const body = I18n.t('wudu_reminder_body', lang, { prayer: prayerName, minutes: minutes });
    try {
        const safeTitle = title.replace(/"/g, '\\\\"');
        const safeBody = body.replace(/"/g, '\\\\"');
        GLib.spawn_command_line_async('notify-send -u normal "' + safeTitle + '" "' + safeBody + '"');
    } catch (e) {
        log("[SalatExtension Legacy] Error sending Wudu reminder: " + e.message);
    }

    if (config && config.wuduAudioPath && config.wuduAudioPath.trim().length > 0) {
        let audio = config.wuduAudioPath.trim();
        if (audio.startsWith('~')) audio = GLib.get_home_dir() + audio.slice(1);
        if (GLib.file_test(audio, GLib.FileTest.EXISTS)) {
            playAudioFile(audio);
            return;
        }
    }

    try {
        if (GLib.find_program_in_path('canberra-gtk-play')) {
            GLib.spawn_command_line_async('canberra-gtk-play -i message-new-instant');
        }
    } catch (e) {}
}

function getAudioPlayerScript() {
    try {
        let extPath = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'share', 'gnome-shell', 'extensions', 'salat-timer@moroccan-habous', 'play_audio.py']);
        if (GLib.file_test(extPath, GLib.FileTest.EXISTS)) return extPath;
        let cur = GLib.build_filenamev([GLib.get_current_dir(), 'play_audio.py']);
        if (GLib.file_test(cur, GLib.FileTest.EXISTS)) return cur;
        let srcCur = GLib.build_filenamev([GLib.get_current_dir(), 'src', 'play_audio.py']);
        if (GLib.file_test(srcCur, GLib.FileTest.EXISTS)) return srcCur;
    } catch (e) {}
    return null;
}

function playAudioFile(audioPath) {
    if (!audioPath) return;
    if (audioPath.startsWith('~')) {
        audioPath = GLib.get_home_dir() + audioPath.slice(1);
    }
    if (!GLib.file_test(audioPath, GLib.FileTest.EXISTS)) {
        log('[SalatExtension Legacy] Audio file not found: ' + audioPath);
        return;
    }

    log('[SalatExtension Legacy] 🔊 Playing audio via robust helper: ' + audioPath);
    try {
        const script = getAudioPlayerScript();
        if (script) {
            GLib.spawn_command_line_async('python3 "' + script + '" "' + audioPath + '"');
            return;
        }

        const pyScript = 'import gi, sys, os; gi.require_version("Gst", "1.0"); from gi.repository import Gst, GLib; Gst.init(None); p = Gst.ElementFactory.make("playbin", "salat_player"); p.set_property("uri", GLib.filename_to_uri(os.path.abspath(sys.argv[1]), None)); p.set_state(Gst.State.PLAYING); loop = GLib.MainLoop(); b = p.get_bus(); b.add_watch(GLib.PRIORITY_DEFAULT, lambda bus, msg: loop.quit() if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR) else True); loop.run(); p.set_state(Gst.State.NULL)';
        GLib.spawn_command_line_async('python3 -c "' + pyScript + '" "' + audioPath + '"');
    } catch (e) {
        log('[SalatExtension Legacy] Audio playback failed: ' + e.message);
    }
}

function getScheduleWindowScript() {
    try {
        let extPath = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'share', 'gnome-shell', 'extensions', 'salat-timer@moroccan-habous', 'schedule_window.py']);
        if (GLib.file_test(extPath, GLib.FileTest.EXISTS)) return extPath;
        let cur = GLib.build_filenamev([GLib.get_current_dir(), 'schedule_window.py']);
        if (GLib.file_test(cur, GLib.FileTest.EXISTS)) return cur;
        let srcCur = GLib.build_filenamev([GLib.get_current_dir(), 'src', 'schedule_window.py']);
        if (GLib.file_test(srcCur, GLib.FileTest.EXISTS)) return srcCur;
    } catch (e) {}
    return null;
}

function openScheduleWindow() {
    log('[SalatExtension Legacy] 📅 Launching dedicated monthly schedule window...');
    try {
        let script = getScheduleWindowScript();
        if (script) {
            GLib.spawn_command_line_async('python3 "' + script + '"');
        } else {
            GLib.spawn_command_line_async('python3 -m salat_schedule 2>/dev/null || gnome-extensions prefs salat-timer@moroccan-habous');
        }
    } catch (e) {
        log('[SalatExtension Legacy] Failed to open schedule window: ' + e.message);
    }
}

function toggleQuickWudu() {
    const { Calculator, Constants, I18n } = _getModules();
    const now = new Date();
    const prayers = prayerTimesData && config
        ? Calculator.getPrayerEntries(prayerTimesData, config.iqamaDelays, config.lang, now)
        : [];
    const active = Calculator.findActivePrayer(prayers, config ? config.iqamaDelays : Constants.DEFAULT_IQAMA_DELAYS, now);
    const prayerName = active ? active.prayer.name : '';
    const prayerKey = active ? active.prayer.key : '';

    wuduDone = !wuduDone;
    if (wuduDone) {
        lastWuduPrayerKey = prayerKey;
    } else {
        lastWuduPrayerKey = '';
    }

    log('[SalatExtension Legacy] 💧 Quick Wudu toggled: done=' + wuduDone + ' for prayer=' + prayerName);
    reloadAndSyncUI();

    const lang = config ? config.lang : 'auto';
    try {
        if (wuduDone) {
            const title = I18n.t('wudu_marked_title', lang);
            const body = I18n.t('wudu_marked_body', lang, { prayer: prayerName });
            GLib.spawn_command_line_async('notify-send -u normal "' + title.replace(/"/g, '\\"') + '" "' + body.replace(/"/g, '\\"') + '"');

            if (config && config.wuduAudioPath && config.wuduAudioPath.trim().length > 0) {
                let audio = config.wuduAudioPath.trim();
                if (audio.startsWith('~')) audio = GLib.get_home_dir() + audio.slice(1);
                if (GLib.file_test(audio, GLib.FileTest.EXISTS)) {
                    playAudioFile(audio);
                    return;
                }
            }

            if (GLib.find_program_in_path('canberra-gtk-play')) {
                GLib.spawn_command_line_async('canberra-gtk-play -i message-new-instant');
            }
        } else {
            const title = I18n.t('wudu_cleared_title', lang);
            const body = I18n.t('wudu_cleared_body', lang, { prayer: prayerName });
            GLib.spawn_command_line_async('notify-send -u normal "' + title.replace(/"/g, '\\"') + '" "' + body.replace(/"/g, '\\"') + '"');
        }
    } catch (e) {
        log('[SalatExtension Legacy] Error sending Wudu notification: ' + e.message);
    }
}

function recreatePanelIndicator() {
    log('[SalatExtension Legacy] Rebuilding panel indicator from scratch...');
    try {
        if (indicator) {
            indicator.destroy();
            indicator = null;
        }
        destroyOldStatusAreaRole();

        indicator = new PanelMenu.Button(0.0, "Salat & Iqama Indicator", false);

        let box = new St.BoxLayout({
            style_class: 'panel-status-indicators-box',
            y_align: Clutter.ActorAlign.CENTER
        });

        let iconFile = getIconFile();
        if (iconFile) {
            let gicon = Gio.FileIcon.new(iconFile);
            indicator.icon = new St.Icon({
                gicon: gicon,
                style_class: 'system-status-icon',
                icon_size: 16
            });
            box.add_child(indicator.icon);
        }

        const { I18n } = _getModules();
        indicator.buttonText = new St.Label({
            text: I18n.t('loading', config ? config.lang : 'auto'),
            y_align: Clutter.ActorAlign.CENTER
        });
        box.add_child(indicator.buttonText);

        indicator.add_child(box);

        try {
            Main.panel.addToStatusArea('salat-indicator', indicator, 0, 'right');
            log('[SalatExtension Legacy] Added indicator to statusArea with role salat-indicator.');
        } catch (e) {
            log('[SalatExtension Legacy] addToStatusArea salat-indicator exception: ' + e.message + ', using fallback role.');
            let fallbackRole = 'salat-indicator-' + Date.now();
            Main.panel.addToStatusArea(fallbackRole, indicator, 0, 'right');
            log('[SalatExtension Legacy] Added indicator with fallback role: ' + fallbackRole);
        }

        refreshPrayerTimes();
    } catch (e) {
        log('[SalatExtension Legacy] Error recreating panel indicator: ' + e.message);
    }
}

function init(metadata) {
    log('[SalatExtension Legacy] Initializing extension...');
    const { Api } = _getModules();
    httpSession = Api.createSession();
}

function enable() {
    log('[SalatExtension Legacy] Enabling extension...');
    try {
        const { Constants, Config, Api, UI } = _getModules();
        config = Config.loadConfig();
        if (config) {
            log('[SalatExtension Legacy] Loaded config: City=' + config.city.name + ', Lang=' + config.lang);
        }

        configMonitor = Config.setupConfigMonitor(() => {
            log('[SalatExtension Legacy] Config monitor triggered: config changed on disk. Recreating indicator...');
            config = Config.loadConfig();
            recreatePanelIndicator();
        });

        recreatePanelIndicator();

        if (timeoutId) {
            GLib.source_remove(timeoutId);
        }
        timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            const now = new Date();
            if (!prayerTimesData || (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0)) {
                refreshPrayerTimes();
            } else if (config) {
                UI.updatePanelText(indicator, prayerTimesData, config.iqamaDelays, config.lang, wuduDone);
                checkPrayerEvents(now);
            }
            return GLib.SOURCE_CONTINUE;
        });

        log('[SalatExtension Legacy] Extension enabled successfully!');
    } catch (e) {
        log('[SalatExtension Legacy] FATAL ERROR in enable(): ' + e.message + '\\n' + e.stack);
    }
}

function disable() {
    log('[SalatExtension Legacy] Disabling extension...');
    try {
        if (configMonitor) {
            configMonitor.cancel();
            configMonitor = null;
        }
        if (timeoutId) {
            GLib.source_remove(timeoutId);
            timeoutId = 0;
        }
        if (indicator) {
            indicator.destroy();
            indicator = null;
        }
        destroyOldStatusAreaRole();
        log('[SalatExtension Legacy] Extension disabled cleanly.');
    } catch (e) {
        log('[SalatExtension Legacy] Error during disable(): ' + e.message);
    }
}
`;
        return legacyCode;
    }
    return code;
}

function transpilePrefsFile(code) {
    let output = code;

    // 1. Remove reference comments and imports (only at line starts!)
    output = output.replace(/^\s*\/\/\/ <reference path=.*\/>[\r\n]*/gm, '');
    output = output.replace(/^\s*import\s+.*[\r\n]*/gm, '');

    // 2. Prefix with legacy imports and modules helper
    const prefix = 'var { Adw, Gtk, GLib } = imports.gi;\nvar ExtensionUtils = imports.misc.extensionUtils;\n\nfunction _getPrefsModules() {\n    const Me = ExtensionUtils.getCurrentExtension();\n    return {\n        Constants: Me.imports.constants,\n        Config: Me.imports.config,\n        I18n: Me.imports.i18n,\n        Api: Me.imports.api\n    };\n}\n\nfunction init(metadata) {}\n\n';

    // 3. Transform the class declaration into function fillPreferencesWindow(window)
    output = output.replace(
        /export\s+default\s+class\s+SalatPreferences\s+extends\s+ExtensionPreferences\s*\{\s*fillPreferencesWindow\s*\(\s*window\s*\)\s*\{/,
        'function fillPreferencesWindow(window) {\n    const { Constants, Config, I18n, Api } = _getPrefsModules();'
    );

    // 4. Strip the trailing closing brace of the class
    output = output.trim();
    if (output.endsWith('}')) {
        output = output.slice(0, -1);
    }

    // 5. Add buildPrefsWidget fallback
    const suffix = '\n\nfunction buildPrefsWidget() {\n    let dummyWin = new Adw.PreferencesWindow();\n    fillPreferencesWindow(dummyWin);\n    return dummyWin.get_visible_page() || new Adw.PreferencesPage();\n}\n';

    return prefix + output + suffix;
}

// Process files
if (fs.existsSync(tmpDir)) {
    fs.readdirSync(tmpDir).forEach((file) => {
        const srcPath = path.join(tmpDir, file);
        const destPath = path.join(distDir, file);

        if (file.endsWith('.js')) {
            const content = fs.readFileSync(srcPath, 'utf8');
            const transpiled = transpileModule(file, content);
            fs.writeFileSync(destPath, transpiled, 'utf8');
            console.log(`  ✔ Transpiled ${file} -> dist/${file}`);
        } else if (file === 'metadata.json') {
            const meta = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
            meta['shell-version'] = ["42", "42.9"];
            fs.writeFileSync(destPath, JSON.stringify(meta, null, 2), 'utf8');
            console.log(`  ✔ Generated metadata.json for GNOME 42.9 -> dist/metadata.json`);
        } else {
            fs.copyFileSync(srcPath, destPath);
            console.log(`  ✔ Copied ${file} -> dist/${file}`);
        }
    });

    function safeRmSync(p) {
        if (!fs.existsSync(p)) return;
        if (typeof fs.rmSync === 'function') {
            fs.rmSync(p, { recursive: true, force: true });
        } else {
            fs.rmdirSync(p, { recursive: true });
        }
    }

    // Remove temporary directory
    safeRmSync(tmpDir);
}

// Clean up old legacy/esm subdirectories if present in dist
const oldLegacy = path.join(distDir, 'legacy');
const oldEsm = path.join(distDir, 'esm');
safeRmSync(oldLegacy);
safeRmSync(oldEsm);

console.log('✔ Transpilation complete! GNOME 42.9 extension ready in dist/');
