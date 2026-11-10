var Clutter = imports.gi.Clutter;
var St = imports.gi.St;
var PopupMenu = imports.ui.popupMenu;
var Calculator = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['calculator'];
var { formatHeaderDate } = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['time-formatter'];
var { createHeroCard } = imports.misc.extensionUtils.getCurrentExtension().imports['ui']['components']['hero-card'];
var { createPrayerTable } = imports.misc.extensionUtils.getCurrentExtension().imports['ui']['components']['prayer-table'];
var { createSeparator, createWuduCard, createScheduleCard, createLockCard, createSettingsButton } = imports.misc.extensionUtils.getCurrentExtension().imports['ui']['components']['action-cards'];
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
function createHeaderRow(now, lang, cityName, monthlySchedule) {
    let headerItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    headerItem.set_style('padding: 0px; margin: 0px;');
    let headerBox = new St.BoxLayout({
        style_class: 'salat-header-row',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER
    });
    let cityLabel = new St.Label({
        text: '📍 ' + (cityName || 'Sala Al Jadida'),
        style_class: 'salat-header-city',
        y_align: Clutter.ActorAlign.CENTER
    });
    headerBox.add_child(cityLabel);
    let headerSpacer = new St.BoxLayout({ x_expand: true });
    headerBox.add_child(headerSpacer);
    let dateText = formatHeaderDate(now, lang, monthlySchedule);
    let dateLabel = new St.Label({
        text: dateText,
        style_class: 'salat-header-date',
        y_align: Clutter.ActorAlign.CENTER
    });
    headerBox.add_child(dateLabel);
    addActor(headerItem, headerBox);
    return { item: headerItem, dateLabel };
}
function buildPopupMenu(menu, config, prayerTimesData, callbacks, wuduDone, monthlySchedule) {
    menu.removeAll();
    const now = new Date();
    const prayers = Calculator.getPrayerEntries(prayerTimesData, config.iqamaDelays, config.lang, now);
    const active = Calculator.findActivePrayer(prayers, config.iqamaDelays, now);
    // 1. Top Header Row
    const cityName = config.city ? config.city.name : 'Sala Al Jadida';
    const { item: headerItem, dateLabel } = createHeaderRow(now, config.lang, cityName, monthlySchedule);
    menu.addMenuItem(headerItem);
    // 2. Hero Next Prayer Card
    let heroWidgets = null;
    if (active) {
        const { menuItem: heroItem, widgets } = createHeroCard(active, prayers, now);
        widgets.dateLabel = dateLabel;
        heroWidgets = widgets;
        menu.addMenuItem(heroItem);
    }
    // 3. Table Column Headers & Prayer Rows
    const tableItems = createPrayerTable(prayers, active, now, wuduDone);
    for (let item of tableItems) {
        menu.addMenuItem(item);
    }
    // 4. Separator
    menu.addMenuItem(createSeparator());
    // 5. Action Cards
    const activePrayerName = active ? active.prayer.name : '';
    menu.addMenuItem(createWuduCard(wuduDone, activePrayerName, config.lang, () => {
        if (callbacks.onQuickWudu)
            callbacks.onQuickWudu();
    }));
    menu.addMenuItem(createScheduleCard(now, config.lang, () => {
        if (callbacks.onOpenScheduleWindow)
            callbacks.onOpenScheduleWindow();
    }));
    menu.addMenuItem(createLockCard(!!config.lockEnabled, config.lang, (state) => {
        if (callbacks.onToggleLock)
            callbacks.onToggleLock(state);
    }));
    menu.addMenuItem(createSettingsButton(config.lang, () => {
        if (callbacks.onOpenSettings)
            callbacks.onOpenSettings();
    }));
    return heroWidgets;
}
