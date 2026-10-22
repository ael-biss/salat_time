var { St, Clutter, GLib, Gio } = imports.gi;
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
        log('[SalatExtension Legacy] Error in reloadAndSyncUI: ' + e.message + '\n' + e.stack);
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
        body += "\n\nO Allah, Lord of this perfect call and established prayer, grant Muhammad the intercession and distinction, and resurrect him to the praised position You have promised him.";
    } else if (lang === 'fr') {
        body += "\n\nÔ Allah, Seigneur de cet appel parfait et de la prière établie, accorde à Muhammad l'intercession et l'éminence, et ressuscite-le au rang louable que Tu lui as promis.";
    }

    try {
        const safeTitle = title.replace(/"/g, '\\"');
        const safeBody = body.replace(/"/g, '\\"');
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
        const safeTitle = title.replace(/"/g, '\\"');
        const safeBody = body.replace(/"/g, '\\"');
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
        const safeTitle = title.replace(/"/g, '\\"');
        const safeBody = body.replace(/"/g, '\\"');
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
        log('[SalatExtension Legacy] FATAL ERROR in enable(): ' + e.message + '\n' + e.stack);
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
