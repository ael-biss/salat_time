/// <reference path="../../types.d.ts" />
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Calculator from '../../utils/calculator.js';
import { formatHeaderDate } from '../../utils/time-formatter.js';
import { createHeroCard, HeroCardWidgets } from '../components/hero-card.js';
import { createPrayerTable } from '../components/prayer-table.js';
import {
    createSeparator,
    createWuduCard,
    createScheduleCard,
    createLockCard,
    createSettingsButton
} from '../components/action-cards.js';

function addActor(container: any, child: any): void {
    if (typeof container.add_child === 'function') {
        container.add_child(child);
    } else if (typeof container.add === 'function') {
        container.add(child);
    } else if (container.actor && typeof container.actor.add_child === 'function') {
        container.actor.add_child(child);
    }
}

export interface MenuCallbacks {
    onSelectCity?: (city: City) => void;
    onSelectLang?: (langCode: string) => void;
    onSetIqamaDelay?: (prayerKey: string, minutes: number) => void;
    onResetIqamaDefaults?: () => void;
    onToggleLock?: (enabled: boolean) => void;
    onQuickWudu?: () => void;
    onOpenScheduleWindow?: () => void;
    onOpenSettings?: () => void;
    onReloadUI?: () => void;
}

export function createHeaderRow(now: Date, lang: string, cityName: string, monthlySchedule?: MonthlyScheduleData | null): { item: any; dateLabel: any } {
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

export function buildPopupMenu(
    menu: any,
    config: UserConfig,
    prayerTimesData: PrayerTimesData,
    callbacks: MenuCallbacks,
    wuduDone: boolean,
    monthlySchedule?: MonthlyScheduleData | null
): HeroCardWidgets | null {
    menu.removeAll();

    const now = new Date();
    const prayers: PrayerEntry[] = Calculator.getPrayerEntries(prayerTimesData, config.iqamaDelays, config.lang, now);
    const active: ActivePrayer | null = Calculator.findActivePrayer(prayers, config.iqamaDelays, now);

    // 1. Top Header Row
    const cityName = config.city ? config.city.name : 'Sala Al Jadida';
    const { item: headerItem, dateLabel } = createHeaderRow(now, config.lang, cityName, monthlySchedule);
    menu.addMenuItem(headerItem);

    // 2. Hero Next Prayer Card
    let heroWidgets: HeroCardWidgets | null = null;
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
        if (callbacks.onQuickWudu) callbacks.onQuickWudu();
    }));

    menu.addMenuItem(createScheduleCard(now, config.lang, () => {
        if (callbacks.onOpenScheduleWindow) callbacks.onOpenScheduleWindow();
    }));

    menu.addMenuItem(createLockCard(!!config.lockEnabled, config.lang, (state: boolean) => {
        if (callbacks.onToggleLock) callbacks.onToggleLock(state);
    }));

    menu.addMenuItem(createSettingsButton(config.lang, () => {
        if (callbacks.onOpenSettings) callbacks.onOpenSettings();
    }));

    return heroWidgets;
}
