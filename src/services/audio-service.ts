/// <reference path="../types.d.ts" />
import GLib from 'gi://GLib';
import { findExtensionFile } from '../utils/file-utils.js';

export function resolveAudioPath(customPath: string | undefined, defaultFilename: string, dir?: any, path?: string): string | null {
    try {
        if (customPath && customPath.trim().length > 0) {
            let p = customPath.trim();
            if (p.startsWith('~')) {
                p = GLib.get_home_dir() + p.slice(1);
            }
            if (GLib.file_test(p, GLib.FileTest.EXISTS)) {
                return p;
            } else {
                log(`[SalatExtension AudioService] Custom audio file not found: ${p}, falling back to default.`);
            }
        }
        return findExtensionFile(defaultFilename, dir, path);
    } catch (e: any) {
        log(`[SalatExtension AudioService] Error resolving audio path for ${defaultFilename}: ${e.message}`);
        return null;
    }
}

export function playAudio(audioPath: string, dir?: any, path?: string): void {
    if (!audioPath) return;

    let targetPath = audioPath.trim();
    if (targetPath.startsWith('~')) {
        targetPath = GLib.get_home_dir() + targetPath.slice(1);
    }

    if (!GLib.file_test(targetPath, GLib.FileTest.EXISTS)) {
        log('[SalatExtension AudioService] Audio file not found: ' + targetPath);
        return;
    }

    log('[SalatExtension AudioService] 🔊 Playing audio: ' + targetPath);

    const helper = findExtensionFile('play_audio.py', dir, path);
    if (helper) {
        GLib.spawn_command_line_async(`python3 "${helper}" "${targetPath}"`);
        return;
    }

    const pyScript = "import gi, sys, os; gi.require_version('Gst', '1.0'); from gi.repository import Gst, GLib; Gst.init(None); p = Gst.ElementFactory.make('playbin', 'p'); p.set_property('uri', GLib.filename_to_uri(os.path.abspath(sys.argv[1]), None)); p.set_state(Gst.State.PLAYING); loop = GLib.MainLoop(); b = p.get_bus(); b.add_watch(GLib.PRIORITY_DEFAULT, lambda bus, msg: loop.quit() if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR) else True); loop.run(); p.set_state(Gst.State.NULL)";
    GLib.spawn_command_line_async(`python3 -c "${pyScript}" "${targetPath}"`);
}

export function playSystemSound(soundName: string = 'message-new-instant'): void {
    try {
        if (GLib.find_program_in_path('canberra-gtk-play')) {
            GLib.spawn_command_line_async(`canberra-gtk-play -i ${soundName}`);
        }
    } catch (e: any) {}
}
