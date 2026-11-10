var I18n = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['i18n'];
var { formatDiff } = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['time-formatter'];
function getPrayerEntries(prayerTimesData, iqamaDelays, currentLang, now) {
    if (!prayerTimesData)
        return [];
    const keys = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Ishae'];
    const i18nKeys = { Fajr: 'fajr', Dhuhr: 'dhuhr', Asr: 'asr', Maghrib: 'maghrib', Ishae: 'isha' };
    return keys.map((key) => {
        const name = I18n.t(i18nKeys[key], currentLang);
        const time = prayerTimesData[key];
        const [h, m] = time.split(':').map(Number);
        const adhanDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
        const delay = iqamaDelays[key] || 15;
        const iqamaDate = new Date(adhanDate.getTime() + delay * 60000);
        return { key, name, time, delay, adhanDate, iqamaDate };
    });
}
function findActivePrayer(prayers, iqamaDelays, now) {
    if (!prayers || prayers.length === 0)
        return null;
    // Check if we are between adhan and iqama
    for (let p of prayers) {
        if (now >= p.adhanDate && now < p.iqamaDate) {
            return { phase: 'IQAMA', prayer: p };
        }
    }
    // Check for next upcoming adhan today
    for (let p of prayers) {
        if (p.adhanDate > now) {
            return { phase: 'NEXT_ADHAN', prayer: p };
        }
    }
    // If past Isha, next is tomorrow's Fajr
    const fajr = prayers[0];
    const [h, m] = fajr.time.split(':').map(Number);
    const tomorrowAdhan = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m, 0);
    const tomorrowIqama = new Date(tomorrowAdhan.getTime() + (iqamaDelays.Fajr || 20) * 60000);
    return {
        phase: 'NEXT_ADHAN',
        prayer: { ...fajr, adhanDate: tomorrowAdhan, iqamaDate: tomorrowIqama }
    };
}
function calculateProgressPercent(active, prayers, now) {
    try {
        let cycleStart = 0;
        let cycleEnd = 0;
        if (active.phase === 'IQAMA') {
            cycleStart = active.prayer.adhanDate.getTime();
            cycleEnd = active.prayer.iqamaDate.getTime();
        }
        else {
            const prayerIdx = prayers.findIndex(p => p.key === active.prayer.key);
            if (prayerIdx > 0) {
                cycleStart = prayers[prayerIdx - 1].iqamaDate.getTime();
            }
            else {
                const fajrTime = active.prayer.adhanDate.getTime();
                cycleStart = fajrTime - (8 * 3600 * 1000);
            }
            cycleEnd = active.prayer.adhanDate.getTime();
        }
        const totalCycle = Math.max(1000, cycleEnd - cycleStart);
        const elapsed = Math.max(0, now.getTime() - cycleStart);
        return Math.min(1.0, Math.max(0.05, elapsed / totalCycle));
    }
    catch (e) {
        return 0.35;
    }
}
