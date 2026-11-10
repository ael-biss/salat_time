var Clutter = imports.gi.Clutter;
var Gio = imports.gi.Gio;
var St = imports.gi.St;
var Main = imports.ui.main;
var PanelMenu = imports.ui.panelMenu;
var Calculator = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['calculator'];
var I18n = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['i18n'];
var { findExtensionGioFile } = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['file-utils'];
var { STATUS_AREA_ROLE } = imports.misc.extensionUtils.getCurrentExtension().imports['core']['constants'];
var { updateHeroCard } = imports.misc.extensionUtils.getCurrentExtension().imports['ui']['components']['hero-card'];
var { buildPopupMenu } = imports.misc.extensionUtils.getCurrentExtension().imports['ui']['containers']['popup-menu'];
var SalatIndicator = class SalatIndicator {
    constructor(dir, path) {
        this.button = null;
        this.buttonText = null;
        this.icon = null;
        this.menuSignalId = 0;
        this.heroWidgets = null;
        this.dir = null;
        this.path = '';
        this.dir = dir;
        this.path = path || '';
        this.buildUI();
    }
    buildUI() {
        this.button = new PanelMenu.Button(0.0, "Salat & Iqama Indicator", false);
        let box = new St.BoxLayout({
            style_class: 'panel-status-indicators-box',
            y_align: Clutter.ActorAlign.CENTER
        });
        let iconFile = findExtensionGioFile('mosque_pic.svg', this.dir, this.path);
        if (iconFile) {
            let gicon = Gio.FileIcon.new(iconFile);
            this.icon = new St.Icon({
                gicon: gicon,
                style_class: 'system-status-icon',
                icon_size: 16
            });
            box.add_child(this.icon);
        }
        this.buttonText = new St.Label({
            text: I18n.t('loading', 'auto'),
            y_align: Clutter.ActorAlign.CENTER
        });
        box.add_child(this.buttonText);
        this.button.add_child(box);
    }
    addToStatusArea() {
        try {
            SalatIndicator.destroyOldStatusAreaRole();
            Main.panel.addToStatusArea(STATUS_AREA_ROLE, this.button, 0, 'right');
            log('[SalatExtension Indicator] Added indicator to statusArea with role ' + STATUS_AREA_ROLE);
        }
        catch (e) {
            log('[SalatExtension Indicator] addToStatusArea exception: ' + e.message + ', using fallback role.');
            let fallbackRole = STATUS_AREA_ROLE + '-' + Date.now();
            Main.panel.addToStatusArea(fallbackRole, this.button, 0, 'right');
            log('[SalatExtension Indicator] Added indicator with fallback role: ' + fallbackRole);
        }
    }
    static destroyOldStatusAreaRole() {
        try {
            if (Main.panel.statusArea[STATUS_AREA_ROLE]) {
                log('[SalatExtension Indicator] Cleaning up pre-existing statusArea entry...');
                Main.panel.statusArea[STATUS_AREA_ROLE].destroy();
            }
        }
        catch (e) {
            log('[SalatExtension Indicator] Note on statusArea cleanup: ' + e.message);
        }
    }
    connectMenuOpen(onOpen) {
        if (!this.button || !this.button.menu)
            return;
        if (this.menuSignalId) {
            this.button.menu.disconnect(this.menuSignalId);
            this.menuSignalId = 0;
        }
        this.menuSignalId = this.button.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen) {
                onOpen();
            }
        });
    }
    updatePanelText(prayerTimesData, iqamaDelays, currentLang, wuduDone = false) {
        if (!prayerTimesData || !this.buttonText)
            return;
        const now = new Date();
        const prayers = Calculator.getPrayerEntries(prayerTimesData, iqamaDelays, currentLang, now);
        const active = Calculator.findActivePrayer(prayers, iqamaDelays, now);
        if (!active)
            return;
        const wuduBadge = wuduDone ? ' 💧' : '';
        if (active.phase === 'IQAMA') {
            const diff = active.prayer.iqamaDate.getTime() - now.getTime();
            this.buttonText.set_text(I18n.t('iqama_in', currentLang, {
                prayer: active.prayer.name,
                time: Calculator.formatDiff(diff)
            }) + wuduBadge);
        }
        else {
            const diff = active.prayer.adhanDate.getTime() - now.getTime();
            this.buttonText.set_text(I18n.t('adhan_in', currentLang, {
                prayer: active.prayer.name,
                time: Calculator.formatDiff(diff)
            }) + wuduBadge);
        }
    }
    rebuildMenu(config, prayerTimesData, callbacks, wuduDone, monthlySchedule) {
        if (!this.button || !this.button.menu)
            return;
        this.heroWidgets = buildPopupMenu(this.button.menu, config, prayerTimesData, callbacks, wuduDone, monthlySchedule);
    }
    updateHero(config, prayerTimesData, now, onNeedsRebuild, monthlySchedule) {
        if (this.heroWidgets) {
            updateHeroCard(this.heroWidgets, config, prayerTimesData, now, onNeedsRebuild, monthlySchedule);
        }
    }
    isMenuOpen() {
        return !!(this.button && this.button.menu && this.button.menu.isOpen);
    }
    destroy() {
        if (this.menuSignalId && this.button && this.button.menu) {
            this.button.menu.disconnect(this.menuSignalId);
            this.menuSignalId = 0;
        }
        if (this.button) {
            this.button.destroy();
            this.button = null;
        }
        this.buttonText = null;
        this.icon = null;
        this.heroWidgets = null;
    }
}
