var Clutter = imports.gi.Clutter;
var St = imports.gi.St;
var PopupMenu = imports.ui.popupMenu;
var I18n = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['i18n'];
function addActor(container, child) {
    if (typeof container.add_child === 'function') {
        container.add_child(child);
    }
    else if (typeof container.add === 'function') {
        container.add(child);
    }
    else if (container.actor && typeof container.actor.add_child === 'function') {
        container.actor.add_child(child);
    }
}
function createSeparator() {
    return new PopupMenu.PopupSeparatorMenuItem();
}
function createWuduCard(wuduDone, activePrayerName, lang, onActivate) {
    let wuduItem = new PopupMenu.PopupBaseMenuItem({ reactive: true, can_focus: true });
    wuduItem.set_style('padding: 0px; margin: 0px;');
    let wuduCard = new St.BoxLayout({
        style_class: 'salat-action-card',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER
    });
    let wuduIconBox = new St.BoxLayout({
        style_class: 'salat-card-icon-box',
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER
    });
    let wuduIcon = new St.Label({ text: '💧', style_class: 'salat-card-icon-text' });
    wuduIconBox.add_child(wuduIcon);
    wuduCard.add_child(wuduIconBox);
    let wuduSpacer = new St.BoxLayout({ width: 14 });
    wuduCard.add_child(wuduSpacer);
    let wuduTextCol = new St.BoxLayout({
        vertical: true,
        x_expand: true
    });
    let wuduTitleLbl = new St.Label({
        text: wuduDone ? I18n.t('wudu_active', lang) : I18n.t('quick_wudu', lang),
        style_class: 'salat-card-title'
    });
    let wuduSubLbl = new St.Label({
        text: wuduDone
            ? I18n.t('wudu_marked_body', lang, { prayer: activePrayerName })
            : 'Alert 10 min before each adhan',
        style_class: 'salat-card-subtitle'
    });
    wuduTextCol.add_child(wuduTitleLbl);
    wuduTextCol.add_child(wuduSubLbl);
    wuduCard.add_child(wuduTextCol);
    let wuduArrow = new St.Label({
        text: wuduDone ? '✓' : '›',
        style_class: 'salat-card-arrow',
        y_align: Clutter.ActorAlign.CENTER
    });
    wuduCard.add_child(wuduArrow);
    if (onActivate) {
        wuduItem.connect('activate', onActivate);
    }
    addActor(wuduItem, wuduCard);
    return wuduItem;
}
function createScheduleCard(now, lang, onActivate) {
    let scheduleItem = new PopupMenu.PopupBaseMenuItem({ reactive: true, can_focus: true });
    scheduleItem.set_style('padding: 0px; margin: 0px;');
    let scheduleCard = new St.BoxLayout({
        style_class: 'salat-action-card',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER
    });
    let schedIconBox = new St.BoxLayout({
        style_class: 'salat-card-icon-box',
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER
    });
    let schedIcon = new St.Label({ text: '📅', style_class: 'salat-card-icon-text' });
    schedIconBox.add_child(schedIcon);
    scheduleCard.add_child(schedIconBox);
    let schedSpacer = new St.BoxLayout({ width: 14 });
    scheduleCard.add_child(schedSpacer);
    let schedTextCol = new St.BoxLayout({
        vertical: true,
        x_expand: true
    });
    let schedTitleLbl = new St.Label({
        text: I18n.t('prefs_schedule_tab', lang),
        style_class: 'salat-card-title'
    });
    const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let schedSubLbl = new St.Label({
        text: `${monthNamesEn[now.getMonth()]} ${now.getFullYear()}`,
        style_class: 'salat-card-subtitle'
    });
    schedTextCol.add_child(schedTitleLbl);
    schedTextCol.add_child(schedSubLbl);
    scheduleCard.add_child(schedTextCol);
    let schedArrow = new St.Label({
        text: '›',
        style_class: 'salat-card-arrow',
        y_align: Clutter.ActorAlign.CENTER
    });
    scheduleCard.add_child(schedArrow);
    if (onActivate) {
        scheduleItem.connect('activate', onActivate);
    }
    addActor(scheduleItem, scheduleCard);
    return scheduleItem;
}
function createLockCard(lockEnabled, lang, onToggle) {
    let lockCardItem = new PopupMenu.PopupBaseMenuItem({ reactive: true, can_focus: true });
    lockCardItem.set_style('padding: 0px; margin: 0px;');
    let lockCard = new St.BoxLayout({
        style_class: 'salat-action-card',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER
    });
    let lockIconBox = new St.BoxLayout({
        style_class: 'salat-card-icon-box',
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER
    });
    let lockIcon = new St.Label({ text: '🔒', style_class: 'salat-card-icon-text' });
    lockIconBox.add_child(lockIcon);
    lockCard.add_child(lockIconBox);
    let lockSpacer = new St.BoxLayout({ width: 14 });
    lockCard.add_child(lockSpacer);
    let lockTextCol = new St.BoxLayout({
        vertical: true,
        x_expand: true
    });
    let lockTitleLbl = new St.Label({
        text: I18n.t('lock_screen', lang),
        style_class: 'salat-card-title'
    });
    let lockSubLbl = new St.Label({
        text: 'Locks the screen so everyone can pray',
        style_class: 'salat-card-subtitle'
    });
    lockTextCol.add_child(lockTitleLbl);
    lockTextCol.add_child(lockSubLbl);
    lockCard.add_child(lockTextCol);
    let lockSwitch = new PopupMenu.Switch(!!lockEnabled);
    lockCard.add_child(lockSwitch);
    lockCardItem.connect('activate', () => {
        lockSwitch.toggle();
        if (onToggle) {
            onToggle(lockSwitch.state);
        }
    });
    addActor(lockCardItem, lockCard);
    return lockCardItem;
}
function createSettingsButton(lang, onActivate) {
    let settingsItem = new PopupMenu.PopupBaseMenuItem({ reactive: true, can_focus: true });
    settingsItem.set_style('padding: 0px; margin: 0px;');
    let settingsBtnBox = new St.BoxLayout({
        style_class: 'salat-settings-btn',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER
    });
    let settingsBtnLabel = new St.Label({
        text: '⚙ ' + I18n.t('open_settings', lang),
        style_class: 'salat-settings-btn-label',
        y_align: Clutter.ActorAlign.CENTER
    });
    settingsBtnBox.add_child(settingsBtnLabel);
    if (onActivate) {
        settingsItem.connect('activate', onActivate);
    }
    addActor(settingsItem, settingsBtnBox);
    return settingsItem;
}
