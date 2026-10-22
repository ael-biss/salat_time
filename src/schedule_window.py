#!/usr/bin/env python3
"""
Standalone Prayer Times Schedule Window for Moroccan Salat Extension.
Opens a dedicated clean window showing the full monthly schedule table
completely independent of the extension settings.
"""

import datetime
import json
import os
import sys

import gi
gi.require_version('Gtk', '4.0')
from gi.repository import GLib, Gtk, Gio

CACHE_PATH = os.path.expanduser('~/.config/salat-gnome-extension/cache.json')
CONFIG_PATH = os.path.expanduser('~/.config/salat-gnome-extension/config.json')


def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def load_schedule():
    if os.path.exists(CACHE_PATH):
        try:
            with open(CACHE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if 'monthlySchedule' in data:
                    return data['monthlySchedule']
        except Exception:
            pass
    return None


class ScheduleWindow(Gtk.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app, title="Horaires de Prière - Sala Al-Jadida")
        self.set_default_size(780, 560)

        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        main_box.set_margin_top(16)
        main_box.set_margin_bottom(16)
        main_box.set_margin_start(16)
        main_box.set_margin_end(16)
        self.set_child(main_box)

        # Header bar
        header_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        self.title_label = Gtk.Label(halign=Gtk.Align.START, hexpand=True)
        self.subtitle_label = Gtk.Label(halign=Gtk.Align.START)

        title_col = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        title_col.append(self.title_label)
        title_col.append(self.subtitle_label)
        header_box.append(title_col)

        refresh_btn = Gtk.Button(label="🔄 Actualiser / Refresh")
        refresh_btn.set_valign(Gtk.Align.CENTER)
        refresh_btn.connect('clicked', self.on_refresh_clicked)
        header_box.append(refresh_btn)

        main_box.append(header_box)

        # Scrolled window with grid
        scrolled = Gtk.ScrolledWindow(vexpand=True, hexpand=True)
        self.grid = Gtk.Grid(
            column_spacing=14,
            row_spacing=8,
            margin_top=10,
            margin_bottom=10,
            margin_start=10,
            margin_end=10,
            halign=Gtk.Align.CENTER
        )
        scrolled.set_child(self.grid)
        main_box.append(scrolled)

        self.populate_table()

    def populate_table(self):
        # Clear existing children
        while self.grid.get_first_child():
            self.grid.remove(self.grid.get_first_child())

        schedule = load_schedule()
        if not schedule or not schedule.get('days'):
            self.title_label.set_markup("<b><span size='large'>Horaire de Prière</span></b>")
            self.subtitle_label.set_text("Aucune donnée enregistrée dans le cache. Cliquez sur Actualiser.")
            empty_lbl = Gtk.Label(label="Chargement des données...", margin_top=20)
            self.grid.attach(empty_lbl, 0, 0, 9, 1)
            return

        city_label = schedule.get('city_label', 'Sala Al-Jadida')
        hijri_month = schedule.get('hijri_month', '')
        greg_period = schedule.get('gregorian_period', '')
        count = schedule.get('days_count', len(schedule['days']))

        self.title_label.set_markup(f"<b><span size='large'>🕌 {city_label} - {hijri_month}</span></b>")
        self.subtitle_label.set_markup(f"<span alpha='70%'>{greg_period} • {count} jours (priere.ma)</span>")

        headers = ["اليوم", "هجري", "التاريخ", "الصبح", "الشروق", "الظهر", "العصر", "المغرب", "العشاء"]
        for idx, h in enumerate(headers):
            lbl = Gtk.Label(halign=Gtk.Align.CENTER)
            lbl.set_markup(f"<b><span foreground='#10b981'>{h}</span></b>")
            self.grid.attach(lbl, idx, 0, 1, 1)

        sep = Gtk.Separator(orientation=Gtk.Orientation.HORIZONTAL)
        sep.set_margin_top(4)
        sep.set_margin_bottom(4)
        self.grid.attach(sep, 0, 1, 9, 1)

        today_iso = datetime.date.today().isoformat()

        for idx, day in enumerate(schedule['days']):
            row_idx = idx + 2
            is_today = day.get('is_today', False) or day.get('date') == today_iso
            is_past = day.get('date', '') < today_iso if day.get('date') else False

            date_str = day['date'][5:] if day.get('date') else str(day.get('gregorian_day', ''))
            cols = [
                day.get('day_ar', ''),
                str(day.get('hijri_day', '')),
                date_str,
                day.get('fajr', ''),
                day.get('sunrise', ''),
                day.get('dhuhr', ''),
                day.get('asr', ''),
                day.get('maghrib', ''),
                day.get('isha', '')
            ]

            for col_idx, text in enumerate(cols):
                lbl = Gtk.Label(halign=Gtk.Align.CENTER)
                if is_today:
                    extra = " ★" if col_idx == 0 else ""
                    lbl.set_markup(f"<b><span foreground='#10b981'>{text}{extra}</span></b>")
                elif is_past:
                    lbl.set_markup(f"<span alpha='55%'>{text}</span>")
                else:
                    lbl.set_text(text)
                self.grid.attach(lbl, col_idx, row_idx, 1, 1)

    def on_refresh_clicked(self, btn):
        btn.set_sensitive(False)
        try:
            import urllib.request
            url = "https://small-morning-6206.abdo-bissari.workers.dev/api/sala-al-jadida/month.json"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                if data and 'days' in data:
                    cache_data = {}
                    if os.path.exists(CACHE_PATH):
                        with open(CACHE_PATH, 'r', encoding='utf-8') as f:
                            cache_data = json.load(f)
                    cache_data['monthlySchedule'] = data
                    cache_data.setdefault('lastSyncTimes', {})['sala_al_jadida_month'] = int(datetime.datetime.now().timestamp() * 1000)
                    with open(CACHE_PATH, 'w', encoding='utf-8') as f:
                        json.dump(cache_data, f, indent=2, ensure_ascii=False)
                    self.populate_table()
        except Exception as e:
            print("Error refreshing:", e)
        finally:
            btn.set_sensitive(True)


class ScheduleApp(Gtk.Application):
    def __init__(self):
        super().__init__(
            application_id='org.gnome.SalatTimer.ScheduleWindow',
            flags=Gio.ApplicationFlags.NON_UNIQUE
        )

    def do_activate(self):
        win = ScheduleWindow(self)
        win.present()


def main():
    app = ScheduleApp()
    app.run(sys.argv)


if __name__ == '__main__':
    main()
