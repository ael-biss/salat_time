#!/usr/bin/env python3
"""
Dedicated robust audio player helper for Moroccan Salat Extension.
Uses GStreamer to play any audio format (MP3, WAV, OGG, AAC, FLAC) asynchronously.
"""

import os
import sys

import gi
gi.require_version('Gst', '1.0')
from gi.repository import GLib, Gst

def main():
    if len(sys.argv) < 2:
        sys.exit(0)

    raw_path = sys.argv[1].strip()
    if not raw_path:
        sys.exit(0)

    path = os.path.abspath(os.path.expanduser(raw_path))
    if not os.path.exists(path):
        print(f"[play_audio] Error: File does not exist: {path}", file=sys.stderr)
        sys.exit(1)

    Gst.init(None)
    player = Gst.ElementFactory.make('playbin', 'salat_player')
    if not player:
        print("[play_audio] Error: Failed to create Gst playbin", file=sys.stderr)
        sys.exit(1)

    uri = GLib.filename_to_uri(path, None)
    player.set_property('uri', uri)

    loop = GLib.MainLoop()
    bus = player.get_bus()

    def on_bus_message(_bus, msg):
        if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR):
            loop.quit()
        return True

    bus.add_watch(GLib.PRIORITY_DEFAULT, on_bus_message)

    ret = player.set_state(Gst.State.PLAYING)
    if ret == Gst.StateChangeReturn.FAILURE:
        print("[play_audio] Error: Failed to set player state to PLAYING", file=sys.stderr)
        sys.exit(1)

    try:
        loop.run()
    except KeyboardInterrupt:
        pass
    finally:
        player.set_state(Gst.State.NULL)


if __name__ == '__main__':
    main()
