/// <reference path="../types.d.ts" />
import GLib from 'gi://GLib';
import * as Calculator from '../utils/calculator.js';
import * as NotificationService from '../services/notification-service.js';
import * as AudioService from '../services/audio-service.js';
import * as SystemService from '../services/system-service.js';

export class PrayerEventManager {
    private triggeredAdhans: Record<string, boolean> = {};
    private triggeredIqamas: Record<string, boolean> = {};
    private triggeredFridayReminders: Record<string, boolean> = {};
    private triggeredWuduReminders: Record<string, boolean> = {};
    private lastTransitionKey: string = '';
    private dir: any = null;
    private path: string = '';

    constructor(dir?: any, path?: string) {
        this.dir = dir;
        this.path = path || '';
    }

    public getLastTransitionKey(): string {
        return this.lastTransitionKey;
    }

    public setLastTransitionKey(key: string): void {
        this.lastTransitionKey = key;
    }

    public reset(): void {
        this.triggeredAdhans = {};
        this.triggeredIqamas = {};
        this.triggeredFridayReminders = {};
        this.triggeredWuduReminders = {};
        this.lastTransitionKey = '';
    }

    public checkEvents(
        now: Date,
        config: UserConfig,
        prayerTimesData: PrayerTimesData,
        wuduDone: boolean,
        lastWuduPrayerKey: string
    ): { transitioned: boolean; shouldResetWudu: boolean } {
        let transitioned = false;
        let shouldResetWudu = false;

        const prayers = Calculator.getPrayerEntries(
            prayerTimesData,
            config.iqamaDelays,
            config.lang,
            now
        );

        const active = Calculator.findActivePrayer(prayers, config.iqamaDelays, now);
        if (active) {
            const currentTransitionKey = `${active.prayer.key}_${active.phase}`;
            if (this.lastTransitionKey && this.lastTransitionKey !== currentTransitionKey) {
                log(`[SalatExtension EventManager] Prayer or phase transitioned (${this.lastTransitionKey} -> ${currentTransitionKey}).`);
                if (wuduDone && lastWuduPrayerKey && active.prayer.key !== lastWuduPrayerKey) {
                    shouldResetWudu = true;
                }
                this.lastTransitionKey = currentTransitionKey;
                transitioned = true;
            } else if (!this.lastTransitionKey) {
                this.lastTransitionKey = currentTransitionKey;
            }
        }

        const datePrefix = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

        for (let p of prayers) {
            const adhanKey = `${datePrefix}_${p.key}_adhan`;
            const iqamaKey = `${datePrefix}_${p.key}_iqama`;
            const wuduKey = `${datePrefix}_${p.key}_wudu`;

            // 0. Wudu Reminder: now >= adhanDate - wuduMins
            if (config.wuduReminderEnabled !== false) {
                const wuduMins = config.wuduReminderMinutes ?? 15;
                const wuduTime = new Date(p.adhanDate.getTime() - wuduMins * 60000);
                const wuduDiff = now.getTime() - wuduTime.getTime();

                if (wuduDiff >= 0 && !this.triggeredWuduReminders[wuduKey]) {
                    this.triggeredWuduReminders[wuduKey] = true;
                    if (wuduDiff <= 60000) {
                        this.triggerWuduReminder(p.name, wuduMins, config);
                    }
                }
            }

            // 1. Adhan Trigger: now >= adhanDate (within a 30s window to handle system lag/sleep)
            const adhanDiff = now.getTime() - p.adhanDate.getTime();
            if (adhanDiff >= 0 && !this.triggeredAdhans[adhanKey]) {
                this.triggeredAdhans[adhanKey] = true;
                if (adhanDiff <= 30000) {
                    this.triggerAdhan(config);

                    // Optional Du'aa after Adhan
                    if (config.duaaAfterAdhan !== false) {
                        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 15, () => {
                            this.triggerDuaa(config);
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                }
            }

            // 2. Iqama Finish Trigger: now >= iqamaDate
            const iqamaDiff = now.getTime() - p.iqamaDate.getTime();
            if (iqamaDiff >= 0 && !this.triggeredIqamas[iqamaKey]) {
                this.triggeredIqamas[iqamaKey] = true;
                if (iqamaDiff <= 30000) {
                    if (config.lockEnabled) {
                        NotificationService.notifyLocking();
                        SystemService.runFtLock(config);
                    } else {
                        NotificationService.notifyIqama(p.name);
                    }
                }
            }
        }

        // 3. Friday Jumuaah Reminder
        if (now.getDay() === 5 && config.fridayReminderEnabled !== false) {
            const dhuhr = prayers.find((pr: PrayerEntry) => pr.key === 'Dhuhr');
            if (dhuhr) {
                const reminderMins = config.fridayReminderMinutes ?? 60;
                const reminderTime = new Date(dhuhr.adhanDate.getTime() - reminderMins * 60000);
                const fridayDiff = now.getTime() - reminderTime.getTime();
                const fridayKey = `${datePrefix}_friday_reminder`;

                if (fridayDiff >= 0 && !this.triggeredFridayReminders[fridayKey]) {
                    this.triggeredFridayReminders[fridayKey] = true;
                    if (fridayDiff <= 60000) {
                        NotificationService.notifyFriday(reminderMins, config.lang);
                    }
                }
            }
        }

        return { transitioned, shouldResetWudu };
    }

    private triggerAdhan(config: UserConfig): void {
        const audioPath = AudioService.resolveAudioPath(config.adhanAudioPath, 'adan.mp3', this.dir, this.path);
        if (!audioPath) {
            log('[SalatExtension EventManager] Cannot play adhan: audio file not found.');
            return;
        }
        log('[SalatExtension EventManager] 📢 Triggering Adhan audio playback: ' + audioPath);
        NotificationService.notifyAdhan(config.lang);
        AudioService.playAudio(audioPath, this.dir, this.path);
    }

    private triggerDuaa(config: UserConfig): void {
        log('[SalatExtension EventManager] 🤲 Showing Du\'aa after Adhan...');
        NotificationService.notifyDuaa(config.lang);
        if (config.duaaAudioPath && config.duaaAudioPath.trim().length > 0) {
            AudioService.playAudio(config.duaaAudioPath, this.dir, this.path);
        }
    }

    private triggerWuduReminder(prayerName: string, minutes: number, config: UserConfig): void {
        log(`[SalatExtension EventManager] 💧 Triggering Wudu reminder for ${prayerName} (${minutes}m before Adhan)...`);
        NotificationService.notifyWudu(prayerName, minutes, config.lang);
        if (config.wuduAudioPath && config.wuduAudioPath.trim().length > 0) {
            AudioService.playAudio(config.wuduAudioPath, this.dir, this.path);
        } else {
            AudioService.playSystemSound('message-new-instant');
        }
    }
}
