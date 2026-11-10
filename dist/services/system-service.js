var GLib = imports.gi.GLib;
var { findExtensionFile } = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['file-utils'];
var { EXTENSION_UUID } = imports.misc.extensionUtils.getCurrentExtension().imports['core']['constants'];
function runFtLock(config) {
    if (!config || !config.lockEnabled) {
        log('[SalatExtension SystemService] Lock feature disabled in settings. Skipping lock.');
        return;
    }
    log('[SalatExtension SystemService] 🔒 Iqama finished! Triggering screen lock...');
    try {
        if (config.customLockCommand && config.customLockCommand.trim().length > 0) {
            GLib.spawn_command_line_async(config.customLockCommand.trim());
            return;
        }
        if (GLib.find_program_in_path('ft_lock')) {
            GLib.spawn_command_line_async('ft_lock');
        }
        else if (GLib.file_test('/usr/share/42/ft_lock', GLib.FileTest.IS_EXECUTABLE)) {
            GLib.spawn_command_line_async('/usr/share/42/ft_lock');
        }
        else if (GLib.file_test('/usr/local/bin/ft_lock', GLib.FileTest.IS_EXECUTABLE)) {
            GLib.spawn_command_line_async('/usr/local/bin/ft_lock');
        }
        else {
            log('[SalatExtension SystemService] ft_lock executable not found on system.');
        }
    }
    catch (e) {
        log('[SalatExtension SystemService] Error executing lock: ' + e.message);
    }
}
function openScheduleWindow(dir, path) {
    log('[SalatExtension SystemService] 📅 Launching dedicated monthly schedule window...');
    const script = findExtensionFile('schedule_window.py', dir, path);
    if (script) {
        GLib.spawn_command_line_async(`python3 "${script}"`);
    }
    else {
        GLib.spawn_command_line_async(`python3 -m salat_schedule 2>/dev/null || gnome-extensions prefs ${EXTENSION_UUID}`);
    }
}
function openPreferences() {
    try {
        GLib.spawn_command_line_async(`gnome-extensions prefs ${EXTENSION_UUID}`);
    }
    catch (e) {
        log('[SalatExtension SystemService] Failed to open prefs: ' + e.message);
    }
}
