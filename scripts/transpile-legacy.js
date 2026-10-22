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
    let output = code;

    // 1. Remove reference comments if any
    output = output.replace(/\/\/\/ <reference path=.*\/>/g, '');

    // 2. Transpile imports
    output = output.replace(/import\s+(\w+)\s+from\s+['"]gi:\/\/(\w+)(?:\?version=.*)?['"];?/g, 'var $1 = imports.gi.$2;');
    output = output.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]resource:\/\/\/org\/gnome\/shell\/ui\/(\w+)\.js['"];?/g, 'var $1 = imports.ui.$2;');
    output = output.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]resource:\/\/\/org\/gnome\/Shell\/Extensions\/js\/(\w+)\.js['"];?/g, 'var $1 = imports.misc.$2;');

    // Local module imports: import * as Foo from './foo.js';
    output = output.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]\.\/(\w+)\.js['"];?/g, (match, varName, modName) => {
        return `var ${varName} = imports.misc.extensionUtils.getCurrentExtension().imports.${modName};`;
    });

    // 3. Remove standard import of Extension / ExtensionPreferences base classes
    output = output.replace(/import\s+\{\s*(?:Extension|ExtensionPreferences)\s*\}\s+from\s+['"].*['"];?/g, '');

    // 4. Convert exports to top-level declarations
    output = output.replace(/export\s+const\s+/g, 'var ');
    output = output.replace(/export\s+let\s+/g, 'var ');
    output = output.replace(/export\s+function\s+/g, 'function ');
    output = output.replace(/export\s+class\s+/g, 'var ');

    // 5. Special handling for extension.js
    if (filename === 'extension.js') {
        output = transpileExtensionFile(output);
    }

    // 6. Special handling for prefs.js
    if (filename === 'prefs.js') {
        output = transpilePrefsFile(output);
    }

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
        UI.updatePanelText(indicator, prayerTimesData, config.iqamaDelays, config.lang);
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
            }
        });
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

function playAudioFile(audioPath) {
    if (!audioPath || !GLib.file_test(audioPath, GLib.FileTest.EXISTS)) return;
    try {
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
                UI.updatePanelText(indicator, prayerTimesData, config.iqamaDelays, config.lang);
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
    let legacyCode = `var { Adw, Gtk, GLib } = imports.gi;
var ExtensionUtils = imports.misc.extensionUtils;

function _getPrefsModules() {
    const Me = ExtensionUtils.getCurrentExtension();
    return {
        Constants: Me.imports.constants,
        Config: Me.imports.config,
        I18n: Me.imports.i18n,
        Api: Me.imports.api
    };
}

function playAudioPreview(path) {
    if (!path) return;
    try {
        if (GLib.find_program_in_path('cvlc')) {
            GLib.spawn_command_line_async('cvlc --play-and-exit --no-video "' + path + '"');
        } else if (GLib.find_program_in_path('pw-play')) {
            GLib.spawn_command_line_async('pw-play "' + path + '"');
        } else if (GLib.find_program_in_path('paplay')) {
            GLib.spawn_command_line_async('paplay "' + path + '"');
        } else {
            const pyScript = 'import gi, sys; gi.require_version("Gst", "1.0"); from gi.repository import Gst, GLib; Gst.init(None); p = Gst.ElementFactory.make("playbin", "p"); p.set_property("uri", "file://" + sys.argv[1]); p.set_state(Gst.State.PLAYING); loop = GLib.MainLoop(); b = p.get_bus(); b.add_watch(GLib.PRIORITY_DEFAULT, lambda bus, msg: loop.quit() if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR) else True); loop.run()';
            GLib.spawn_command_line_async('python3 -c "' + pyScript + '" "' + path + '"');
        }
    } catch (e) {
        log('[SalatExtension Prefs] Error in audio test: ' + e.message);
    }
}

function resolveDefaultAdhanPath() {
    let cur = GLib.build_filenamev([GLib.get_current_dir(), 'adan.mp3']);
    if (GLib.file_test(cur, GLib.FileTest.EXISTS)) return cur;
    let extPath = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'share', 'gnome-shell', 'extensions', 'salat-timer@moroccan-habous', 'adan.mp3']);
    if (GLib.file_test(extPath, GLib.FileTest.EXISTS)) return extPath;
    return '';
}

function init(metadata) {}

function buildPrefsWidget() {
    const { Constants, Config, I18n, Api } = _getPrefsModules();

    let config = Config.loadConfig();
    let prefsPage = new Adw.PreferencesPage();

    // 1. General Settings Group (City & Language)
    let generalGroup = new Adw.PreferencesGroup();

    let cityRow = new Adw.ComboRow({
        model: Gtk.StringList.new(Constants.CITIES.map((c) => c.name)),
        selected: Math.max(0, Constants.CITIES.findIndex((c) => c.id === config.city.id))
    });
    cityRow.connect('notify::selected', (widget) => {
        let idx = widget.get_selected();
        if (idx >= 0 && idx < Constants.CITIES.length) {
            config.city = Constants.CITIES[idx];
            Config.saveConfig(config);
        }
    });
    generalGroup.add(cityRow);

    let langRow = new Adw.ComboRow({
        model: Gtk.StringList.new(I18n.LANGUAGES.map((l) => l.name)),
        selected: Math.max(0, I18n.LANGUAGES.findIndex((l) => l.code === config.lang))
    });
    generalGroup.add(langRow);

    prefsPage.add(generalGroup);

    // 2. Iqama Delays Group
    let iqamaGroup = new Adw.PreferencesGroup();

    const prayerDefs = [
        { key: 'Fajr', i18nKey: 'fajr', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Fajr },
        { key: 'Dhuhr', i18nKey: 'dhuhr', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Dhuhr },
        { key: 'Asr', i18nKey: 'asr', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Asr },
        { key: 'Maghrib', i18nKey: 'maghrib', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Maghrib },
        { key: 'Ishae', i18nKey: 'isha', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Ishae }
    ];

    let prayerRows = [];

    prayerDefs.forEach(p => {
        let currentVal = config.iqamaDelays[p.key] || p.defaultVal;
        let adjustment = new Gtk.Adjustment({
            value: currentVal, lower: 1, upper: 60,
            step_increment: 1, page_increment: 5
        });

        let row;
        if (Adw.SpinRow) {
            row = new Adw.SpinRow({
                subtitle: \`Default: +\${p.defaultVal}m\`,
                adjustment: adjustment,
                value: currentVal
            });
            row.connect('notify::value', (widget) => {
                let v = widget.get_value();
                if (v > 0) {
                    config.iqamaDelays[p.key] = v;
                    Config.saveConfig(config);
                }
            });
        } else {
            row = new Adw.ActionRow({
                subtitle: \`Default: +\${p.defaultVal}m\`
            });
            let spin = Gtk.SpinButton.new(adjustment, 1, 0);
            spin.valign = Gtk.Align.CENTER;
            spin.set_value(currentVal);
            spin.connect('value-changed', (widget) => {
                let v = widget.get_value_as_int();
                if (v > 0) {
                    config.iqamaDelays[p.key] = v;
                    Config.saveConfig(config);
                }
            });
            row.add_suffix(spin);
            row.activatable_widget = spin;
        }

        iqamaGroup.add(row);
        prayerRows.push({ def: p, row: row });
    });

    prefsPage.add(iqamaGroup);

    // 3. Adhan Audio Group
    let adhanGroup = new Adw.PreferencesGroup();

    let audioPathRow = new Adw.ActionRow();
    let audioPathEntry = new Gtk.Entry({
        valign: Gtk.Align.CENTER,
        hexpand: true,
        text: config.adhanAudioPath || '',
        placeholder_text: I18n.t('prefs_adhan_default', config.lang)
    });
    audioPathEntry.connect('changed', (widget) => {
        config.adhanAudioPath = widget.get_text();
        Config.saveConfig(config);
    });
    audioPathRow.add_suffix(audioPathEntry);

    let browseBtn = new Gtk.Button({
        label: I18n.t('prefs_adhan_browse', config.lang),
        valign: Gtk.Align.CENTER,
        margin_start: 6
    });
    browseBtn.connect('clicked', () => {
        try {
            let fileChooser = new Gtk.FileChooserNative({
                title: I18n.t('prefs_adhan_title', config.lang),
                action: Gtk.FileChooserAction.OPEN
            });
            let filter = new Gtk.FileFilter();
            filter.set_name('Audio Files (*.mp3, *.wav, *.ogg)');
            filter.add_mime_type('audio/*');
            filter.add_pattern('*.mp3');
            filter.add_pattern('*.wav');
            filter.add_pattern('*.ogg');
            fileChooser.add_filter(filter);

            fileChooser.connect('response', (dialog, response_id) => {
                if (response_id === Gtk.ResponseType.ACCEPT) {
                    let file = dialog.get_file();
                    if (file) {
                        let path = file.get_path();
                        audioPathEntry.set_text(path);
                        config.adhanAudioPath = path;
                        Config.saveConfig(config);
                    }
                }
                dialog.destroy();
            });
            fileChooser.show();
        } catch (e) {
            log('[SalatExtension Prefs] File chooser error: ' + e.message);
        }
    });
    audioPathRow.add_suffix(browseBtn);

    let testBtn = new Gtk.Button({
        label: I18n.t('prefs_adhan_test', config.lang),
        valign: Gtk.Align.CENTER,
        margin_start: 6
    });
    testBtn.connect('clicked', () => {
        let path = audioPathEntry.get_text().trim();
        if (path.startsWith('~')) {
            path = GLib.get_home_dir() + path.slice(1);
        }
        if (!path) {
            path = resolveDefaultAdhanPath();
        }
        if (path && GLib.file_test(path, GLib.FileTest.EXISTS)) {
            playAudioPreview(path);
        } else {
            log('[SalatExtension Prefs] Audio file not found: ' + path);
        }
    });
    audioPathRow.add_suffix(testBtn);

    let resetBtn = new Gtk.Button({
        label: I18n.t('prefs_adhan_reset', config.lang),
        valign: Gtk.Align.CENTER,
        margin_start: 6
    });
    resetBtn.connect('clicked', () => {
        audioPathEntry.set_text('');
        config.adhanAudioPath = '';
        Config.saveConfig(config);
    });
    audioPathRow.add_suffix(resetBtn);

    adhanGroup.add(audioPathRow);
    prefsPage.add(adhanGroup);

    // 4. Du'aa After Adhan Group
    let duaaGroup = new Adw.PreferencesGroup();

    let duaaSwitchRow = new Adw.ActionRow();
    let duaaSwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: config.duaaAfterAdhan !== false
    });
    duaaSwitch.connect('notify::active', (widget) => {
        config.duaaAfterAdhan = widget.get_active();
        Config.saveConfig(config);
    });
    duaaSwitchRow.add_suffix(duaaSwitch);
    duaaSwitchRow.activatable_widget = duaaSwitch;
    duaaGroup.add(duaaSwitchRow);

    let duaaAudioRow = new Adw.ActionRow();
    let duaaAudioEntry = new Gtk.Entry({
        valign: Gtk.Align.CENTER,
        hexpand: true,
        text: config.duaaAudioPath || '',
        placeholder_text: 'Optional custom audio file'
    });
    duaaAudioEntry.connect('changed', (widget) => {
        config.duaaAudioPath = widget.get_text();
        Config.saveConfig(config);
    });
    duaaAudioRow.add_suffix(duaaAudioEntry);

    let duaaBrowseBtn = new Gtk.Button({
        label: I18n.t('prefs_adhan_browse', config.lang),
        valign: Gtk.Align.CENTER,
        margin_start: 6
    });
    duaaBrowseBtn.connect('clicked', () => {
        try {
            let fileChooser = new Gtk.FileChooserNative({
                title: I18n.t('prefs_duaa_title', config.lang),
                action: Gtk.FileChooserAction.OPEN
            });
            let filter = new Gtk.FileFilter();
            filter.set_name('Audio Files (*.mp3, *.wav, *.ogg)');
            filter.add_mime_type('audio/*');
            filter.add_pattern('*.mp3');
            filter.add_pattern('*.wav');
            filter.add_pattern('*.ogg');
            fileChooser.add_filter(filter);

            fileChooser.connect('response', (dialog, response_id) => {
                if (response_id === Gtk.ResponseType.ACCEPT) {
                    let file = dialog.get_file();
                    if (file) {
                        let path = file.get_path();
                        duaaAudioEntry.set_text(path);
                        config.duaaAudioPath = path;
                        Config.saveConfig(config);
                    }
                }
                dialog.destroy();
            });
            fileChooser.show();
        } catch (e) {
            log('[SalatExtension Prefs] Du\\'aa file chooser error: ' + e.message);
        }
    });
    duaaAudioRow.add_suffix(duaaBrowseBtn);

    let duaaTestBtn = new Gtk.Button({
        label: I18n.t('prefs_adhan_test', config.lang),
        valign: Gtk.Align.CENTER,
        margin_start: 6
    });
    duaaTestBtn.connect('clicked', () => {
        let path = duaaAudioEntry.get_text().trim();
        if (path.startsWith('~')) path = GLib.get_home_dir() + path.slice(1);
        if (path && GLib.file_test(path, GLib.FileTest.EXISTS)) {
            playAudioPreview(path);
        } else {
            log('[SalatExtension Prefs] Du\\'aa audio not found: ' + path);
        }
    });
    duaaAudioRow.add_suffix(duaaTestBtn);

    let duaaResetBtn = new Gtk.Button({
        label: I18n.t('prefs_adhan_reset', config.lang),
        valign: Gtk.Align.CENTER,
        margin_start: 6
    });
    duaaResetBtn.connect('clicked', () => {
        duaaAudioEntry.set_text('');
        config.duaaAudioPath = '';
        Config.saveConfig(config);
    });
    duaaAudioRow.add_suffix(duaaResetBtn);

    duaaGroup.add(duaaAudioRow);
    prefsPage.add(duaaGroup);

    // 5. Friday Jumuaah Reminder Group
    let fridayGroup = new Adw.PreferencesGroup();

    let fridaySwitchRow = new Adw.ActionRow();
    let fridaySwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: config.fridayReminderEnabled !== false
    });
    fridaySwitch.connect('notify::active', (widget) => {
        config.fridayReminderEnabled = widget.get_active();
        Config.saveConfig(config);
    });
    fridaySwitchRow.add_suffix(fridaySwitch);
    fridaySwitchRow.activatable_widget = fridaySwitch;
    fridayGroup.add(fridaySwitchRow);

    let fridayAdj = new Gtk.Adjustment({
        value: config.fridayReminderMinutes || 60,
        lower: 15, upper: 180,
        step_increment: 5, page_increment: 15
    });

    let fridayTimeRow;
    if (Adw.SpinRow) {
        fridayTimeRow = new Adw.SpinRow({
            subtitle: 'Minutes before Dhuhr',
            adjustment: fridayAdj,
            value: config.fridayReminderMinutes || 60
        });
        fridayTimeRow.connect('notify::value', (widget) => {
            let v = widget.get_value();
            if (v >= 15) {
                config.fridayReminderMinutes = v;
                Config.saveConfig(config);
            }
        });
    } else {
        fridayTimeRow = new Adw.ActionRow({
            subtitle: 'Minutes before Dhuhr'
        });
        let spin = Gtk.SpinButton.new(fridayAdj, 5, 0);
        spin.valign = Gtk.Align.CENTER;
        spin.set_value(config.fridayReminderMinutes || 60);
        spin.connect('value-changed', (widget) => {
            let v = widget.get_value_as_int();
            if (v >= 15) {
                config.fridayReminderMinutes = v;
                Config.saveConfig(config);
            }
        });
        fridayTimeRow.add_suffix(spin);
        fridayTimeRow.activatable_widget = spin;
    }
    fridayGroup.add(fridayTimeRow);
    prefsPage.add(fridayGroup);

    // 6. Wudu Reminder Group
    let wuduGroup = new Adw.PreferencesGroup();

    let wuduSwitchRow = new Adw.ActionRow();
    let wuduSwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: config.wuduReminderEnabled !== false
    });
    wuduSwitch.connect('notify::active', (widget) => {
        config.wuduReminderEnabled = widget.get_active();
        Config.saveConfig(config);
    });
    wuduSwitchRow.add_suffix(wuduSwitch);
    wuduSwitchRow.activatable_widget = wuduSwitch;
    wuduGroup.add(wuduSwitchRow);

    let wuduAdj = new Gtk.Adjustment({
        value: config.wuduReminderMinutes || 15,
        lower: 1, upper: 60,
        step_increment: 1, page_increment: 5
    });

    let wuduTimeRow;
    if (Adw.SpinRow) {
        wuduTimeRow = new Adw.SpinRow({
            subtitle: 'Minutes before Adhan',
            adjustment: wuduAdj,
            value: config.wuduReminderMinutes || 15
        });
        wuduTimeRow.connect('notify::value', (widget) => {
            let v = widget.get_value();
            if (v >= 1) {
                config.wuduReminderMinutes = v;
                Config.saveConfig(config);
            }
        });
    } else {
        wuduTimeRow = new Adw.ActionRow({
            subtitle: 'Minutes before Adhan'
        });
        let spin = Gtk.SpinButton.new(wuduAdj, 1, 0);
        spin.valign = Gtk.Align.CENTER;
        spin.set_value(config.wuduReminderMinutes || 15);
        spin.connect('value-changed', (widget) => {
            let v = widget.get_value_as_int();
            if (v >= 1) {
                config.wuduReminderMinutes = v;
                Config.saveConfig(config);
            }
        });
        wuduTimeRow.add_suffix(spin);
        wuduTimeRow.activatable_widget = spin;
    }
    wuduGroup.add(wuduTimeRow);

    let wuduAudioRow = new Adw.ActionRow();
    let wuduAudioEntry = new Gtk.Entry({
        valign: Gtk.Align.CENTER,
        hexpand: true,
        text: config.wuduAudioPath || '',
        placeholder_text: 'Optional custom audio chime'
    });
    wuduAudioEntry.connect('changed', (widget) => {
        config.wuduAudioPath = widget.get_text();
        Config.saveConfig(config);
    });
    wuduAudioRow.add_suffix(wuduAudioEntry);

    let wuduBrowseBtn = new Gtk.Button({
        label: I18n.t('prefs_adhan_browse', config.lang),
        valign: Gtk.Align.CENTER,
        margin_start: 6
    });
    wuduBrowseBtn.connect('clicked', () => {
        try {
            let fileChooser = new Gtk.FileChooserNative({
                title: I18n.t('prefs_wudu_title', config.lang),
                action: Gtk.FileChooserAction.OPEN
            });
            let filter = new Gtk.FileFilter();
            filter.set_name('Audio Files (*.mp3, *.wav, *.ogg)');
            filter.add_mime_type('audio/*');
            filter.add_pattern('*.mp3');
            filter.add_pattern('*.wav');
            filter.add_pattern('*.ogg');
            fileChooser.add_filter(filter);

            fileChooser.connect('response', (dialog, response_id) => {
                if (response_id === Gtk.ResponseType.ACCEPT) {
                    let file = dialog.get_file();
                    if (file) {
                        let path = file.get_path();
                        wuduAudioEntry.set_text(path);
                        config.wuduAudioPath = path;
                        Config.saveConfig(config);
                    }
                }
                dialog.destroy();
            });
            fileChooser.show();
        } catch (e) {
            log("[SalatExtension Prefs] Wudu file chooser error: " + e.message);
        }
    });
    wuduAudioRow.add_suffix(wuduBrowseBtn);

    let wuduTestBtn = new Gtk.Button({
        label: I18n.t('prefs_adhan_test', config.lang),
        valign: Gtk.Align.CENTER,
        margin_start: 6
    });
    wuduTestBtn.connect('clicked', () => {
        let path = wuduAudioEntry.get_text().trim();
        if (path.startsWith('~')) path = GLib.get_home_dir() + path.slice(1);
        if (path && GLib.file_test(path, GLib.FileTest.EXISTS)) {
            playAudioPreview(path);
        } else {
            log("[SalatExtension Prefs] Wudu audio not found: " + path);
        }
    });
    wuduAudioRow.add_suffix(wuduTestBtn);

    let wuduResetBtn = new Gtk.Button({
        label: I18n.t('prefs_adhan_reset', config.lang),
        valign: Gtk.Align.CENTER,
        margin_start: 6
    });
    wuduResetBtn.connect('clicked', () => {
        wuduAudioEntry.set_text('');
        config.wuduAudioPath = '';
        Config.saveConfig(config);
    });
    wuduAudioRow.add_suffix(wuduResetBtn);

    wuduGroup.add(wuduAudioRow);
    prefsPage.add(wuduGroup);

    // 7. Lock Screen Group
    let lockGroup = new Adw.PreferencesGroup();

    let lockSwitchRow = new Adw.ActionRow();
    let lockSwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: !!config.lockEnabled
    });
    lockSwitch.connect('notify::active', (widget) => {
        config.lockEnabled = widget.get_active();
        Config.saveConfig(config);
    });
    lockSwitchRow.add_suffix(lockSwitch);
    lockSwitchRow.activatable_widget = lockSwitch;
    lockGroup.add(lockSwitchRow);

    let lockCmdRow = new Adw.ActionRow();
    let lockCmdEntry = new Gtk.Entry({
        valign: Gtk.Align.CENTER,
        hexpand: true,
        text: config.customLockCommand || '',
        placeholder_text: 'ft_lock (default)'
    });
    lockCmdEntry.connect('changed', (widget) => {
        config.customLockCommand = widget.get_text();
        Config.saveConfig(config);
    });
    lockCmdRow.add_suffix(lockCmdEntry);
    lockGroup.add(lockCmdRow);

    prefsPage.add(lockGroup);

    // 7. Save & Apply Actions Group
    let actionsGroup = new Adw.PreferencesGroup();
    let actionRow = new Adw.ActionRow();
    let saveButton = new Gtk.Button({
        valign: Gtk.Align.CENTER
    });
    let statusLabel = new Gtk.Label({
        label: '',
        valign: Gtk.Align.CENTER,
        margin_end: 10
    });

    saveButton.connect('clicked', () => {
        log('[SalatExtension Prefs] Manual Save & Apply clicked.');
        Config.saveConfig(config);
        statusLabel.set_text(I18n.t('prefs_saved_success', config.lang));
    });

    actionRow.add_suffix(statusLabel);
    actionRow.add_suffix(saveButton);
    actionsGroup.add(actionRow);
    prefsPage.add(actionsGroup);

    // Dynamic UI Text Refresh Helper
    const updatePrefsText = () => {
        let lang = config.lang || 'auto';
        generalGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_general_title', lang), -1));
        generalGroup.set_description(I18n.t('prefs_general_desc', lang));
        cityRow.set_title(I18n.t('prefs_city_title', lang));
        langRow.set_title(I18n.t('prefs_lang_title', lang));

        iqamaGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_iqama_title', lang), -1));
        iqamaGroup.set_description(I18n.t('prefs_iqama_desc', lang));

        prayerRows.forEach(item => {
            item.row.set_title(I18n.t(item.def.i18nKey, lang));
        });

        adhanGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_adhan_title', lang), -1));
        adhanGroup.set_description(I18n.t('prefs_adhan_desc', lang));
        audioPathRow.set_title(I18n.t('prefs_adhan_path', lang));
        audioPathRow.set_subtitle(I18n.t('prefs_adhan_path_sub', lang));
        audioPathEntry.set_placeholder_text(I18n.t('prefs_adhan_default', lang));
        browseBtn.set_label(I18n.t('prefs_adhan_browse', lang));
        testBtn.set_label(I18n.t('prefs_adhan_test', lang));
        resetBtn.set_label(I18n.t('prefs_adhan_reset', lang));

        duaaGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_duaa_title', lang), -1));
        duaaGroup.set_description(I18n.t('prefs_duaa_desc', lang));
        duaaSwitchRow.set_title(I18n.t('prefs_duaa_enable', lang));
        duaaSwitchRow.set_subtitle(I18n.t('prefs_duaa_enable_sub', lang));
        duaaAudioRow.set_title(I18n.t('prefs_duaa_audio', lang));
        duaaAudioRow.set_subtitle(I18n.t('prefs_duaa_audio_sub', lang));
        duaaBrowseBtn.set_label(I18n.t('prefs_adhan_browse', lang));
        duaaTestBtn.set_label(I18n.t('prefs_adhan_test', lang));
        duaaResetBtn.set_label(I18n.t('prefs_adhan_reset', lang));

        fridayGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_friday_title', lang), -1));
        fridayGroup.set_description(I18n.t('prefs_friday_desc', lang));
        fridaySwitchRow.set_title(I18n.t('prefs_friday_enable', lang));
        fridaySwitchRow.set_subtitle(I18n.t('prefs_friday_enable_sub', lang));
        fridayTimeRow.set_title(I18n.t('prefs_friday_time', lang));

        wuduGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_wudu_title', lang), -1));
        wuduGroup.set_description(I18n.t('prefs_wudu_desc', lang));
        wuduSwitchRow.set_title(I18n.t('prefs_wudu_enable', lang));
        wuduSwitchRow.set_subtitle(I18n.t('prefs_wudu_enable_sub', lang));
        wuduTimeRow.set_title(I18n.t('prefs_wudu_time', lang));
        wuduAudioRow.set_title(I18n.t('prefs_wudu_audio', lang));
        wuduAudioRow.set_subtitle(I18n.t('prefs_wudu_audio_sub', lang));
        wuduBrowseBtn.set_label(I18n.t('prefs_adhan_browse', lang));
        wuduTestBtn.set_label(I18n.t('prefs_adhan_test', lang));
        wuduResetBtn.set_label(I18n.t('prefs_adhan_reset', lang));

        lockGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_lock_title', lang), -1));
        lockGroup.set_description(I18n.t('prefs_lock_desc', lang));
        lockSwitchRow.set_title(I18n.t('prefs_lock_enable', lang));
        lockSwitchRow.set_subtitle(I18n.t('prefs_lock_enable_sub', lang));
        lockCmdRow.set_title(I18n.t('prefs_lock_cmd', lang));
        lockCmdRow.set_subtitle(I18n.t('prefs_lock_cmd_sub', lang));

        actionsGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_actions_title', lang), -1));
        actionRow.set_title(I18n.t('prefs_actions_title', lang));
        saveButton.set_label(I18n.t('prefs_save_button', lang));
        if (statusLabel.get_text() !== '') {
            statusLabel.set_text(I18n.t('prefs_saved_success', lang));
        }
    };

    langRow.connect('notify::selected', (widget) => {
        let idx = widget.get_selected();
        if (idx >= 0 && idx < I18n.LANGUAGES.length) {
            config.lang = I18n.LANGUAGES[idx].code;
            Config.saveConfig(config);
            updatePrefsText();
        }
    });

    updatePrefsText();
    return prefsPage;
}
`;
    return legacyCode;
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

    // Remove temporary directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Clean up old legacy/esm subdirectories if present in dist
const oldLegacy = path.join(distDir, 'legacy');
const oldEsm = path.join(distDir, 'esm');
if (fs.existsSync(oldLegacy)) fs.rmSync(oldLegacy, { recursive: true, force: true });
if (fs.existsSync(oldEsm)) fs.rmSync(oldEsm, { recursive: true, force: true });

console.log('✔ Transpilation complete! GNOME 42.9 extension ready in dist/');
