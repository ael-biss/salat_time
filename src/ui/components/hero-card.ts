/// <reference path="../../types.d.ts" />
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Calculator from '../../utils/calculator.js';
import { formatHeroCountdown, formatHeaderDate } from '../../utils/time-formatter.js';

export interface HeroCardWidgets {
    dateLabel?: any;
    heroTagLabel: any;
    adhanTimeLabel: any;
    iqamaTimeLabel: any;
    countdownLabel: any;
    progressFill: any;
    activePrayerKey: string;
    activePhase: string;
}

export function createHeroCard(
    active: ActivePrayer,
    prayers: PrayerEntry[],
    now: Date
): { menuItem: any; widgets: HeroCardWidgets } {
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

    // Giant Countdown: e.g. 7h 35m 12s
    let diffMs = 0;
    if (active.phase === 'IQAMA') {
        diffMs = Math.max(0, active.prayer.iqamaDate.getTime() - now.getTime());
    } else {
        diffMs = Math.max(0, active.prayer.adhanDate.getTime() - now.getTime());
    }
    const countdownStr = formatHeroCountdown(diffMs);

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

    const progressPercent = Calculator.calculateProgressPercent(active, prayers, now);
    let progressFill = new St.BoxLayout({
        style_class: 'salat-progress-fill',
        width: Math.max(12, Math.round(progressPercent * 280))
    });
    progressTrack.add_child(progressFill);
    heroBox.add_child(progressTrack);

    if (typeof heroItem.add_child === 'function') {
        heroItem.add_child(heroBox);
    } else if (typeof heroItem.add === 'function') {
        heroItem.add(heroBox);
    }

    const widgets: HeroCardWidgets = {
        heroTagLabel,
        adhanTimeLabel,
        iqamaTimeLabel,
        countdownLabel,
        progressFill,
        activePrayerKey: active.prayer.key,
        activePhase: active.phase
    };

    return { menuItem: heroItem, widgets };
}

export function updateHeroCard(
    hw: HeroCardWidgets,
    config: UserConfig,
    prayerTimesData: PrayerTimesData,
    now: Date,
    onNeedsRebuild?: () => void,
    monthlySchedule?: MonthlyScheduleData | null
): void {
    if (!prayerTimesData || !hw) return;

    const prayers = Calculator.getPrayerEntries(prayerTimesData, config.iqamaDelays, config.lang, now);
    const active = Calculator.findActivePrayer(prayers, config.iqamaDelays, now);
    if (!active) return;

    // If active prayer or phase transitioned, request a full rebuild
    if (hw.activePrayerKey !== active.prayer.key || hw.activePhase !== active.phase) {
        if (onNeedsRebuild) onNeedsRebuild();
        return;
    }

    // 1. Update giant countdown with live seconds
    let diffMs = 0;
    if (active.phase === 'IQAMA') {
        diffMs = Math.max(0, active.prayer.iqamaDate.getTime() - now.getTime());
    } else {
        diffMs = Math.max(0, active.prayer.adhanDate.getTime() - now.getTime());
    }

    if (hw.countdownLabel) {
        hw.countdownLabel.set_text(formatHeroCountdown(diffMs));
    }

    // 2. Update top tag (e.g. NEXT · FAJR · TODAY)
    const isTomorrow = active.prayer.adhanDate.getDate() !== now.getDate();
    const nextTargetWord = isTomorrow ? 'TOMORROW' : 'TODAY';
    const phaseWord = active.phase === 'IQAMA' ? 'IQAMA' : 'NEXT';
    const heroTag = `${phaseWord} · ${active.prayer.name.toUpperCase()} · ${nextTargetWord}`;
    if (hw.heroTagLabel) {
        hw.heroTagLabel.set_text(heroTag);
    }

    // 3. Update adhan & iqama times
    const iqamaH = String(active.prayer.iqamaDate.getHours()).padStart(2, '0');
    const iqamaM = String(active.prayer.iqamaDate.getMinutes()).padStart(2, '0');
    if (hw.adhanTimeLabel) {
        hw.adhanTimeLabel.set_text(`Adhan ${active.prayer.time}`);
    }
    if (hw.iqamaTimeLabel) {
        hw.iqamaTimeLabel.set_text(`Iqama ${iqamaH}:${iqamaM}`);
    }

    // 4. Update progress bar
    const progressPercent = Calculator.calculateProgressPercent(active, prayers, now);
    const fillWidth = Math.max(12, Math.round(progressPercent * 280));
    if (hw.progressFill) {
        try {
            hw.progressFill.set_width(fillWidth);
        } catch (e) {
            hw.progressFill.width = fillWidth;
        }
    }

    // 5. Update header date if day rolled over
    if (hw.dateLabel) {
        hw.dateLabel.set_text(formatHeaderDate(now, config.lang, monthlySchedule));
    }
}
