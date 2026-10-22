/// <reference path="./types.d.ts" />
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Calculator from './calculator.js';
import * as Config from './config.js';
import * as I18n from './i18n.js';
import * as Api from './api.js';

function addChild(container: any, child: any): void {
    if (typeof container.add_child === 'function') {
        container.add_child(child);
    } else if (typeof container.add === 'function') {
        container.add(child);
    } else if (container.actor && typeof container.actor.add_child === 'function') {
        container.actor.add_child(child);
    }
}

function formatHeaderDate(now: Date, lang: string): string {
    const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysFr = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const daysAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthsFr = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'];

    let dayName = daysEn[now.getDay()];
    let monthName = monthsEn[now.getMonth()];
    if (lang === 'fr') {
        dayName = daysFr[now.getDay()];
        monthName = monthsFr[now.getMonth()];
    } else if (lang === 'ar') {
        dayName = daysAr[now.getDay()];
        monthName = monthsAr[now.getMonth()];
    }

    const gregDate = `${dayName} ${now.getDate()} ${monthName}`;

    let hijriStr = '';
    const monthly = Api.getMonthlySchedule();
    if (monthly) {
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const found = Array.isArray(monthly.days) ? monthly.days.find((d: any) => d.date === todayIso || d.is_today) : null;
        if (found && found.hijri_day) {
            hijriStr = `${found.hijri_day} ${monthly.hijri_month || ''}`.trim();
        } else if (monthly.hijri_month) {
            hijriStr = monthly.hijri_month;
        }
    }

    if (hijriStr) {
        return `${gregDate} · ${hijriStr}`;
    }
    return gregDate;
}

export function updatePanelText(indicator: any, prayerTimesData: PrayerTimesData | null, iqamaDelays: IqamaDelays, currentLang: string, wuduDone: boolean = false): void {
    if (!prayerTimesData || !indicator) return;

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

export function rebuildMenu(indicator: any, config: UserConfig, prayerTimesData: PrayerTimesData | null, callbacks: any, wuduDone: boolean = false): void {
    if (!prayerTimesData || !indicator) return;

    const now = new Date();
    const prayers: PrayerEntry[] = Calculator.getPrayerEntries(prayerTimesData, config.iqamaDelays, config.lang, now);
    const active: ActivePrayer | null = Calculator.findActivePrayer(prayers, config.iqamaDelays, now);

    indicator.menu.removeAll();

    // 1. Top Header Row: 📍 Salé Al Jadida              Thu 22 Oct · 11 Rabi' II
    let headerItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    headerItem.set_style('padding: 0px; margin: 0px;');
    let headerBox = new St.BoxLayout({
        style_class: 'salat-header-row',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER
    });

    let cityTitle = config.city ? config.city.name : 'Salé Al Jadida';
    let cityLabel = new St.Label({
        text: '📍 ' + cityTitle,
        style_class: 'salat-header-city',
        y_align: Clutter.ActorAlign.CENTER
    });
    headerBox.add_child(cityLabel);

    let headerSpacer = new St.BoxLayout({ x_expand: true });
    headerBox.add_child(headerSpacer);

    let dateText = formatHeaderDate(now, config.lang);
    let dateLabel = new St.Label({
        text: dateText,
        style_class: 'salat-header-date',
        y_align: Clutter.ActorAlign.CENTER
    });
    headerBox.add_child(dateLabel);

    addChild(headerItem, headerBox);
    indicator.menu.addMenuItem(headerItem);

    // 2. Hero Next Prayer Card (Gradient Card)
    if (active) {
        let heroItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        heroItem.set_style('padding: 0px; margin: 0px;');
        let heroBox = new St.BoxLayout({
            style_class: 'salat-hero-card',
            vertical: true,
            x_expand: true
        });

        // Top line of Hero: NEXT · FAJR · TOMORROW (left) and Adhan/Iqama times (right)
        let heroTopRow = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        const isTomorrow = active.prayer.adhanDate.getDate() !== now.getDate();
        const nextTargetWord = isTomorrow ? 'TOMORROW' : 'TODAY';
        const phaseWord = active.phase === 'IQAMA' ? 'IQAMA' : 'NEXT';
        const heroTag = `${phaseWord} · ${active.prayer.name.toUpperCase()} · ${nextTargetWord}`;

        let heroTagLabel = new St.Label({
            text: heroTag,
            style_class: 'salat-hero-top-left',
            y_align: Clutter.ActorAlign.CENTER
        });
        heroTopRow.add_child(heroTagLabel);

        let heroTopSpacer = new St.BoxLayout({ x_expand: true });
        heroTopRow.add_child(heroTopSpacer);

        const iqamaH = String(active.prayer.iqamaDate.getHours()).padStart(2, '0');
        const iqamaM = String(active.prayer.iqamaDate.getMinutes()).padStart(2, '0');
        let heroTimesBox = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER });
        let adhanTimeLabel = new St.Label({
            text: `Adhan ${active.prayer.time}`,
            style_class: 'salat-hero-top-right'
        });
        let iqamaTimeLabel = new St.Label({
            text: `Iqama ${iqamaH}:${iqamaM}`,
            style_class: 'salat-hero-top-right'
        });
        heroTimesBox.add_child(adhanTimeLabel);
        heroTimesBox.add_child(iqamaTimeLabel);
        heroTopRow.add_child(heroTimesBox);

        heroBox.add_child(heroTopRow);

        // Giant Countdown: e.g. 7h 35m
        let diffMs = 0;
        if (active.phase === 'IQAMA') {
            diffMs = Math.max(0, active.prayer.iqamaDate.getTime() - now.getTime());
        } else {
            diffMs = Math.max(0, active.prayer.adhanDate.getTime() - now.getTime());
        }
        const totalMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const countdownStr = hours > 0 ? `${hours}h ${String(mins).padStart(2, '0')}m` : `${mins}m`;

        let countdownLabel = new St.Label({
            text: countdownStr,
            style_class: 'salat-hero-countdown'
        });
        heroBox.add_child(countdownLabel);

        // Progress bar line
        let progressTrack = new St.BoxLayout({
            style_class: 'salat-progress-track',
            x_expand: true
        });

        // Calculate progress percentage
        let progressPercent = 0.35; // reasonable fallback
        try {
            const nextTime = active.prayer.adhanDate.getTime();
            const totalCycle = 6 * 3600 * 1000; // estimated default span
            const elapsed = Math.max(0, totalCycle - diffMs);
            progressPercent = Math.min(1.0, Math.max(0.08, elapsed / totalCycle));
        } catch (e) {}

        let progressFill = new St.BoxLayout({
            style_class: 'salat-progress-fill',
            width: Math.max(12, Math.round(progressPercent * 280))
        });
        progressTrack.add_child(progressFill);
        heroBox.add_child(progressTrack);

        addChild(heroItem, heroBox);
        indicator.menu.addMenuItem(heroItem);
    }

    // 3. Table Column Headers:               ADHAN          IQAMA
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

    addChild(tableHeaderItem, tableHeaderBox);
    indicator.menu.addMenuItem(tableHeaderItem);

    // 4. Prayer Rows List
    for (let p of prayers) {
        let isActive = !!active && active.prayer.key === p.key;
        let isPassed = now.getTime() >= p.adhanDate.getTime() && !isActive;

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
        } else {
            if (isPassed) {
                let check = new St.Label({
                    text: '✓ ',
                    style_class: 'salat-prayer-check',
                    y_align: Clutter.ActorAlign.CENTER
                });
                leftBox.add_child(check);
            } else {
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

        addChild(prayerItem, rowBox);
        indicator.menu.addMenuItem(prayerItem);
    }

    // Separator before action cards
    let cardSep = new PopupMenu.PopupSeparatorMenuItem();
    indicator.menu.addMenuItem(cardSep);

    // 5. Action Card 1: Quick Wudu Reminder (Interactive Card)
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
        text: wuduDone ? I18n.t('wudu_active', config.lang) : I18n.t('quick_wudu', config.lang),
        style_class: 'salat-card-title'
    });
    let wuduSubLbl = new St.Label({
        text: wuduDone ? I18n.t('wudu_marked_body', config.lang, { prayer: active ? active.prayer.name : '' }) : 'Alert 10 min before each adhan',
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

    wuduItem.connect('activate', () => {
        if (callbacks && typeof callbacks.onQuickWudu === 'function') {
            callbacks.onQuickWudu();
        }
    });
    addChild(wuduItem, wuduCard);
    indicator.menu.addMenuItem(wuduItem);

    // 6. Action Card 2: Monthly Schedule (Interactive Card)
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
        text: I18n.t('prefs_schedule_tab', config.lang),
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

    scheduleItem.connect('activate', () => {
        if (callbacks && typeof callbacks.onOpenScheduleWindow === 'function') {
            callbacks.onOpenScheduleWindow();
        }
    });
    addChild(scheduleItem, scheduleCard);
    indicator.menu.addMenuItem(scheduleItem);

    // 7. Action Card 3: Lock on Iqama (Card with interactive Switch)
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
        text: I18n.t('lock_screen', config.lang),
        style_class: 'salat-card-title'
    });
    let lockSubLbl = new St.Label({
        text: 'Locks the screen so everyone can pray',
        style_class: 'salat-card-subtitle'
    });
    lockTextCol.add_child(lockTitleLbl);
    lockTextCol.add_child(lockSubLbl);
    lockCard.add_child(lockTextCol);

    let lockSwitch = new PopupMenu.Switch(!!config.lockEnabled);
    lockCard.add_child(lockSwitch);

    lockCardItem.connect('activate', () => {
        lockSwitch.toggle();
        config.lockEnabled = lockSwitch.state;
        if (callbacks && typeof callbacks.onToggleLock === 'function') {
            callbacks.onToggleLock(lockSwitch.state);
        } else {
            Config.saveConfig(config);
        }
    });
    addChild(lockCardItem, lockCard);
    indicator.menu.addMenuItem(lockCardItem);

    // 8. Open Settings Button (Bottom rounded pill)
    let settingsItem = new PopupMenu.PopupBaseMenuItem({ reactive: true, can_focus: true });
    settingsItem.set_style('padding: 0px; margin: 0px;');
    let settingsBtnBox = new St.BoxLayout({
        style_class: 'salat-settings-btn',
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER
    });
    let settingsBtnLabel = new St.Label({
        text: '⚙ ' + I18n.t('open_settings', config.lang),
        style_class: 'salat-settings-btn-label',
        y_align: Clutter.ActorAlign.CENTER
    });
    settingsBtnBox.add_child(settingsBtnLabel);

    settingsItem.connect('activate', () => {
        try {
            GLib.spawn_command_line_async('gnome-extensions prefs salat-timer@moroccan-habous');
        } catch (e: any) {
            log('[SalatExtension UI] Failed to open prefs: ' + e.message);
        }
    });
    addChild(settingsItem, settingsBtnBox);
    indicator.menu.addMenuItem(settingsItem);
}
