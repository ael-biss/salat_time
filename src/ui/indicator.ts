/// <reference path="../types.d.ts" />
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Calculator from '../utils/calculator.js';
import * as I18n from '../utils/i18n.js';
import { findExtensionGioFile } from '../utils/file-utils.js';
import { STATUS_AREA_ROLE } from '../core/constants.js';
import { HeroCardWidgets, updateHeroCard } from './components/hero-card.js';
import { buildPopupMenu, MenuCallbacks } from './containers/popup-menu.js';

export class SalatIndicator {
    public button: any = null;
    public buttonText: any = null;
    public icon: any = null;
    private menuSignalId: number = 0;
    private heroWidgets: HeroCardWidgets | null = null;
    private dir: any = null;
    private path: string = '';

    constructor(dir?: any, path?: string) {
        this.dir = dir;
        this.path = path || '';
        this.buildUI();
    }

    private buildUI(): void {
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

    public addToStatusArea(): void {
        try {
            SalatIndicator.destroyOldStatusAreaRole();
            Main.panel.addToStatusArea(STATUS_AREA_ROLE, this.button, 0, 'right');
            log('[SalatExtension Indicator] Added indicator to statusArea with role ' + STATUS_AREA_ROLE);
        } catch (e: any) {
            log('[SalatExtension Indicator] addToStatusArea exception: ' + e.message + ', using fallback role.');
            let fallbackRole = STATUS_AREA_ROLE + '-' + Date.now();
            Main.panel.addToStatusArea(fallbackRole, this.button, 0, 'right');
            log('[SalatExtension Indicator] Added indicator with fallback role: ' + fallbackRole);
        }
    }

    public static destroyOldStatusAreaRole(): void {
        try {
            if (Main.panel.statusArea[STATUS_AREA_ROLE]) {
                log('[SalatExtension Indicator] Cleaning up pre-existing statusArea entry...');
                Main.panel.statusArea[STATUS_AREA_ROLE].destroy();
            }
        } catch (e: any) {
            log('[SalatExtension Indicator] Note on statusArea cleanup: ' + e.message);
        }
    }

    public connectMenuOpen(onOpen: () => void): void {
        if (!this.button || !this.button.menu) return;
        if (this.menuSignalId) {
            this.button.menu.disconnect(this.menuSignalId);
            this.menuSignalId = 0;
        }
        this.menuSignalId = this.button.menu.connect('open-state-changed', (_menu: any, isOpen: boolean) => {
            if (isOpen) {
                onOpen();
            }
        });
    }

    public updatePanelText(prayerTimesData: PrayerTimesData | null, iqamaDelays: IqamaDelays, currentLang: string, wuduDone: boolean = false): void {
        if (!prayerTimesData || !this.buttonText) return;

        const now = new Date();
        const prayers = Calculator.getPrayerEntries(prayerTimesData, iqamaDelays, currentLang, now);
        const active = Calculator.findActivePrayer(prayers, iqamaDelays, now);
        if (!active) return;

        const wuduBadge = wuduDone ? ' 💧' : '';

        if (active.phase === 'IQAMA') {
            const diff = active.prayer.iqamaDate.getTime() - now.getTime();
            this.buttonText.set_text(I18n.t('iqama_in', currentLang, {
                prayer: active.prayer.name,
                time: Calculator.formatDiff(diff)
            }) + wuduBadge);
        } else {
            const diff = active.prayer.adhanDate.getTime() - now.getTime();
            this.buttonText.set_text(I18n.t('adhan_in', currentLang, {
                prayer: active.prayer.name,
                time: Calculator.formatDiff(diff)
            }) + wuduBadge);
        }
    }

    public rebuildMenu(
        config: UserConfig,
        prayerTimesData: PrayerTimesData,
        callbacks: MenuCallbacks,
        wuduDone: boolean,
        monthlySchedule?: MonthlyScheduleData | null
    ): void {
        if (!this.button || !this.button.menu) return;
        this.heroWidgets = buildPopupMenu(this.button.menu, config, prayerTimesData, callbacks, wuduDone, monthlySchedule);
    }

    public updateHero(
        config: UserConfig,
        prayerTimesData: PrayerTimesData,
        now: Date,
        onNeedsRebuild?: () => void,
        monthlySchedule?: MonthlyScheduleData | null
    ): void {
        if (this.heroWidgets) {
            updateHeroCard(this.heroWidgets, config, prayerTimesData, now, onNeedsRebuild, monthlySchedule);
        }
    }

    public isMenuOpen(): boolean {
        return !!(this.button && this.button.menu && this.button.menu.isOpen);
    }

    public destroy(): void {
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
