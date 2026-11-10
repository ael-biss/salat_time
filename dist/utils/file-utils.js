var GLib = imports.gi.GLib;
var Gio = imports.gi.Gio;
var { EXTENSION_UUID } = imports.misc.extensionUtils.getCurrentExtension().imports['core']['constants'];
function securePermissions(path, mode) {
    try {
        let f = Gio.File.new_for_path(path);
        f.set_attribute_uint32(Gio.FILE_ATTRIBUTE_UNIX_MODE, mode, Gio.FileQueryInfoFlags.NONE, null);
    }
    catch (e) { }
}
function findExtensionFile(filename, dir, path) {
    try {
        if (dir) {
            let f = dir.get_child(filename);
            if (f.query_exists(null))
                return f.get_path();
        }
        if (path) {
            let p = GLib.build_filenamev([path, filename]);
            if (GLib.file_test(p, GLib.FileTest.EXISTS))
                return p;
        }
        // Standard extension installed directory
        let extPath = GLib.build_filenamev([
            GLib.get_home_dir(),
            '.local',
            'share',
            'gnome-shell',
            'extensions',
            EXTENSION_UUID,
            filename
        ]);
        if (GLib.file_test(extPath, GLib.FileTest.EXISTS))
            return extPath;
        // Current working directory
        let cur = GLib.build_filenamev([GLib.get_current_dir(), filename]);
        if (GLib.file_test(cur, GLib.FileTest.EXISTS))
            return cur;
        // src/ subfolder
        let srcCur = GLib.build_filenamev([GLib.get_current_dir(), 'src', filename]);
        if (GLib.file_test(srcCur, GLib.FileTest.EXISTS))
            return srcCur;
    }
    catch (e) {
        log(`[SalatExtension FileUtils] Error finding file ${filename}: ${e.message}`);
    }
    return null;
}
function findExtensionGioFile(filename, dir, path) {
    try {
        if (dir) {
            let f = dir.get_child(filename);
            if (f.query_exists(null))
                return f;
        }
        if (path) {
            let p = GLib.build_filenamev([path, filename]);
            let f = Gio.File.new_for_path(p);
            if (f.query_exists(null))
                return f;
        }
        let filePath = findExtensionFile(filename, dir, path);
        if (filePath) {
            return Gio.File.new_for_path(filePath);
        }
    }
    catch (e) {
        log(`[SalatExtension FileUtils] Error creating Gio.File for ${filename}: ${e.message}`);
    }
    return null;
}
