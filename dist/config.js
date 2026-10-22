var GLib = imports.gi.GLib;
var Gio = imports.gi.Gio;
var Constants = imports.misc.extensionUtils.getCurrentExtension().imports.constants;
function loadConfig() {
    let config = {
        city: Constants.CITIES[0],
        lang: 'auto',
        iqamaDelays: Object.assign({}, Constants.DEFAULT_IQAMA_DELAYS),
        lockEnabled: false,
        customLockCommand: '',
        adhanAudioPath: '',
        duaaAfterAdhan: true,
        duaaAudioPath: '',
        fridayReminderEnabled: true,
        fridayReminderMinutes: 60,
        wuduReminderEnabled: true,
        wuduReminderMinutes: 15,
        wuduAudioPath: ''
    };
    try {
        if (!GLib.file_test(Constants.CONFIG_FILE, GLib.FileTest.EXISTS))
            return config;
        let [ok, contents] = GLib.file_get_contents(Constants.CONFIG_FILE);
        if (!ok)
            return config;
        let parsed = JSON.parse(new TextDecoder('utf-8').decode(contents));
        if (!parsed)
            return config;
        if (parsed.cityId) {
            let found = Constants.CITIES.find((c) => c.id === parsed.cityId);
            config.city = found || { id: parsed.cityId, name: parsed.cityName || 'Unknown' };
        }
        if (parsed.lang)
            config.lang = parsed.lang;
        if (parsed.iqamaDelays && typeof parsed.iqamaDelays === 'object') {
            for (let k in Constants.DEFAULT_IQAMA_DELAYS) {
                let val = Number(parsed.iqamaDelays[k]);
                config.iqamaDelays[k] = (!isNaN(val) && val > 0) ? val : Constants.DEFAULT_IQAMA_DELAYS[k];
            }
        }
        if (parsed.lockEnabled !== undefined) {
            config.lockEnabled = Boolean(parsed.lockEnabled);
        }
        if (typeof parsed.customLockCommand === 'string') {
            config.customLockCommand = parsed.customLockCommand;
        }
        if (typeof parsed.adhanAudioPath === 'string') {
            config.adhanAudioPath = parsed.adhanAudioPath;
        }
        if (parsed.duaaAfterAdhan !== undefined) {
            config.duaaAfterAdhan = Boolean(parsed.duaaAfterAdhan);
        }
        if (typeof parsed.duaaAudioPath === 'string') {
            config.duaaAudioPath = parsed.duaaAudioPath;
        }
        if (parsed.fridayReminderEnabled !== undefined) {
            config.fridayReminderEnabled = Boolean(parsed.fridayReminderEnabled);
        }
        if (parsed.fridayReminderMinutes !== undefined) {
            let m = Number(parsed.fridayReminderMinutes);
            config.fridayReminderMinutes = (!isNaN(m) && m >= 5 && m <= 240) ? m : 60;
        }
        if (parsed.wuduReminderEnabled !== undefined) {
            config.wuduReminderEnabled = Boolean(parsed.wuduReminderEnabled);
        }
        if (parsed.wuduReminderMinutes !== undefined) {
            let m = Number(parsed.wuduReminderMinutes);
            config.wuduReminderMinutes = (!isNaN(m) && m >= 1 && m <= 120) ? m : 15;
        }
        if (typeof parsed.wuduAudioPath === 'string') {
            config.wuduAudioPath = parsed.wuduAudioPath;
        }
    }
    catch (e) {
        log('[SalatExtension Config] Load error: ' + e.message);
    }
    return config;
}
function securePermissions(path, mode) {
    try {
        let f = Gio.File.new_for_path(path);
        f.set_attribute_uint32(Gio.FILE_ATTRIBUTE_UNIX_MODE, mode, Gio.FileQueryInfoFlags.NONE, null);
    }
    catch (e) { }
}
function saveConfig(config) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        if (!GLib.file_test(Constants.CONFIG_DIR, GLib.FileTest.EXISTS)) {
            GLib.mkdir_with_parents(Constants.CONFIG_DIR, 0o700);
        }
        securePermissions(Constants.CONFIG_DIR, 0o700);
        let data = JSON.stringify({
            cityId: config.city.id,
            cityName: config.city.name,
            lang: config.lang,
            iqamaDelays: config.iqamaDelays,
            lockEnabled: (_a = config.lockEnabled) !== null && _a !== void 0 ? _a : false,
            customLockCommand: (_b = config.customLockCommand) !== null && _b !== void 0 ? _b : '',
            adhanAudioPath: (_c = config.adhanAudioPath) !== null && _c !== void 0 ? _c : '',
            duaaAfterAdhan: (_d = config.duaaAfterAdhan) !== null && _d !== void 0 ? _d : true,
            duaaAudioPath: (_e = config.duaaAudioPath) !== null && _e !== void 0 ? _e : '',
            fridayReminderEnabled: (_f = config.fridayReminderEnabled) !== null && _f !== void 0 ? _f : true,
            fridayReminderMinutes: (_g = config.fridayReminderMinutes) !== null && _g !== void 0 ? _g : 60,
            wuduReminderEnabled: (_h = config.wuduReminderEnabled) !== null && _h !== void 0 ? _h : true,
            wuduReminderMinutes: (_j = config.wuduReminderMinutes) !== null && _j !== void 0 ? _j : 15,
            wuduAudioPath: (_k = config.wuduAudioPath) !== null && _k !== void 0 ? _k : ''
        }, null, 2);
        GLib.file_set_contents(Constants.CONFIG_FILE, new TextEncoder().encode(data));
        securePermissions(Constants.CONFIG_FILE, 0o600);
        log('[SalatExtension Config] Saved config successfully to ' + Constants.CONFIG_FILE);
    }
    catch (e) {
        log('[SalatExtension Config] Save error: ' + e.message);
    }
}
function setupConfigMonitor(onConfigChanged) {
    try {
        if (!GLib.file_test(Constants.CONFIG_DIR, GLib.FileTest.EXISTS)) {
            GLib.mkdir_with_parents(Constants.CONFIG_DIR, 0o700);
        }
        securePermissions(Constants.CONFIG_DIR, 0o700);
        let dir = Gio.File.new_for_path(Constants.CONFIG_DIR);
        let monitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        monitor.connect('changed', (_mon, file, otherFile, eventType) => {
            let fName = file ? file.get_basename() : '';
            let oName = otherFile ? otherFile.get_basename() : '';
            let isConfigFile = (fName && fName.startsWith('config.')) || (oName && oName.startsWith('config.'));
            if (isConfigFile && (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT || eventType === Gio.FileMonitorEvent.CREATED || eventType === Gio.FileMonitorEvent.CHANGED)) {
                log(`[SalatExtension Config] Config file changed on disk: file=${fName}, otherFile=${oName}`);
                onConfigChanged();
            }
        });
        return monitor;
    }
    catch (e) {
        log('[SalatExtension Config] Monitor error: ' + e.message);
        return null;
    }
}
