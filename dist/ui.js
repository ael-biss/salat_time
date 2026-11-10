var Calculator = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['calculator'];
var I18n = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['i18n'];
var { formatHeroCountdown, formatHeaderDate } = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['time-formatter'];
var { updateHeroCard } = imports.misc.extensionUtils.getCurrentExtension().imports['ui']['components']['hero-card'];
var { buildPopupMenu } = imports.misc.extensionUtils.getCurrentExtension().imports['ui']['containers']['popup-menu'];

var { calculateProgressPercent } = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['calculator'];
function updatePanelText(indicator, prayerTimesData, iqamaDelays, currentLang, wuduDone = false) {
    if (!prayerTimesData || !indicator)
        return;
    if (typeof indicator.updatePanelText === 'function') {
        indicator.updatePanelText(prayerTimesData, iqamaDelays, currentLang, wuduDone);
        return;
    }
    if (!indicator.buttonText)
        return;
    const now = new Date();
    const prayers = Calculator.getPrayerEntries(prayerTimesData, iqamaDelays, currentLang, now);
    const active = Calculator.findActivePrayer(prayers, iqamaDelays, now);
    if (!active)
        return;
    const wuduBadge = wuduDone ? ' 💧' : '';
    if (active.phase === 'IQAMA') {
        const diff = active.prayer.iqamaDate.getTime() - now.getTime();
        indicator.buttonText.set_text(I18n.t('iqama_in', currentLang, {
            prayer: active.prayer.name,
            time: Calculator.formatDiff(diff)
        }) + wuduBadge);
    }
    else {
        const diff = active.prayer.adhanDate.getTime() - now.getTime();
        indicator.buttonText.set_text(I18n.t('adhan_in', currentLang, {
            prayer: active.prayer.name,
            time: Calculator.formatDiff(diff)
        }) + wuduBadge);
    }
}
function updateMenuHero(indicator, config, prayerTimesData, now) {
    if (!prayerTimesData || !indicator)
        return;
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
function rebuildMenu(indicator, config, prayerTimesData, callbacks, wuduDone = false) {
    if (!prayerTimesData || !indicator)
        return;
    if (typeof indicator.rebuildMenu === 'function') {
        indicator.rebuildMenu(config, prayerTimesData, callbacks, wuduDone);
        return;
    }
    const menu = indicator.menu;
    if (!menu)
        return;
    indicator._reloadCallback = callbacks && typeof callbacks.onReloadUI === 'function' ? callbacks.onReloadUI : null;
    indicator._heroWidgets = buildPopupMenu(menu, config, prayerTimesData, callbacks, wuduDone);
}
