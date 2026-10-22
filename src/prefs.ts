/// <reference path="./types.d.ts" />
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import * as Constants from './constants.js';
import * as Config from './config.js';
import * as I18n from './i18n.js';
import * as Api from './api.js';

function playAudioPreview(path: string): void {
    if (!path) return;
    try {
        let extPath = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'share', 'gnome-shell', 'extensions', 'salat-timer@moroccan-habous', 'play_audio.py']);
        let cur = GLib.build_filenamev([GLib.get_current_dir(), 'play_audio.py']);
        let srcCur = GLib.build_filenamev([GLib.get_current_dir(), 'src', 'play_audio.py']);
        let script = GLib.file_test(extPath, GLib.FileTest.EXISTS) ? extPath : (GLib.file_test(cur, GLib.FileTest.EXISTS) ? cur : (GLib.file_test(srcCur, GLib.FileTest.EXISTS) ? srcCur : null));

        if (script) {
            GLib.spawn_command_line_async(`python3 "${script}" "${path}"`);
            return;
        }

        const pyScript = "import gi, sys, os; gi.require_version('Gst', '1.0'); from gi.repository import Gst, GLib; Gst.init(None); p = Gst.ElementFactory.make('playbin', 'p'); p.set_property('uri', GLib.filename_to_uri(os.path.abspath(sys.argv[1]), None)); p.set_state(Gst.State.PLAYING); loop = GLib.MainLoop(); b = p.get_bus(); b.add_watch(GLib.PRIORITY_DEFAULT, lambda bus, msg: loop.quit() if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR) else True); loop.run(); p.set_state(Gst.State.NULL)";
        GLib.spawn_command_line_async(`python3 -c "${pyScript}" "${path}"`);
    } catch (e: any) {
        log('[SalatExtension Prefs] Error in audio test: ' + e.message);
    }
}

function resolveDefaultAdhanPath(): string {
    let cur = GLib.build_filenamev([GLib.get_current_dir(), 'adan.mp3']);
    if (GLib.file_test(cur, GLib.FileTest.EXISTS)) return cur;
    let extPath = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'share', 'gnome-shell', 'extensions', 'salat-timer@moroccan-habous', 'adan.mp3']);
    if (GLib.file_test(extPath, GLib.FileTest.EXISTS)) return extPath;
    return '';
}

function openScheduleDedicatedWindow(): void {
    try {
        let extPath = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'share', 'gnome-shell', 'extensions', 'salat-timer@moroccan-habous', 'schedule_window.py']);
        let cur = GLib.build_filenamev([GLib.get_current_dir(), 'schedule_window.py']);
        let srcCur = GLib.build_filenamev([GLib.get_current_dir(), 'src', 'schedule_window.py']);
        let script = GLib.file_test(extPath, GLib.FileTest.EXISTS) ? extPath : (GLib.file_test(cur, GLib.FileTest.EXISTS) ? cur : (GLib.file_test(srcCur, GLib.FileTest.EXISTS) ? srcCur : null));

        if (script) {
            GLib.spawn_command_line_async(`python3 "${script}"`);
        } else {
            GLib.spawn_command_line_async('python3 -m salat_schedule 2>/dev/null || true');
        }
    } catch (e: any) {
        log('[SalatExtension Prefs] Error opening schedule window: ' + e.message);
    }
}

export default class SalatPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window: any): void {
        let config: UserConfig = Config.loadConfig();

        window.set_default_size(880, 640);

        // Helper to notify user of save action
        const showSavedNotification = () => {
            log('[SalatExtension Prefs] Configuration saved to disk.');
            Config.saveConfig(config);
            if (typeof window.add_toast === 'function') {
                try {
                    window.add_toast(new Adw.Toast({
                        title: I18n.t('prefs_saved_success', config.lang)
                    }));
                } catch (e: any) {}
            }
        };

        const revertToSavedConfig = () => {
            log('[SalatExtension Prefs] Reverting changes to last saved config.');
            config = Config.loadConfig();
            syncWidgetsWithConfig();
            if (typeof window.add_toast === 'function') {
                try {
                    window.add_toast(new Adw.Toast({
                        title: I18n.t('cancel_button', config.lang) + ' - Reverted'
                    }));
                } catch (e: any) {}
            }
        };

        // Shared Actions Row Generator (Cancel and Save & Apply Buttons)
        let actionButtonsList: { cancelBtn: any; saveBtn: any; statusLbl: any }[] = [];
        const createActionsGroup = () => {
            let actionsGroup = new Adw.PreferencesGroup();
            let row = new Adw.ActionRow();

            let statusLbl = new Gtk.Label({
                label: '',
                valign: Gtk.Align.CENTER,
                margin_end: 10
            });
            row.add_suffix(statusLbl);

            let cancelBtn = new Gtk.Button({
                label: I18n.t('cancel_button', config.lang),
                valign: Gtk.Align.CENTER,
                margin_end: 8
            });
            cancelBtn.connect('clicked', () => {
                revertToSavedConfig();
            });
            row.add_suffix(cancelBtn);

            let saveBtn = new Gtk.Button({
                label: I18n.t('save_apply_button', config.lang),
                valign: Gtk.Align.CENTER
            });
            saveBtn.get_style_context().add_class('suggested-action');
            saveBtn.connect('clicked', () => {
                showSavedNotification();
                statusLbl.set_text(I18n.t('prefs_saved_success', config.lang));
            });
            row.add_suffix(saveBtn);

            actionsGroup.add(row);
            actionButtonsList.push({ cancelBtn, saveBtn, statusLbl });
            return actionsGroup;
        };

        // =========================================================================
        // TAB 1: General Settings (City & Language)
        // =========================================================================
        let generalPage = new Adw.PreferencesPage({
            title: GLib.markup_escape_text(I18n.t('tab_general', config.lang), -1),
            icon_name: 'preferences-other-symbolic',
            name: 'general'
        });

        let generalGroup = new Adw.PreferencesGroup();

        let cityRow = new Adw.ComboRow({
            model: Gtk.StringList.new(Constants.CITIES.map((c: City) => c.name)),
            selected: Math.max(0, Constants.CITIES.findIndex((c: City) => c.id === config.city.id))
        });
        cityRow.connect('notify::selected', (widget: any) => {
            let idx = widget.get_selected();
            if (idx >= 0 && idx < Constants.CITIES.length) {
                config.city = Constants.CITIES[idx];
                Config.saveConfig(config);
            }
        });
        generalGroup.add(cityRow);

        let langRow = new Adw.ComboRow({
            model: Gtk.StringList.new(I18n.LANGUAGES.map((l: LanguageOption) => l.name)),
            selected: Math.max(0, I18n.LANGUAGES.findIndex((l: LanguageOption) => l.code === config.lang))
        });
        generalGroup.add(langRow);
        generalPage.add(generalGroup);

        // Friday Jumuaah Reminder Group
        let fridayGroup = new Adw.PreferencesGroup();

        let fridaySwitchRow = new Adw.ActionRow();
        let fridaySwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: config.fridayReminderEnabled !== false
        });
        fridaySwitch.connect('notify::active', (widget: any) => {
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

        let fridayTimeRow: any;
        if (Adw.SpinRow) {
            fridayTimeRow = new Adw.SpinRow({
                subtitle: 'Minutes before Dhuhr',
                adjustment: fridayAdj,
                value: config.fridayReminderMinutes || 60
            });
            fridayTimeRow.connect('notify::value', (widget: any) => {
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
            spin.connect('value-changed', (widget: any) => {
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
        generalPage.add(fridayGroup);

        generalPage.add(createActionsGroup());
        window.add(generalPage);

        // =========================================================================
        // TAB 2: Iqama Delays
        // =========================================================================
        let iqamaPage = new Adw.PreferencesPage({
            title: GLib.markup_escape_text(I18n.t('tab_iqama', config.lang), -1),
            icon_name: 'alarm-symbolic',
            name: 'iqama'
        });

        let iqamaGroup = new Adw.PreferencesGroup();

        const prayerDefs = [
            { key: 'Fajr', i18nKey: 'fajr', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Fajr },
            { key: 'Dhuhr', i18nKey: 'dhuhr', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Dhuhr },
            { key: 'Asr', i18nKey: 'asr', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Asr },
            { key: 'Maghrib', i18nKey: 'maghrib', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Maghrib },
            { key: 'Ishae', i18nKey: 'isha', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Ishae }
        ];

        let prayerRows: { def: any; row: any; spinObj?: any }[] = [];

        prayerDefs.forEach(p => {
            let currentVal = config.iqamaDelays[p.key] || p.defaultVal;
            let adjustment = new Gtk.Adjustment({
                value: currentVal, lower: 1, upper: 60,
                step_increment: 1, page_increment: 5
            });

            let row: any;
            let spinObj: any = null;
            if (Adw.SpinRow) {
                row = new Adw.SpinRow({
                    subtitle: `Default: +${p.defaultVal}m`,
                    adjustment: adjustment,
                    value: currentVal
                });
                row.connect('notify::value', (widget: any) => {
                    let v = widget.get_value();
                    if (v > 0) {
                        config.iqamaDelays[p.key] = v;
                        Config.saveConfig(config);
                    }
                });
                spinObj = row;
            } else {
                row = new Adw.ActionRow({
                    subtitle: `Default: +${p.defaultVal}m`
                });
                let spin = Gtk.SpinButton.new(adjustment, 1, 0);
                spin.valign = Gtk.Align.CENTER;
                spin.set_value(currentVal);
                spin.connect('value-changed', (widget: any) => {
                    let v = widget.get_value_as_int();
                    if (v > 0) {
                        config.iqamaDelays[p.key] = v;
                        Config.saveConfig(config);
                    }
                });
                row.add_suffix(spin);
                row.activatable_widget = spin;
                spinObj = spin;
            }

            iqamaGroup.add(row);
            prayerRows.push({ def: p, row: row, spinObj: spinObj });
        });

        iqamaPage.add(iqamaGroup);
        iqamaPage.add(createActionsGroup());
        window.add(iqamaPage);

        // =========================================================================
        // TAB 3: Adhan & Audio
        // =========================================================================
        let adhanPage = new Adw.PreferencesPage({
            title: GLib.markup_escape_text(I18n.t('tab_adhan', config.lang), -1),
            icon_name: 'audio-volume-high-symbolic',
            name: 'adhan'
        });

        let adhanGroup = new Adw.PreferencesGroup();

        let audioPathRow = new Adw.ActionRow();
        let audioPathEntry = new Gtk.Entry({
            valign: Gtk.Align.CENTER,
            hexpand: true,
            text: config.adhanAudioPath || '',
            placeholder_text: I18n.t('prefs_adhan_default', config.lang)
        });
        audioPathEntry.connect('changed', (widget: any) => {
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
                    transient_for: window,
                    modal: true,
                    action: Gtk.FileChooserAction.OPEN
                });
                let filter = new Gtk.FileFilter();
                filter.set_name('Audio Files (*.mp3, *.wav, *.ogg)');
                filter.add_mime_type('audio/*');
                filter.add_pattern('*.mp3');
                filter.add_pattern('*.wav');
                filter.add_pattern('*.ogg');
                fileChooser.add_filter(filter);

                fileChooser.connect('response', (dialog: any, response_id: number) => {
                    try {
                        if (response_id === Gtk.ResponseType.ACCEPT) {
                            let file = dialog.get_file();
                            if (file) {
                                let path = file.get_path();
                                audioPathEntry.set_text(path);
                                config.adhanAudioPath = path;
                                Config.saveConfig(config);
                            }
                        }
                    } catch (err: any) {
                        log('[SalatExtension Prefs] Error setting adhan audio: ' + err.message);
                    } finally {
                        try { dialog.hide(); } catch (e: any) {}
                        try { dialog.destroy(); } catch (e: any) {}
                    }
                });
                fileChooser.show();
            } catch (e: any) {
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
        adhanPage.add(adhanGroup);
        adhanPage.add(createActionsGroup());
        window.add(adhanPage);

        // =========================================================================
        // TAB 4: Du'aa After Adhan
        // =========================================================================
        let duaaPage = new Adw.PreferencesPage({
            title: GLib.markup_escape_text(I18n.t('tab_duaa', config.lang), -1),
            icon_name: 'dialog-information-symbolic',
            name: 'duaa'
        });

        let duaaGroup = new Adw.PreferencesGroup();

        let duaaSwitchRow = new Adw.ActionRow();
        let duaaSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: config.duaaAfterAdhan !== false
        });
        duaaSwitch.connect('notify::active', (widget: any) => {
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
        duaaAudioEntry.connect('changed', (widget: any) => {
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
                    transient_for: window,
                    modal: true,
                    action: Gtk.FileChooserAction.OPEN
                });
                let filter = new Gtk.FileFilter();
                filter.set_name('Audio Files (*.mp3, *.wav, *.ogg)');
                filter.add_mime_type('audio/*');
                filter.add_pattern('*.mp3');
                filter.add_pattern('*.wav');
                filter.add_pattern('*.ogg');
                fileChooser.add_filter(filter);

                fileChooser.connect('response', (dialog: any, response_id: number) => {
                    try {
                        if (response_id === Gtk.ResponseType.ACCEPT) {
                            let file = dialog.get_file();
                            if (file) {
                                let path = file.get_path();
                                duaaAudioEntry.set_text(path);
                                config.duaaAudioPath = path;
                                Config.saveConfig(config);
                            }
                        }
                    } catch (err: any) {
                        log('[SalatExtension Prefs] Error setting duaa audio: ' + err.message);
                    } finally {
                        try { dialog.hide(); } catch (e: any) {}
                        try { dialog.destroy(); } catch (e: any) {}
                    }
                });
                fileChooser.show();
            } catch (e: any) {
                log('[SalatExtension Prefs] Du\'aa file chooser error: ' + e.message);
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
                log('[SalatExtension Prefs] Du\'aa audio not found: ' + path);
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
        duaaPage.add(duaaGroup);
        duaaPage.add(createActionsGroup());
        window.add(duaaPage);

        // =========================================================================
        // TAB 5: Wudu Reminder
        // =========================================================================
        let wuduPage = new Adw.PreferencesPage({
            title: GLib.markup_escape_text(I18n.t('tab_wudu', config.lang), -1),
            icon_name: 'weather-showers-symbolic',
            name: 'wudu'
        });

        let wuduGroup = new Adw.PreferencesGroup();

        let wuduSwitchRow = new Adw.ActionRow();
        let wuduSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: config.wuduReminderEnabled !== false
        });
        wuduSwitch.connect('notify::active', (widget: any) => {
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

        let wuduTimeRow: any;
        if (Adw.SpinRow) {
            wuduTimeRow = new Adw.SpinRow({
                subtitle: 'Minutes before Adhan',
                adjustment: wuduAdj,
                value: config.wuduReminderMinutes || 15
            });
            wuduTimeRow.connect('notify::value', (widget: any) => {
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
            spin.connect('value-changed', (widget: any) => {
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
        wuduAudioEntry.connect('changed', (widget: any) => {
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
                    transient_for: window,
                    modal: true,
                    action: Gtk.FileChooserAction.OPEN
                });
                let filter = new Gtk.FileFilter();
                filter.set_name('Audio Files (*.mp3, *.wav, *.ogg)');
                filter.add_mime_type('audio/*');
                filter.add_pattern('*.mp3');
                filter.add_pattern('*.wav');
                filter.add_pattern('*.ogg');
                fileChooser.add_filter(filter);

                fileChooser.connect('response', (dialog: any, response_id: number) => {
                    try {
                        if (response_id === Gtk.ResponseType.ACCEPT) {
                            let file = dialog.get_file();
                            if (file) {
                                let path = file.get_path();
                                wuduAudioEntry.set_text(path);
                                config.wuduAudioPath = path;
                                Config.saveConfig(config);
                            }
                        }
                    } catch (err: any) {
                        log('[SalatExtension Prefs] Error setting wudu audio: ' + err.message);
                    } finally {
                        try { dialog.hide(); } catch (e: any) {}
                        try { dialog.destroy(); } catch (e: any) {}
                    }
                });
                fileChooser.show();
            } catch (e: any) {
                log('[SalatExtension Prefs] Wudu file chooser error: ' + e.message);
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
                log('[SalatExtension Prefs] Wudu audio not found: ' + path);
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
        wuduPage.add(wuduGroup);
        wuduPage.add(createActionsGroup());
        window.add(wuduPage);

        // =========================================================================
        // TAB 6: Lock Screen on Iqama
        // =========================================================================
        let lockPage = new Adw.PreferencesPage({
            title: GLib.markup_escape_text(I18n.t('tab_lock', config.lang), -1),
            icon_name: 'system-lock-screen-symbolic',
            name: 'lock'
        });

        let lockGroup = new Adw.PreferencesGroup();

        let lockSwitchRow = new Adw.ActionRow();
        let lockSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: !!config.lockEnabled
        });
        lockSwitch.connect('notify::active', (widget: any) => {
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
        lockCmdEntry.connect('changed', (widget: any) => {
            config.customLockCommand = widget.get_text();
            Config.saveConfig(config);
        });
        lockCmdRow.add_suffix(lockCmdEntry);
        lockGroup.add(lockCmdRow);

        lockPage.add(lockGroup);
        lockPage.add(createActionsGroup());
        window.add(lockPage);

        // =========================================================================
        // TAB 7: Monthly Schedule (Sala Al-Jadida)
        // =========================================================================
        let schedulePage = new Adw.PreferencesPage({
            title: GLib.markup_escape_text(I18n.t('tab_schedule', config.lang), -1),
            icon_name: 'x-office-calendar-symbolic',
            name: 'schedule'
        });

        let scheduleGroup = new Adw.PreferencesGroup();

        let scheduleHeaderRow = new Adw.ActionRow();

        let openDedicatedBtn = new Gtk.Button({
            label: I18n.t('open_schedule_window', config.lang),
            valign: Gtk.Align.CENTER,
            margin_end: 6
        });
        openDedicatedBtn.connect('clicked', () => {
            openScheduleDedicatedWindow();
        });
        scheduleHeaderRow.add_suffix(openDedicatedBtn);

        let refreshScheduleBtn = new Gtk.Button({
            label: I18n.t('prefs_refresh_schedule', config.lang),
            valign: Gtk.Align.CENTER,
            margin_start: 6
        });
        scheduleHeaderRow.add_suffix(refreshScheduleBtn);
        scheduleGroup.add(scheduleHeaderRow);

        let tableBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 6,
            margin_bottom: 6
        });

        let scrolledWindow = new Gtk.ScrolledWindow({
            min_content_height: 380,
            max_content_height: 480,
            propagate_natural_height: false,
            hexpand: true,
            vexpand: true
        });

        let grid = new Gtk.Grid({
            column_spacing: 14,
            row_spacing: 6,
            margin_start: 10,
            margin_end: 10,
            margin_top: 10,
            margin_bottom: 10,
            halign: Gtk.Align.CENTER
        });
        scrolledWindow.set_child(grid);
        tableBox.append(scrolledWindow);
        scheduleGroup.add(tableBox);

        const renderScheduleTable = (schedule: MonthlyScheduleData | null) => {
            while (grid.get_first_child()) {
                grid.remove(grid.get_first_child());
            }

            let lang = config.lang || 'auto';
            if (!schedule || !schedule.days || schedule.days.length === 0) {
                let emptyLabel = new Gtk.Label({
                    label: I18n.t('loading', lang),
                    margin_top: 20,
                    margin_bottom: 20
                });
                grid.attach(emptyLabel, 0, 0, 9, 1);
                scheduleHeaderRow.set_title(I18n.t('prefs_schedule_title', lang));
                scheduleHeaderRow.set_subtitle('Click refresh to load monthly schedule from priere.ma');
                return;
            }

            scheduleHeaderRow.set_title(`${schedule.city_label || 'Sala Al-Jadida'} - ${schedule.hijri_month || ''}`);
            scheduleHeaderRow.set_subtitle(`${schedule.gregorian_period || ''} (${schedule.days_count || schedule.days.length} days)`);

            const colKeys = [
                'col_day', 'col_hijri', 'col_gregorian',
                'col_fajr', 'col_sunrise', 'col_dhuhr',
                'col_asr', 'col_maghrib', 'col_isha'
            ];

            colKeys.forEach((k, colIdx) => {
                let lbl = new Gtk.Label({
                    label: `<b>${I18n.t(k, lang)}</b>`,
                    use_markup: true,
                    halign: Gtk.Align.CENTER
                });
                grid.attach(lbl, colIdx, 0, 1, 1);
            });

            let sep = new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 4, margin_bottom: 4 });
            grid.attach(sep, 0, 1, 9, 1);

            const now = new Date();
            const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            schedule.days.forEach((day: MonthlyScheduleDay, idx: number) => {
                const rowIdx = idx + 2;
                const isToday = !!day.is_today || (day.date === todayIso);
                const isPast = day.date && day.date < todayIso;

                const dayCols = [
                    day.day_ar || '',
                    String(day.hijri_day || ''),
                    day.date ? day.date.slice(5) : String(day.gregorian_day || ''),
                    day.fajr || '',
                    day.sunrise || '',
                    day.dhuhr || '',
                    day.asr || '',
                    day.maghrib || '',
                    day.isha || ''
                ];

                dayCols.forEach((text: string, colIdx: number) => {
                    let label = new Gtk.Label({
                        halign: Gtk.Align.CENTER
                    });

                    if (isToday) {
                        let extra = colIdx === 0 ? ' ★' : '';
                        label.set_markup(`<b><span foreground="#10b981">${text}${extra}</span></b>`);
                    } else if (isPast) {
                        label.set_markup(`<span alpha="55%">${text}</span>`);
                    } else {
                        label.set_text(text);
                    }

                    grid.attach(label, colIdx, rowIdx, 1, 1);
                });
            });
        };

        refreshScheduleBtn.connect('clicked', () => {
            refreshScheduleBtn.set_sensitive(false);
            let session = Api.createSession();
            Api.fetchMonthlySchedule(session, true, (data: MonthlyScheduleData | null) => {
                renderScheduleTable(data);
                refreshScheduleBtn.set_sensitive(true);
            });
        });

        let cachedSchedule = Api.getMonthlySchedule();
        renderScheduleTable(cachedSchedule);
        if (!cachedSchedule) {
            let session = Api.createSession();
            Api.fetchMonthlySchedule(session, false, (data: MonthlyScheduleData | null) => {
                renderScheduleTable(data);
            });
        }

        schedulePage.add(scheduleGroup);
        schedulePage.add(createActionsGroup());
        window.add(schedulePage);

        // =========================================================================
        // Sync Widgets with reloaded/initial config
        // =========================================================================
        const syncWidgetsWithConfig = () => {
            cityRow.set_selected(Math.max(0, Constants.CITIES.findIndex((c: City) => c.id === config.city.id)));
            langRow.set_selected(Math.max(0, I18n.LANGUAGES.findIndex((l: LanguageOption) => l.code === config.lang)));
            fridaySwitch.set_active(config.fridayReminderEnabled !== false);
            if (fridayTimeRow && typeof fridayTimeRow.set_value === 'function') {
                fridayTimeRow.set_value(config.fridayReminderMinutes || 60);
            }
            prayerRows.forEach(item => {
                let v = config.iqamaDelays[item.def.key] || item.def.defaultVal;
                if (item.spinObj && typeof item.spinObj.set_value === 'function') {
                    item.spinObj.set_value(v);
                }
            });
            audioPathEntry.set_text(config.adhanAudioPath || '');
            duaaSwitch.set_active(config.duaaAfterAdhan !== false);
            duaaAudioEntry.set_text(config.duaaAudioPath || '');
            wuduSwitch.set_active(config.wuduReminderEnabled !== false);
            if (wuduTimeRow && typeof wuduTimeRow.set_value === 'function') {
                wuduTimeRow.set_value(config.wuduReminderMinutes || 15);
            }
            wuduAudioEntry.set_text(config.wuduAudioPath || '');
            lockSwitch.set_active(!!config.lockEnabled);
            lockCmdEntry.set_text(config.customLockCommand || '');
            updatePrefsText();
        };

        // =========================================================================
        // Dynamic UI Text Refresh Helper
        // =========================================================================
        const updatePrefsText = () => {
            let lang = config.lang || 'auto';

            generalPage.set_title(GLib.markup_escape_text(I18n.t('tab_general', lang), -1));
            iqamaPage.set_title(GLib.markup_escape_text(I18n.t('tab_iqama', lang), -1));
            adhanPage.set_title(GLib.markup_escape_text(I18n.t('tab_adhan', lang), -1));
            duaaPage.set_title(GLib.markup_escape_text(I18n.t('tab_duaa', lang), -1));
            wuduPage.set_title(GLib.markup_escape_text(I18n.t('tab_wudu', lang), -1));
            lockPage.set_title(GLib.markup_escape_text(I18n.t('tab_lock', lang), -1));
            schedulePage.set_title(GLib.markup_escape_text(I18n.t('tab_schedule', lang), -1));

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

            scheduleGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_schedule_title', lang), -1));
            scheduleGroup.set_description(I18n.t('prefs_schedule_desc', lang));
            openDedicatedBtn.set_label(I18n.t('open_schedule_window', lang));
            refreshScheduleBtn.set_label(I18n.t('prefs_refresh_schedule', lang));
            renderScheduleTable(Api.getMonthlySchedule());

            actionButtonsList.forEach(item => {
                item.cancelBtn.set_label(I18n.t('cancel_button', lang));
                item.saveBtn.set_label(I18n.t('save_apply_button', lang));
            });
        };

        langRow.connect('notify::selected', (widget: any) => {
            let idx = widget.get_selected();
            if (idx >= 0 && idx < I18n.LANGUAGES.length) {
                config.lang = I18n.LANGUAGES[idx].code;
                Config.saveConfig(config);
                updatePrefsText();
            }
        });

        // Initial translation pass
        updatePrefsText();
    }
}
