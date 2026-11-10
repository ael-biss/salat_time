/// <reference path="../types.d.ts" />
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { EXTENSION_UUID } from '../core/constants.js';

export function securePermissions(path: string, mode: number): void {
    try {
        let f = Gio.File.new_for_path(path);
        f.set_attribute_uint32(Gio.FILE_ATTRIBUTE_UNIX_MODE, mode, Gio.FileQueryInfoFlags.NONE, null);
    } catch (e: any) {}
}

export function findExtensionFile(filename: string, dir?: any, path?: string): string | null {
    try {
        if (dir) {
            let f = dir.get_child(filename);
            if (f.query_exists(null)) return f.get_path();
        }
        if (path) {
            let p = GLib.build_filenamev([path, filename]);
            if (GLib.file_test(p, GLib.FileTest.EXISTS)) return p;
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
        if (GLib.file_test(extPath, GLib.FileTest.EXISTS)) return extPath;

        // Current working directory
        let cur = GLib.build_filenamev([GLib.get_current_dir(), filename]);
        if (GLib.file_test(cur, GLib.FileTest.EXISTS)) return cur;

        // src/ subfolder
        let srcCur = GLib.build_filenamev([GLib.get_current_dir(), 'src', filename]);
        if (GLib.file_test(srcCur, GLib.FileTest.EXISTS)) return srcCur;
    } catch (e: any) {
        log(`[SalatExtension FileUtils] Error finding file ${filename}: ${e.message}`);
    }
    return null;
}

export function findExtensionGioFile(filename: string, dir?: any, path?: string): any {
    try {
        if (dir) {
            let f = dir.get_child(filename);
            if (f.query_exists(null)) return f;
        }
        if (path) {
            let p = GLib.build_filenamev([path, filename]);
            let f = Gio.File.new_for_path(p);
            if (f.query_exists(null)) return f;
        }
        let filePath = findExtensionFile(filename, dir, path);
        if (filePath) {
            return Gio.File.new_for_path(filePath);
        }
    } catch (e: any) {
        log(`[SalatExtension FileUtils] Error creating Gio.File for ${filename}: ${e.message}`);
    }
    return null;
}
