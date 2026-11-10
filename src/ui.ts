/// <reference path="./types.d.ts" />
import * as Calculator from './utils/calculator.js';
import * as I18n from './utils/i18n.js';
import { formatHeroCountdown, formatHeaderDate } from './utils/time-formatter.js';
import { updateHeroCard } from './ui/components/hero-card.js';
import { buildPopupMenu } from './ui/containers/popup-menu.js';

export { formatHeroCountdown, formatHeaderDate };
export { calculateProgressPercent } from './utils/calculator.js';

export function updatePanelText(
    indicator: any,
    prayerTimesData: PrayerTimesData | null,
    iqamaDelays: IqamaDelays,
    currentLang: string,
    wuduDone: boolean = false
): void {
    if (!prayerTimesData || !indicator) return;

    if (typeof indicator.updatePanelText === 'function') {
        indicator.updatePanelText(prayerTimesData, iqamaDelays, currentLang, wuduDone);
        return;
    }

    if (!indicator.buttonText) return;

    const now = new Date();
    const prayers = Calculator.getPrayerEntries(prayerTimesData, iqamaDelays, currentLang, now);
    const active = Calculator.findActivePrayer(prayers, iqamaDelays, now);
    if (!active) return;

    const wuduBadge = wuduDone ? ' 💧' : '';

    if (active.phase === 'IQAMA') {
        const diff = active.prayer.iqamaDate.getTime() - now.getTime();
        indicator.buttonText.set_text(I18n.t('iqama_in', currentLang, {
            prayer: active.prayer.name,
            time: Calculator.formatDiff(diff)
        }) + wuduBadge);
    } else {
        const diff = active.prayer.adhanDate.getTime() - now.getTime();
        indicator.buttonText.set_text(I18n.t('adhan_in', currentLang, {
            prayer: active.prayer.name,
            time: Calculator.formatDiff(diff)
        }) + wuduBadge);
    }
}

export function updateMenuHero(
    indicator: any,
    config: UserConfig,
    prayerTimesData: PrayerTimesData | null,
    now: Date
): void {
    if (!prayerTimesData || !indicator) return;

    if (typeof indicator.updateHero === 'function') {
        indicator.updateHero(config, prayerTimesData, now);
        return;
    }

    if (indicator._heroWidgets) {
        updateHeroCard(indicator._heroWidgets, config, prayerTimesData, now, () => {
            if (typeof indicator._reloadCallback === 'function') {
                indicator._reloadCallback();
            }
        });
    }
}

export function rebuildMenu(
    indicator: any,
    config: UserConfig,
    prayerTimesData: PrayerTimesData | null,
    callbacks: any,
    wuduDone: boolean = false
): void {
    if (!prayerTimesData || !indicator) return;

    if (typeof indicator.rebuildMenu === 'function') {
        indicator.rebuildMenu(config, prayerTimesData, callbacks, wuduDone);
        return;
    }

    const menu = indicator.menu;
    if (!menu) return;

    indicator._reloadCallback = callbacks && typeof callbacks.onReloadUI === 'function' ? callbacks.onReloadUI : null;
    indicator._heroWidgets = buildPopupMenu(menu, config, prayerTimesData, callbacks, wuduDone);
}
