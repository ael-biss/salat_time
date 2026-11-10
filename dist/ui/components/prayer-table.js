var Clutter = imports.gi.Clutter;
var St = imports.gi.St;
var PopupMenu = imports.ui.popupMenu;
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
function createTableHeader() {
    let tableHeaderItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    tableHeaderItem.set_style('padding: 0px; margin: 0px;');
    let tableHeaderBox = new St.BoxLayout({
        style_class: 'salat-table-header',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER
    });
    let headerNameSpacer = new St.BoxLayout({ width: 110 });
    tableHeaderBox.add_child(headerNameSpacer);
    let tableSpacer1 = new St.BoxLayout({ x_expand: true });
    tableHeaderBox.add_child(tableSpacer1);
    let adhanColLabel = new St.Label({
        text: 'ADHAN',
        style_class: 'salat-table-header',
        y_align: Clutter.ActorAlign.CENTER
    });
    tableHeaderBox.add_child(adhanColLabel);
    let colGap = new St.BoxLayout({ width: 35 });
    tableHeaderBox.add_child(colGap);
    let iqamaColLabel = new St.Label({
        text: 'IQAMA',
        style_class: 'salat-table-header',
        y_align: Clutter.ActorAlign.CENTER
    });
    tableHeaderBox.add_child(iqamaColLabel);
    let badgeSpacer = new St.BoxLayout({ width: 45 });
    tableHeaderBox.add_child(badgeSpacer);
    addActor(tableHeaderItem, tableHeaderBox);
    return tableHeaderItem;
}
function createPrayerRow(p, isActive, isPassed, wuduDone) {
    let prayerItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    prayerItem.set_style('padding: 0px; margin: 0px;');
    let rowBox = new St.BoxLayout({
        style_class: isActive ? 'salat-prayer-row-active' : 'salat-prayer-row',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER
    });
    // Left: icon + name
    let leftBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER });
    if (isActive) {
        let dot = new St.Label({
            text: '• ',
            style_class: 'salat-prayer-name-active',
            y_align: Clutter.ActorAlign.CENTER
        });
        leftBox.add_child(dot);
        let nameLbl = new St.Label({
            text: p.name + (wuduDone ? ' 💧' : ''),
            style_class: 'salat-prayer-name-active',
            y_align: Clutter.ActorAlign.CENTER
        });
        leftBox.add_child(nameLbl);
    }
    else {
        if (isPassed) {
            let check = new St.Label({
                text: '✓ ',
                style_class: 'salat-prayer-check',
                y_align: Clutter.ActorAlign.CENTER
            });
            leftBox.add_child(check);
        }
        else {
            let emptyPrefix = new St.Label({
                text: '   ',
                style_class: 'salat-prayer-name',
                y_align: Clutter.ActorAlign.CENTER
            });
            leftBox.add_child(emptyPrefix);
        }
        let nameLbl = new St.Label({
            text: p.name,
            style_class: 'salat-prayer-name',
            y_align: Clutter.ActorAlign.CENTER
        });
        leftBox.add_child(nameLbl);
    }
    rowBox.add_child(leftBox);
    let rowSpacer = new St.BoxLayout({ x_expand: true });
    rowBox.add_child(rowSpacer);
    // Middle: Adhan Time
    let adhanLbl = new St.Label({
        text: p.time,
        style_class: isActive ? 'salat-prayer-time-active' : 'salat-prayer-time-adhan',
        y_align: Clutter.ActorAlign.CENTER
    });
    rowBox.add_child(adhanLbl);
    let timeGap = new St.BoxLayout({ width: 30 });
    rowBox.add_child(timeGap);
    // Right: Iqama Time + Pill
    const iqH = String(p.iqamaDate.getHours()).padStart(2, '0');
    const iqM = String(p.iqamaDate.getMinutes()).padStart(2, '0');
    let iqamaLbl = new St.Label({
        text: `${iqH}:${iqM}`,
        style_class: isActive ? 'salat-prayer-time-active' : 'salat-prayer-time-iqama',
        y_align: Clutter.ActorAlign.CENTER
    });
    rowBox.add_child(iqamaLbl);
    let pillGap = new St.BoxLayout({ width: 8 });
    rowBox.add_child(pillGap);
    let pill = new St.Label({
        text: `+${p.delay}m`,
        style_class: isActive ? 'salat-prayer-pill-active' : 'salat-prayer-pill',
        y_align: Clutter.ActorAlign.CENTER
    });
    rowBox.add_child(pill);
    addActor(prayerItem, rowBox);
    return prayerItem;
}
function createPrayerTable(prayers, active, now, wuduDone) {
    const items = [];
    items.push(createTableHeader());
    for (let p of prayers) {
        let isActive = !!active && active.prayer.key === p.key;
        let isPassed = now.getTime() >= p.adhanDate.getTime() && !isActive;
        items.push(createPrayerRow(p, isActive, isPassed, wuduDone));
    }
    return items;
}
