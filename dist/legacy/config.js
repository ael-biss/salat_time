
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
        adhanAudioPath: ''
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
    }
    catch (e) {
        log('[SalatExtension Config] Load error: ' + e.message);
    }
    return config;
}
function saveConfig(config) {
    try {
        if (!GLib.file_test(Constants.CONFIG_DIR, GLib.FileTest.EXISTS)) {
            GLib.mkdir_with_parents(Constants.CONFIG_DIR, 0o755);
        }
        let data = JSON.stringify({
            cityId: config.city.id,
            cityName: config.city.name,
            lang: config.lang,
            iqamaDelays: config.iqamaDelays,
            lockEnabled: config.lockEnabled ?? false,
            customLockCommand: config.customLockCommand ?? '',
            adhanAudioPath: config.adhanAudioPath ?? ''
        }, null, 2);
        GLib.file_set_contents(Constants.CONFIG_FILE, new TextEncoder().encode(data));
        log('[SalatExtension Config] Saved config successfully to ' + Constants.CONFIG_FILE);
    }
    catch (e) {
        log('[SalatExtension Config] Save error: ' + e.message);
    }
}
function setupConfigMonitor(onConfigChanged) {
    try {
        if (!GLib.file_test(Constants.CONFIG_DIR, GLib.FileTest.EXISTS)) {
            GLib.mkdir_with_parents(Constants.CONFIG_DIR, 0o755);
        }
        let dir = Gio.File.new_for_path(Constants.CONFIG_DIR);
        let monitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        monitor.connect('changed', (_mon, file, otherFile, eventType) => {
            let fName = file ? file.get_basename() : '';
            let oName = otherFile ? otherFile.get_basename() : '';
            log(`[SalatExtension Config] Directory monitor event: file=${fName}, otherFile=${oName}, event=${eventType}`);
            if (fName.includes('config') || oName.includes('config') || eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT || eventType === Gio.FileMonitorEvent.CREATED) {
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
