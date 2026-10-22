/// <reference path="./types.d.ts" />
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import * as Api from './api.js';
import * as Calculator from './calculator.js';
import * as Config from './config.js';
import * as Constants from './constants.js';
import * as I18n from './i18n.js';
import * as UI from './ui.js';



export default class SalatExtension extends Extension {
    private indicator: any = null;
    private timeoutId: number = 0;
    private httpSession: any = null;
    private config: UserConfig | null = null;
    private configMonitor: any = null;
    private prayerTimesData: PrayerTimesData | null = null;
    private triggeredAdhans: Record<string, boolean> = {};
    private triggeredIqamas: Record<string, boolean> = {};
    private triggeredFridayReminders: Record<string, boolean> = {};
    private triggeredWuduReminders: Record<string, boolean> = {};

    enable() {
        log('[SalatExtension ESM] Enabling extension...');
        try {
            this.httpSession = Api.createSession();
            this.config = Config.loadConfig();
            if (this.config) {
                log(`[SalatExtension ESM] Loaded config: City=${this.config.city.name}, Lang=${this.config.lang}`);
            }

            this.configMonitor = Config.setupConfigMonitor(() => {
                log('[SalatExtension ESM] Config monitor triggered: config changed on disk. Recreating indicator...');
                this.config = Config.loadConfig();
                this.recreatePanelIndicator();
            });

            this.recreatePanelIndicator();

            if (this.timeoutId) {
                GLib.source_remove(this.timeoutId);
            }
            this.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                const now = new Date();
                if (!this.prayerTimesData || (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0)) {
                    this.refreshPrayerTimes();
                } else if (this.config) {
                    UI.updatePanelText(this.indicator, this.prayerTimesData, this.config.iqamaDelays, this.config.lang);
                    this.checkPrayerEvents(now);
                }
                return GLib.SOURCE_CONTINUE;
            });

            log('[SalatExtension ESM] Extension enabled successfully!');
        } catch (e: any) {
            log('[SalatExtension ESM] FATAL ERROR in enable(): ' + e.message + '\n' + e.stack);
        }
    }

    disable() {
        log('[SalatExtension ESM] Disabling extension...');
        try {
            if (this.configMonitor) {
                this.configMonitor.cancel();
                this.configMonitor = null;
            }
            if (this.timeoutId) {
                GLib.source_remove(this.timeoutId);
                this.timeoutId = 0;
            }
            if (this.indicator) {
                this.indicator.destroy();
                this.indicator = null;
            }
            this.destroyOldStatusAreaRole();
            log('[SalatExtension ESM] Extension disabled cleanly.');
        } catch (e: any) {
            log('[SalatExtension ESM] Error during disable(): ' + e.message);
        }
    }

    private destroyOldStatusAreaRole(): void {
        try {
            if (Main.panel.statusArea['salat-indicator']) {
                log('[SalatExtension ESM] Cleaning up pre-existing salat-indicator statusArea entry...');
                Main.panel.statusArea['salat-indicator'].destroy();
            }
        } catch (e: any) {
            log('[SalatExtension ESM] Note on statusArea cleanup: ' + e.message);
        }
    }

    private reloadAndSyncUI(): void {
        try {
            log('[SalatExtension ESM] Syncing UI...');
            if (!this.config) return;
            UI.updatePanelText(this.indicator, this.prayerTimesData, this.config.iqamaDelays, this.config.lang);
            UI.rebuildMenu(this.indicator, this.config, this.prayerTimesData, {
                onSelectCity: (city: City) => {
                    log('[SalatExtension ESM] City selected: ' + city.name);
                    if (this.config) {
                        this.config.city = city;
                        Config.saveConfig(this.config);
                    }
                    this.recreatePanelIndicator();
                },
                onSelectLang: (langCode: string) => {
                    log('[SalatExtension ESM] Language selected: ' + langCode);
                    if (this.config) {
                        this.config.lang = langCode;
                        Config.saveConfig(this.config);
                    }
                    this.recreatePanelIndicator();
                },
                onSetIqamaDelay: (prayerKey: string, minutes: number) => {
                    log(`[SalatExtension ESM] Delay set for ${prayerKey}: +${minutes}m`);
                    if (this.config) {
                        this.config.iqamaDelays[prayerKey] = minutes;
                        Config.saveConfig(this.config);
                    }
                    this.recreatePanelIndicator();
                },
                onResetIqamaDefaults: () => {
                    log('[SalatExtension ESM] Iqama delays reset to defaults.');
                    if (this.config) {
                        this.config.iqamaDelays = Object.assign({}, Constants.DEFAULT_IQAMA_DELAYS);
                        Config.saveConfig(this.config);
                    }
                    this.recreatePanelIndicator();
                },
                onToggleLock: (enabled: boolean) => {
                    log('[SalatExtension ESM] Lock toggled: ' + enabled);
                    if (this.config) {
                        this.config.lockEnabled = enabled;
                        Config.saveConfig(this.config);
                    }
                }
            });
            log('[SalatExtension ESM] UI sync completed successfully.');
        } catch (e: any) {
            log('[SalatExtension ESM] Error in reloadAndSyncUI: ' + e.message + '\n' + e.stack);
        }
    }

    private refreshPrayerTimes(): void {
        if (!this.httpSession || !this.config) {
            log('[SalatExtension ESM] Cannot refresh prayer times: httpSession or config missing.');
            return;
        }
        log(`[SalatExtension ESM] Refreshing prayer times for city ID ${this.config.city.id} (${this.config.city.name})...`);
        Api.fetchPrayerTimes(
            this.httpSession,
            this.config.city.id,
            (data: PrayerTimesData) => {
                log('[SalatExtension ESM] Received prayer times data successfully.');
                this.prayerTimesData = data;
                this.reloadAndSyncUI();
            },
            (err: Error) => {
                log('[SalatExtension ESM] Failed to fetch prayer times: ' + err.message);
            }
        );
    }

    private getIconFile(): any {
        try {
            if (this.dir) {
                let file = this.dir.get_child('mosque_pic.svg');
                if (file.query_exists(null)) return file;
            }
            if (this.path) {
                let path = GLib.build_filenamev([this.path, 'mosque_pic.svg']);
                let file = Gio.File.new_for_path(path);
                if (file.query_exists(null)) return file;
            }
            let curFile = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_current_dir(), 'mosque_pic.svg']));
            if (curFile.query_exists(null)) return curFile;
        } catch (e: any) {
            log('[SalatExtension ESM] Error locating mosque_pic.svg: ' + e.message);
        }
        return null;
    }

    private recreatePanelIndicator(): void {
        log('[SalatExtension ESM] Rebuilding panel indicator from scratch...');
        try {
            if (this.indicator) {
                this.indicator.destroy();
                this.indicator = null;
            }
            this.destroyOldStatusAreaRole();

            this.indicator = new PanelMenu.Button(0.0, "Salat & Iqama Indicator", false);

            let box = new St.BoxLayout({
                style_class: 'panel-status-indicators-box',
                y_align: Clutter.ActorAlign.CENTER
            });

            let iconFile = this.getIconFile();
            if (iconFile) {
                let gicon = Gio.FileIcon.new(iconFile);
                this.indicator.icon = new St.Icon({
                    gicon: gicon,
                    style_class: 'system-status-icon',
                    icon_size: 16
                });
                box.add_child(this.indicator.icon);
            }

            this.indicator.buttonText = new St.Label({
                text: I18n.t('loading', this.config ? this.config.lang : 'auto'),
                y_align: Clutter.ActorAlign.CENTER
            });
            box.add_child(this.indicator.buttonText);

            this.indicator.add_child(box);

            try {
                Main.panel.addToStatusArea('salat-indicator', this.indicator, 0, 'right');
                log('[SalatExtension ESM] Added indicator to statusArea with role salat-indicator.');
            } catch (e: any) {
                log('[SalatExtension ESM] addToStatusArea salat-indicator exception: ' + e.message + ', using fallback role.');
                let fallbackRole = 'salat-indicator-' + Date.now();
                Main.panel.addToStatusArea(fallbackRole, this.indicator, 0, 'right');
                log('[SalatExtension ESM] Added indicator with fallback role: ' + fallbackRole);
            }

            this.refreshPrayerTimes();
        } catch (e: any) {
            log('[SalatExtension ESM] Error recreating panel indicator: ' + e.message);
        }
    }

    private getAdhanAudioPath(): string | null {
        try {
            // 1. Check user configured custom adhan path
            if (this.config && this.config.adhanAudioPath && this.config.adhanAudioPath.trim().length > 0) {
                let customPath = this.config.adhanAudioPath.trim();
                if (customPath.startsWith('~')) {
                    customPath = GLib.get_home_dir() + customPath.slice(1);
                }
                if (GLib.file_test(customPath, GLib.FileTest.EXISTS)) {
                    return customPath;
                } else {
                    log('[SalatExtension ESM] Custom adhan path not found: ' + customPath + ', falling back to bundled audio.');
                }
            }

            // 2. Default bundled adan.mp3
            if (this.dir) {
                let file = this.dir.get_child('adan.mp3');
                if (file.query_exists(null)) return file.get_path();
            }
            if (this.path) {
                let p = GLib.build_filenamev([this.path, 'adan.mp3']);
                if (GLib.file_test(p, GLib.FileTest.EXISTS)) return p;
            }
            let cur = GLib.build_filenamev([GLib.get_current_dir(), 'adan.mp3']);
            if (GLib.file_test(cur, GLib.FileTest.EXISTS)) return cur;
        } catch (e: any) {
            log('[SalatExtension ESM] Error finding adan.mp3: ' + e.message);
        }
        return null;
    }

    private playAdhanSound(): void {
        const audioPath = this.getAdhanAudioPath();
        if (!audioPath) {
            log('[SalatExtension ESM] Cannot play adhan: audio file not found.');
            return;
        }

        log('[SalatExtension ESM] 📢 Triggering Adhan audio playback: ' + audioPath);
        try {
            GLib.spawn_command_line_async('notify-send "Salat Timer" "📢 Adhan time!"');
            if (GLib.find_program_in_path('cvlc')) {
                GLib.spawn_command_line_async(`cvlc --play-and-exit --no-video "${audioPath}"`);
            } else if (GLib.find_program_in_path('pw-play')) {
                GLib.spawn_command_line_async(`pw-play "${audioPath}"`);
            } else if (GLib.find_program_in_path('paplay')) {
                GLib.spawn_command_line_async(`paplay "${audioPath}"`);
            } else {
                const pyScript = `import gi, sys; gi.require_version('Gst', '1.0'); from gi.repository import Gst, GLib; Gst.init(None); p = Gst.ElementFactory.make('playbin', 'p'); p.set_property('uri', 'file://' + sys.argv[1]); p.set_state(Gst.State.PLAYING); loop = GLib.MainLoop(); b = p.get_bus(); b.add_watch(GLib.PRIORITY_DEFAULT, lambda bus, msg: loop.quit() if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR) else True); loop.run()`;
                GLib.spawn_command_line_async(`python3 -c "${pyScript}" "${audioPath}"`);
            }
        } catch (e: any) {
            log('[SalatExtension ESM] Audio playback failed: ' + e.message);
        }
    }

    private runFtLock(): void {
        if (!this.config || !this.config.lockEnabled) {
            log('[SalatExtension ESM] Lock feature disabled in settings. Skipping lock.');
            return;
        }
        log('[SalatExtension ESM] 🔒 Iqama finished! Triggering screen lock...');
        try {
            GLib.spawn_command_line_async('notify-send -u critical "Salat Timer" "🔒 Iqama finished! Locking screen..."');

            if (this.config.customLockCommand && this.config.customLockCommand.trim().length > 0) {
                GLib.spawn_command_line_async(this.config.customLockCommand.trim());
                return;
            }

            if (GLib.find_program_in_path('ft_lock')) {
                GLib.spawn_command_line_async('ft_lock');
            } else if (GLib.file_test('/usr/share/42/ft_lock', GLib.FileTest.IS_EXECUTABLE)) {
                GLib.spawn_command_line_async('/usr/share/42/ft_lock');
            } else if (GLib.file_test('/usr/local/bin/ft_lock', GLib.FileTest.IS_EXECUTABLE)) {
                GLib.spawn_command_line_async('/usr/local/bin/ft_lock');
            } else {
                log('[SalatExtension ESM] ft_lock executable not found on system.');
            }
        } catch (e: any) {
            log('[SalatExtension ESM] Error executing lock: ' + e.message);
        }
    }

    private checkPrayerEvents(now: Date): void {
        if (!this.prayerTimesData || !this.config) return;

        const prayers = Calculator.getPrayerEntries(
            this.prayerTimesData,
            this.config.iqamaDelays,
            this.config.lang,
            now
        );

        const datePrefix = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

        for (let p of prayers) {
            const adhanKey = `${datePrefix}_${p.key}_adhan`;
            const iqamaKey = `${datePrefix}_${p.key}_iqama`;
            const wuduKey = `${datePrefix}_${p.key}_wudu`;

            // 0. Wudu Reminder: now >= adhanDate - wuduMins
            if (this.config.wuduReminderEnabled !== false) {
                const wuduMins = this.config.wuduReminderMinutes ?? 15;
                const wuduTime = new Date(p.adhanDate.getTime() - wuduMins * 60000);
                const wuduDiff = now.getTime() - wuduTime.getTime();

                if (wuduDiff >= 0 && !this.triggeredWuduReminders[wuduKey]) {
                    this.triggeredWuduReminders[wuduKey] = true;
                    if (wuduDiff <= 60000) {
                        this.triggerWuduReminder(p.name, wuduMins);
                    }
                }
            }

            // 1. Adhan Trigger: now >= adhanDate (within a 30s window to handle system lag/sleep)
            const adhanDiff = now.getTime() - p.adhanDate.getTime();
            if (adhanDiff >= 0 && !this.triggeredAdhans[adhanKey]) {
                this.triggeredAdhans[adhanKey] = true;
                if (adhanDiff <= 30000) { // Only fire if current time is within 30s of Adhan
                    this.playAdhanSound();

                    // Optional Du'aa after Adhan
                    if (this.config.duaaAfterAdhan !== false) {
                        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 15, () => {
                            this.showDuaaAfterAdhan();
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                }
            }

            // 2. Iqama Finish Trigger: now >= iqamaDate
            const iqamaDiff = now.getTime() - p.iqamaDate.getTime();
            if (iqamaDiff >= 0 && !this.triggeredIqamas[iqamaKey]) {
                this.triggeredIqamas[iqamaKey] = true;
                if (iqamaDiff <= 30000) { // Only fire if current time is within 30s of Iqama finish
                    if (this.config.lockEnabled) {
                        this.runFtLock();
                    } else {
                        try {
                            GLib.spawn_command_line_async(`notify-send "Salat Timer" "🕌 Iqama time for ${p.name}!"`);
                        } catch (e: any) {}
                    }
                }
            }
        }

        // 3. Friday Jumuaah Reminder (e.g. 60m before Dhuhr on Fridays)
        if (now.getDay() === 5 && this.config.fridayReminderEnabled !== false) {
            const dhuhr = prayers.find((pr: PrayerEntry) => pr.key === 'Dhuhr');
            if (dhuhr) {
                const reminderMins = this.config.fridayReminderMinutes ?? 60;
                const reminderTime = new Date(dhuhr.adhanDate.getTime() - reminderMins * 60000);
                const fridayDiff = now.getTime() - reminderTime.getTime();
                const fridayKey = `${datePrefix}_friday_reminder`;

                if (fridayDiff >= 0 && !this.triggeredFridayReminders[fridayKey]) {
                    this.triggeredFridayReminders[fridayKey] = true;
                    if (fridayDiff <= 60000) {
                        this.triggerFridayReminder(reminderMins);
                    }
                }
            }
        }
    }

    private showDuaaAfterAdhan(): void {
        log('[SalatExtension ESM] 🤲 Showing Du\'aa after Adhan...');
        const lang = this.config ? this.config.lang : 'auto';
        const title = I18n.t('duaa_title', lang);
        let body = I18n.t('duaa_text', lang);
        if (lang === 'en') {
            body += "\n\nO Allah, Lord of this perfect call and established prayer, grant Muhammad the intercession and distinction, and resurrect him to the praised position You have promised him.";
        } else if (lang === 'fr') {
            body += "\n\nÔ Allah, Seigneur de cet appel parfait et de la prière établie, accorde à Muhammad l'intercession et l'éminence, et ressuscite-le au rang louable que Tu lui as promis.";
        }

        try {
            const safeTitle = title.replace(/"/g, '\\"');
            const safeBody = body.replace(/"/g, '\\"');
            GLib.spawn_command_line_async(`notify-send -u normal "${safeTitle}" "${safeBody}"`);
        } catch (e: any) {
            log('[SalatExtension ESM] Error sending Du\'aa notification: ' + e.message);
        }

        if (this.config && this.config.duaaAudioPath && this.config.duaaAudioPath.trim().length > 0) {
            let audio = this.config.duaaAudioPath.trim();
            if (audio.startsWith('~')) audio = GLib.get_home_dir() + audio.slice(1);
            if (GLib.file_test(audio, GLib.FileTest.EXISTS)) {
                this.playAudioFile(audio);
            }
        }
    }

    private triggerFridayReminder(minutes: number): void {
        log(`[SalatExtension ESM] 🕌 Triggering Friday Jumuaah reminder (${minutes}m before Dhuhr)...`);
        const lang = this.config ? this.config.lang : 'auto';
        const title = I18n.t('friday_reminder_title', lang);
        const body = I18n.t('friday_reminder_body', lang, { minutes });
        try {
            const safeTitle = title.replace(/"/g, '\\"');
            const safeBody = body.replace(/"/g, '\\"');
            GLib.spawn_command_line_async(`notify-send -u critical "${safeTitle}" "${safeBody}"`);
        } catch (e: any) {
            log('[SalatExtension ESM] Error sending Friday reminder: ' + e.message);
        }
    }

    private triggerWuduReminder(prayerName: string, minutes: number): void {
        log(`[SalatExtension ESM] 💧 Triggering Wudu reminder for ${prayerName} (${minutes}m before Adhan)...`);
        const lang = this.config ? this.config.lang : 'auto';
        const title = I18n.t('wudu_reminder_title', lang);
        const body = I18n.t('wudu_reminder_body', lang, { prayer: prayerName, minutes });

        try {
            const safeTitle = title.replace(/"/g, '\\"');
            const safeBody = body.replace(/"/g, '\\"');
            GLib.spawn_command_line_async(`notify-send -u normal "${safeTitle}" "${safeBody}"`);
        } catch (e: any) {
            log('[SalatExtension ESM] Error sending Wudu notification: ' + e.message);
        }

        if (this.config && this.config.wuduAudioPath && this.config.wuduAudioPath.trim().length > 0) {
            let audio = this.config.wuduAudioPath.trim();
            if (audio.startsWith('~')) audio = GLib.get_home_dir() + audio.slice(1);
            if (GLib.file_test(audio, GLib.FileTest.EXISTS)) {
                this.playAudioFile(audio);
                return;
            }
        }

        try {
            if (GLib.find_program_in_path('canberra-gtk-play')) {
                GLib.spawn_command_line_async('canberra-gtk-play -i message-new-instant');
            }
        } catch (e: any) {}
    }

    private playAudioFile(audioPath: string): void {
        if (!audioPath || !GLib.file_test(audioPath, GLib.FileTest.EXISTS)) return;
        try {
            if (GLib.find_program_in_path('cvlc')) {
                GLib.spawn_command_line_async(`cvlc --play-and-exit --no-video "${audioPath}"`);
            } else if (GLib.find_program_in_path('pw-play')) {
                GLib.spawn_command_line_async(`pw-play "${audioPath}"`);
            } else if (GLib.find_program_in_path('paplay')) {
                GLib.spawn_command_line_async(`paplay "${audioPath}"`);
            } else {
                const pyScript = `import gi, sys; gi.require_version('Gst', '1.0'); from gi.repository import Gst, GLib; Gst.init(None); p = Gst.ElementFactory.make('playbin', 'p'); p.set_property('uri', 'file://' + sys.argv[1]); p.set_state(Gst.State.PLAYING); loop = GLib.MainLoop(); b = p.get_bus(); b.add_watch(GLib.PRIORITY_DEFAULT, lambda bus, msg: loop.quit() if msg.type in (Gst.MessageType.EOS, Gst.MessageType.ERROR) else True); loop.run()`;
                GLib.spawn_command_line_async(`python3 -c "${pyScript}" "${audioPath}"`);
            }
        } catch (e: any) {
            log('[SalatExtension ESM] Audio playback failed: ' + e.message);
        }
    }
}
