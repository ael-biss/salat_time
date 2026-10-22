var { Adw, Gtk, GLib } = imports.gi;
var ExtensionUtils = imports.misc.extensionUtils;

function _getPrefsModules() {
    const Me = ExtensionUtils.getCurrentExtension();
    return {
        Constants: Me.imports.constants,
        Config: Me.imports.config,
        I18n: Me.imports.i18n,
        Api: Me.imports.api
    };
}

function playAudioPreview(path) {
    if (!path) return;
    try {
        if (GLib.find_program_in_path('cvlc')) {
            GLib.spawn_command_line_async('cvlc --play-and-exit --no-video "' + path + '"');
        } else if (GLib.find_program_in_path('pw-play')) {
            GLib.spawn_command_line_async('pw-play "' + path + '"');
        } else if (GLib.find_program_in_path('paplay')) {
            GLib.spawn_command_line_async('paplay "' + path + '"');
        } else {
            const pyScript = 'import gi, sys; gi.require_version("Gst", "1.0"); from gi.repository import Gst, GLib; Gst.init(None); p = Gst.ElementFactory.make("playbin", "p"); p.set_property("uri", "file://" + sys.argv[1]); p.set_state(Gst.State.PLAYING); loop = GLib.MainLoop(); b = p.get_bus(); b.add_watch(GLib.PRIORITY_DEFAULT, lambda bus, msg: loop.quit() if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR) else True); loop.run()';
            GLib.spawn_command_line_async('python3 -c "' + pyScript + '" "' + path + '"');
        }
    } catch (e) {
        log('[SalatExtension Prefs] Error in audio test: ' + e.message);
    }
}

function resolveDefaultAdhanPath() {
    let cur = GLib.build_filenamev([GLib.get_current_dir(), 'adan.mp3']);
    if (GLib.file_test(cur, GLib.FileTest.EXISTS)) return cur;
    let extPath = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'share', 'gnome-shell', 'extensions', 'salat-timer@moroccan-habous', 'adan.mp3']);
    if (GLib.file_test(extPath, GLib.FileTest.EXISTS)) return extPath;
    return '';
}

function init(metadata) {}

function buildPrefsWidget() {
    const { Constants, Config, I18n, Api } = _getPrefsModules();

    let config = Config.loadConfig();
    let prefsPage = new Adw.PreferencesPage();

    // 1. General Settings Group (City & Language)
    let generalGroup = new Adw.PreferencesGroup();

    let cityRow = new Adw.ComboRow({
        model: Gtk.StringList.new(Constants.CITIES.map((c) => c.name)),
        selected: Math.max(0, Constants.CITIES.findIndex((c) => c.id === config.city.id))
    });
    cityRow.connect('notify::selected', (widget) => {
        let idx = widget.get_selected();
        if (idx >= 0 && idx < Constants.CITIES.length) {
            config.city = Constants.CITIES[idx];
            Config.saveConfig(config);
        }
    });
    generalGroup.add(cityRow);

    let langRow = new Adw.ComboRow({
        model: Gtk.StringList.new(I18n.LANGUAGES.map((l) => l.name)),
        selected: Math.max(0, I18n.LANGUAGES.findIndex((l) => l.code === config.lang))
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

    let prayerRows = [];

    prayerDefs.forEach(p => {
        let currentVal = config.iqamaDelays[p.key] || p.defaultVal;
        let adjustment = new Gtk.Adjustment({
            value: currentVal, lower: 1, upper: 60,
            step_increment: 1, page_increment: 5
        });

        let row;
        if (Adw.SpinRow) {
            row = new Adw.SpinRow({
                subtitle: `Default: +${p.defaultVal}m`,
                adjustment: adjustment,
                value: currentVal
            });
            row.connect('notify::value', (widget) => {
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
            spin.connect('value-changed', (widget) => {
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
    audioPathEntry.connect('changed', (widget) => {
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
                action: Gtk.FileChooserAction.OPEN
            });
            let filter = new Gtk.FileFilter();
            filter.set_name('Audio Files (*.mp3, *.wav, *.ogg)');
            filter.add_mime_type('audio/*');
            filter.add_pattern('*.mp3');
            filter.add_pattern('*.wav');
            filter.add_pattern('*.ogg');
            fileChooser.add_filter(filter);

            fileChooser.connect('response', (dialog, response_id) => {
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
        } catch (e) {
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

    // 4. Du'aa After Adhan Group
    let duaaGroup = new Adw.PreferencesGroup();

    let duaaSwitchRow = new Adw.ActionRow();
    let duaaSwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: config.duaaAfterAdhan !== false
    });
    duaaSwitch.connect('notify::active', (widget) => {
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
    duaaAudioEntry.connect('changed', (widget) => {
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
                action: Gtk.FileChooserAction.OPEN
            });
            let filter = new Gtk.FileFilter();
            filter.set_name('Audio Files (*.mp3, *.wav, *.ogg)');
            filter.add_mime_type('audio/*');
            filter.add_pattern('*.mp3');
            filter.add_pattern('*.wav');
            filter.add_pattern('*.ogg');
            fileChooser.add_filter(filter);

            fileChooser.connect('response', (dialog, response_id) => {
                if (response_id === Gtk.ResponseType.ACCEPT) {
                    let file = dialog.get_file();
                    if (file) {
                        let path = file.get_path();
                        duaaAudioEntry.set_text(path);
                        config.duaaAudioPath = path;
                        Config.saveConfig(config);
                    }
                }
                dialog.destroy();
            });
            fileChooser.show();
        } catch (e) {
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
    prefsPage.add(duaaGroup);

    // 5. Friday Jumuaah Reminder Group
    let fridayGroup = new Adw.PreferencesGroup();

    let fridaySwitchRow = new Adw.ActionRow();
    let fridaySwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: config.fridayReminderEnabled !== false
    });
    fridaySwitch.connect('notify::active', (widget) => {
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

    let fridayTimeRow;
    if (Adw.SpinRow) {
        fridayTimeRow = new Adw.SpinRow({
            subtitle: 'Minutes before Dhuhr',
            adjustment: fridayAdj,
            value: config.fridayReminderMinutes || 60
        });
        fridayTimeRow.connect('notify::value', (widget) => {
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
        spin.connect('value-changed', (widget) => {
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
    prefsPage.add(fridayGroup);

    // 6. Wudu Reminder Group
    let wuduGroup = new Adw.PreferencesGroup();

    let wuduSwitchRow = new Adw.ActionRow();
    let wuduSwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: config.wuduReminderEnabled !== false
    });
    wuduSwitch.connect('notify::active', (widget) => {
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

    let wuduTimeRow;
    if (Adw.SpinRow) {
        wuduTimeRow = new Adw.SpinRow({
            subtitle: 'Minutes before Adhan',
            adjustment: wuduAdj,
            value: config.wuduReminderMinutes || 15
        });
        wuduTimeRow.connect('notify::value', (widget) => {
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
        spin.connect('value-changed', (widget) => {
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
    wuduAudioEntry.connect('changed', (widget) => {
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
                action: Gtk.FileChooserAction.OPEN
            });
            let filter = new Gtk.FileFilter();
            filter.set_name('Audio Files (*.mp3, *.wav, *.ogg)');
            filter.add_mime_type('audio/*');
            filter.add_pattern('*.mp3');
            filter.add_pattern('*.wav');
            filter.add_pattern('*.ogg');
            fileChooser.add_filter(filter);

            fileChooser.connect('response', (dialog, response_id) => {
                if (response_id === Gtk.ResponseType.ACCEPT) {
                    let file = dialog.get_file();
                    if (file) {
                        let path = file.get_path();
                        wuduAudioEntry.set_text(path);
                        config.wuduAudioPath = path;
                        Config.saveConfig(config);
                    }
                }
                dialog.destroy();
            });
            fileChooser.show();
        } catch (e) {
            log("[SalatExtension Prefs] Wudu file chooser error: " + e.message);
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
            log("[SalatExtension Prefs] Wudu audio not found: " + path);
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
    prefsPage.add(wuduGroup);

    // 7. Lock Screen Group
    let lockGroup = new Adw.PreferencesGroup();

    let lockSwitchRow = new Adw.ActionRow();
    let lockSwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: !!config.lockEnabled
    });
    lockSwitch.connect('notify::active', (widget) => {
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
    lockCmdEntry.connect('changed', (widget) => {
        config.customLockCommand = widget.get_text();
        Config.saveConfig(config);
    });
    lockCmdRow.add_suffix(lockCmdEntry);
    lockGroup.add(lockCmdRow);

    prefsPage.add(lockGroup);

    // 7. Save & Apply Actions Group
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

        actionsGroup.set_title(GLib.markup_escape_text(I18n.t('prefs_actions_title', lang), -1));
        actionRow.set_title(I18n.t('prefs_actions_title', lang));
        saveButton.set_label(I18n.t('prefs_save_button', lang));
        if (statusLabel.get_text() !== '') {
            statusLabel.set_text(I18n.t('prefs_saved_success', lang));
        }
    };

    langRow.connect('notify::selected', (widget) => {
        let idx = widget.get_selected();
        if (idx >= 0 && idx < I18n.LANGUAGES.length) {
            config.lang = I18n.LANGUAGES[idx].code;
            Config.saveConfig(config);
            updatePrefsText();
        }
    });

    updatePrefsText();
    return prefsPage;
}
