/// <reference path="./types.d.ts" />
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import * as Constants from './constants.js';
import * as Config from './config.js';
import * as I18n from './i18n.js';

function playAudioPreview(path: string): void {
    if (!path) return;
    try {
        if (GLib.find_program_in_path('cvlc')) {
            GLib.spawn_command_line_async(`cvlc --play-and-exit --no-video "${path}"`);
        } else if (GLib.find_program_in_path('pw-play')) {
            GLib.spawn_command_line_async(`pw-play "${path}"`);
        } else if (GLib.find_program_in_path('paplay')) {
            GLib.spawn_command_line_async(`paplay "${path}"`);
        } else {
            const pyScript = `import gi, sys; gi.require_version('Gst', '1.0'); from gi.repository import Gst, GLib; Gst.init(None); p = Gst.ElementFactory.make('playbin', 'p'); p.set_property('uri', 'file://' + sys.argv[1]); p.set_state(Gst.State.PLAYING); loop = GLib.MainLoop(); b = p.get_bus(); b.add_watch(GLib.PRIORITY_DEFAULT, lambda bus, msg: loop.quit() if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR) else True); loop.run()`;
            GLib.spawn_command_line_async(`python3 -c "${pyScript}" "${path}"`);
        }
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

export default class SalatPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window: any): void {
        let config: UserConfig = Config.loadConfig();

        let prefsPage = new Adw.PreferencesPage();

        // 1. General Settings Group (City & Language)
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

        prefsPage.add(generalGroup);

        // 2. Iqama Delays Group
        let iqamaGroup = new Adw.PreferencesGroup();

        const prayerDefs = [
            { key: 'Fajr', i18nKey: 'fajr', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Fajr },
            { key: 'Dhuhr', i18nKey: 'dhuhr', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Dhuhr },
            { key: 'Asr', i18nKey: 'asr', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Asr },
            { key: 'Maghrib', i18nKey: 'maghrib', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Maghrib },
            { key: 'Ishae', i18nKey: 'isha', defaultVal: Constants.DEFAULT_IQAMA_DELAYS.Ishae }
        ];

        let prayerRows: { def: any; row: any }[] = [];

        prayerDefs.forEach(p => {
            let currentVal = config.iqamaDelays[p.key] || p.defaultVal;
            let adjustment = new Gtk.Adjustment({
                value: currentVal, lower: 1, upper: 60,
                step_increment: 1, page_increment: 5
            });

            let row: any;
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
            }

            iqamaGroup.add(row);
            prayerRows.push({ def: p, row: row });
        });

        prefsPage.add(iqamaGroup);

        // 3. Adhan Audio Group
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
                    if (response_id === Gtk.ResponseType.ACCEPT) {
                        let file = dialog.get_file();
                        if (file) {
                            let path = file.get_path();
                            audioPathEntry.set_text(path);
                            config.adhanAudioPath = path;
                            Config.saveConfig(config);
                        }
                    }
                    dialog.destroy();
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
        prefsPage.add(adhanGroup);

        // 4. Lock Screen Group
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

        prefsPage.add(lockGroup);

        // 5. Save & Apply Actions Group
        let actionsGroup = new Adw.PreferencesGroup();

        let actionRow = new Adw.ActionRow();

        let saveButton = new Gtk.Button({
            valign: Gtk.Align.CENTER
        });

        let statusLabel = new Gtk.Label({
            label: '',
            valign: Gtk.Align.CENTER,
            margin_end: 10
        });

        saveButton.connect('clicked', () => {
            log('[SalatExtension Prefs] Manual Save & Apply clicked.');
            Config.saveConfig(config);
            statusLabel.set_text(I18n.t('prefs_saved_success', config.lang));
        });

        actionRow.add_suffix(statusLabel);
        actionRow.add_suffix(saveButton);
        actionsGroup.add(actionRow);

        prefsPage.add(actionsGroup);

        // Dynamic UI Text Refresh Helper
        const updatePrefsText = () => {
            let lang = config.lang || 'auto';
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

            lockGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_lock_title', lang), -1));
            lockGroup.set_description(I18n.t('prefs_lock_desc', lang));
            lockSwitchRow.set_title(I18n.t('prefs_lock_enable', lang));
            lockSwitchRow.set_subtitle(I18n.t('prefs_lock_enable_sub', lang));
            lockCmdRow.set_title(I18n.t('prefs_lock_cmd', lang));
            lockCmdRow.set_subtitle(I18n.t('prefs_lock_cmd_sub', lang));

            actionsGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_actions_title', lang), -1));
            actionRow.set_title(I18n.t('prefs_actions_title', lang));
            saveButton.set_label(I18n.t('prefs_save_button', lang));
            if (statusLabel.get_text() !== '') {
                statusLabel.set_text(I18n.t('prefs_saved_success', lang));
            }
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

        window.add(prefsPage);
    }
}
