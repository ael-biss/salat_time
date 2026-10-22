
var GLib = imports.gi.GLib;
var PopupMenu = imports.ui.popupMenu;
var Calculator = imports.misc.extensionUtils.getCurrentExtension().imports.calculator;
var Config = imports.misc.extensionUtils.getCurrentExtension().imports.config;
var I18n = imports.misc.extensionUtils.getCurrentExtension().imports.i18n;
function updatePanelText(indicator, prayerTimesData, iqamaDelays, currentLang) {
    if (!prayerTimesData || !indicator)
        return;
    const now = new Date();
    const prayers = Calculator.getPrayerEntries(prayerTimesData, iqamaDelays, currentLang, now);
    const active = Calculator.findActivePrayer(prayers, iqamaDelays, now);
    if (!active)
        return;
    if (active.phase === 'IQAMA') {
        const diff = active.prayer.iqamaDate.getTime() - now.getTime();
        indicator.buttonText.set_text(I18n.t('iqama_in', currentLang, {
            prayer: active.prayer.name,
            time: Calculator.formatDiff(diff)
        }));
    }
    else {
        const diff = active.prayer.adhanDate.getTime() - now.getTime();
        indicator.buttonText.set_text(I18n.t('adhan_in', currentLang, {
            prayer: active.prayer.name,
            time: Calculator.formatDiff(diff)
        }));
    }
}
// rebuildMenu rebuilds the menu of the indicator based on the current prayer times and user configuration.
// It displays the prayer times, highlights the active prayer, and provides a link to open the settings window.
function rebuildMenu(indicator, config, prayerTimesData, callbacks) {
    if (!prayerTimesData || !indicator)
        return;
    const now = new Date();
    const prayers = Calculator.getPrayerEntries(prayerTimesData, config.iqamaDelays, config.lang, now);
    const active = Calculator.findActivePrayer(prayers, config.iqamaDelays, now);
    indicator.menu.removeAll();
    // 1. Header
    indicator.menu.addMenuItem(new PopupMenu.PopupMenuItem(I18n.t('official_header', config.lang, { city: config.city.name }), { reactive: false }));
    indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    // 2. Prayer times list
    let adhanWord = I18n.t('adhan', config.lang);
    let iqamaWord = I18n.t('iqama', config.lang);
    for (let p of prayers) {
        let isActive = !!active && active.prayer.key === p.key;
        let prefix = '   ';
        if (isActive && active.phase === 'IQAMA')
            prefix = ' ';
        else if (isActive && active.phase === 'NEXT_ADHAN')
            prefix = '▶ ';
        const iqamaH = String(p.iqamaDate.getHours()).padStart(2, '0');
        const iqamaM = String(p.iqamaDate.getMinutes()).padStart(2, '0');
        let itemText = `${prefix}${p.name.padEnd(8, ' ')} ${adhanWord}: ${p.time}   ${iqamaWord}: ${iqamaH}:${iqamaM} (+${p.delay}m)`;
        indicator.menu.addMenuItem(new PopupMenu.PopupMenuItem(itemText));
    }
    indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    // 3. Quick toggle for Screen Lock on Iqama
    let lockLabel = I18n.t('lock_screen', config.lang);
    let lockSwitchItem = new PopupMenu.PopupSwitchMenuItem(lockLabel, !!config.lockEnabled);
    lockSwitchItem.connect('toggled', (item) => {
        config.lockEnabled = item.state;
        if (callbacks && typeof callbacks.onToggleLock === 'function') {
            callbacks.onToggleLock(item.state);
        }
        else {
            Config.saveConfig(config);
        }
    });
    indicator.menu.addMenuItem(lockSwitchItem);
    // 4. Settings window launcher
    let openPrefsItem = new PopupMenu.PopupMenuItem(I18n.t('open_settings', config.lang));
    openPrefsItem.connect('activate', () => {
        try {
            GLib.spawn_command_line_async('gnome-extensions prefs salat-timer@moroccan-habous');
        }
        catch (e) {
            log('[SalatExtension UI] Failed to open prefs: ' + e.message);
        }
    });
    indicator.menu.addMenuItem(openPrefsItem);
}
