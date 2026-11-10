/// <reference path="../types.d.ts" />
import GLib from 'gi://GLib';
import * as Constants from './constants.js';
import * as ConfigService from '../services/config-service.js';
import * as PrayerService from '../services/prayer-service.js';
import * as AudioService from '../services/audio-service.js';
import * as NotificationService from '../services/notification-service.js';
import * as SystemService from '../services/system-service.js';
import * as Calculator from '../utils/calculator.js';
import { PrayerEventManager } from './event-manager.js';
import { SalatIndicator } from '../ui/indicator.js';

export class ExtensionManager {
    private indicator: SalatIndicator | null = null;
    private timeoutId: number = 0;
    private httpSession: any = null;
    private config: UserConfig | null = null;
    private configMonitor: any = null;
    private prayerTimesData: PrayerTimesData | null = null;
    private eventManager: PrayerEventManager | null = null;
    private wuduDone: boolean = false;
    private lastWuduPrayerKey: string = '';
    private dir: any = null;
    private path: string = '';

    constructor(dir?: any, path?: string) {
        this.dir = dir;
        this.path = path || '';
        this.eventManager = new PrayerEventManager(dir, path);
    }

    public enable(): void {
        log('[SalatExtension ExtensionManager] Enabling extension...');
        try {
            this.httpSession = PrayerService.createSession();
            this.config = ConfigService.loadConfig();
            if (this.config) {
                log(`[SalatExtension ExtensionManager] Loaded config: City=${this.config.city.name}, Lang=${this.config.lang}`);
            }

            this.configMonitor = ConfigService.setupConfigMonitor(() => {
                log('[SalatExtension ExtensionManager] Config file changed on disk. Reloading config...');
                this.config = ConfigService.loadConfig();
                this.recreatePanelIndicator();
            });

            this.recreatePanelIndicator();

            if (this.timeoutId) {
                GLib.source_remove(this.timeoutId);
            }
            this.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this.onTick();
                return GLib.SOURCE_CONTINUE;
            });

            log('[SalatExtension ExtensionManager] Extension enabled successfully!');
        } catch (e: any) {
            log('[SalatExtension ExtensionManager] FATAL ERROR in enable(): ' + e.message + '\n' + e.stack);
        }
    }

    public disable(): void {
        log('[SalatExtension ExtensionManager] Disabling extension...');
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
            if (this.eventManager) {
                this.eventManager.reset();
            }
            SalatIndicator.destroyOldStatusAreaRole();
            log('[SalatExtension ExtensionManager] Extension disabled cleanly.');
        } catch (e: any) {
            log('[SalatExtension ExtensionManager] Error during disable(): ' + e.message);
        }
    }

    private onTick(): void {
        const now = new Date();
        if (!this.prayerTimesData || (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0)) {
            this.refreshPrayerTimes();
            return;
        }

        if (!this.config || !this.indicator) return;

        this.indicator.updatePanelText(this.prayerTimesData, this.config.iqamaDelays, this.config.lang, this.wuduDone);

        if (this.eventManager) {
            const { transitioned, shouldResetWudu } = this.eventManager.checkEvents(
                now,
                this.config,
                this.prayerTimesData,
                this.wuduDone,
                this.lastWuduPrayerKey
            );

            if (shouldResetWudu) {
                this.wuduDone = false;
                this.lastWuduPrayerKey = '';
            }

            if (transitioned) {
                this.reloadAndSyncUI();
                return;
            }
        }

        if (this.indicator.isMenuOpen()) {
            const monthly = PrayerService.getMonthlySchedule();
            this.indicator.updateHero(this.config, this.prayerTimesData, now, () => {
                this.reloadAndSyncUI();
            }, monthly);
        }
    }

    public recreatePanelIndicator(): void {
        log('[SalatExtension ExtensionManager] Rebuilding panel indicator from scratch...');
        try {
            if (this.indicator) {
                this.indicator.destroy();
                this.indicator = null;
            }
            if (this.eventManager) {
                this.eventManager.reset();
            }

            this.indicator = new SalatIndicator(this.dir, this.path);
            this.indicator.connectMenuOpen(() => {
                const now = new Date();
                if (this.config && this.prayerTimesData && this.indicator) {
                    const monthly = PrayerService.getMonthlySchedule();
                    this.indicator.updateHero(this.config, this.prayerTimesData, now, () => {
                        this.reloadAndSyncUI();
                    }, monthly);
                }
            });

            this.indicator.addToStatusArea();
            this.refreshPrayerTimes();
        } catch (e: any) {
            log('[SalatExtension ExtensionManager] Error recreating panel indicator: ' + e.message);
        }
    }

    public reloadAndSyncUI(): void {
        try {
            if (!this.config || !this.indicator) return;
            log('[SalatExtension ExtensionManager] Syncing UI...');

            this.indicator.updatePanelText(this.prayerTimesData, this.config.iqamaDelays, this.config.lang, this.wuduDone);

            const monthly = PrayerService.getMonthlySchedule();
            if (this.prayerTimesData) {
                this.indicator.rebuildMenu(
                    this.config,
                    this.prayerTimesData,
                    {
                        onSelectCity: (city: City) => {
                            log('[SalatExtension ExtensionManager] City selected: ' + city.name);
                            if (this.config) {
                                this.config.city = city;
                                ConfigService.saveConfig(this.config);
                            }
                            this.recreatePanelIndicator();
                        },
                        onSelectLang: (langCode: string) => {
                            log('[SalatExtension ExtensionManager] Language selected: ' + langCode);
                            if (this.config) {
                                this.config.lang = langCode;
                                ConfigService.saveConfig(this.config);
                            }
                            this.recreatePanelIndicator();
                        },
                        onSetIqamaDelay: (prayerKey: string, minutes: number) => {
                            log(`[SalatExtension ExtensionManager] Delay set for ${prayerKey}: +${minutes}m`);
                            if (this.config) {
                                this.config.iqamaDelays[prayerKey] = minutes;
                                ConfigService.saveConfig(this.config);
                            }
                            this.recreatePanelIndicator();
                        },
                        onResetIqamaDefaults: () => {
                            log('[SalatExtension ExtensionManager] Iqama delays reset to defaults.');
                            if (this.config) {
                                this.config.iqamaDelays = Object.assign({}, Constants.DEFAULT_IQAMA_DELAYS);
                                ConfigService.saveConfig(this.config);
                            }
                            this.recreatePanelIndicator();
                        },
                        onToggleLock: (enabled: boolean) => {
                            log('[SalatExtension ExtensionManager] Lock toggled: ' + enabled);
                            if (this.config) {
                                this.config.lockEnabled = enabled;
                                ConfigService.saveConfig(this.config);
                            }
                        },
                        onQuickWudu: () => {
                            this.toggleQuickWudu();
                        },
                        onOpenScheduleWindow: () => {
                            SystemService.openScheduleWindow(this.dir, this.path);
                        },
                        onOpenSettings: () => {
                            SystemService.openPreferences();
                        },
                        onReloadUI: () => {
                            this.reloadAndSyncUI();
                        }
                    },
                    this.wuduDone,
                    monthly
                );
            }
            log('[SalatExtension ExtensionManager] UI sync completed successfully.');
        } catch (e: any) {
            log('[SalatExtension ExtensionManager] Error in reloadAndSyncUI: ' + e.message + '\n' + e.stack);
        }
    }

    public refreshPrayerTimes(): void {
        if (!this.httpSession || !this.config) {
            log('[SalatExtension ExtensionManager] Cannot refresh prayer times: httpSession or config missing.');
            return;
        }
        log(`[SalatExtension ExtensionManager] Refreshing prayer times for city ID ${this.config.city.id} (${this.config.city.name})...`);
        PrayerService.fetchPrayerTimes(
            this.httpSession,
            this.config.city.id,
            (data: PrayerTimesData) => {
                log('[SalatExtension ExtensionManager] Received prayer times data successfully.');
                this.prayerTimesData = data;
                this.reloadAndSyncUI();
            },
            (err: Error) => {
                log('[SalatExtension ExtensionManager] Failed to fetch prayer times: ' + err.message);
            }
        );
    }

    public toggleQuickWudu(): void {
        const now = new Date();
        const prayers = this.prayerTimesData && this.config
            ? Calculator.getPrayerEntries(this.prayerTimesData, this.config.iqamaDelays, this.config.lang, now)
            : [];
        const active = Calculator.findActivePrayer(prayers, this.config ? this.config.iqamaDelays : Constants.DEFAULT_IQAMA_DELAYS, now);
        const prayerName = active ? active.prayer.name : '';
        const prayerKey = active ? active.prayer.key : '';

        this.wuduDone = !this.wuduDone;
        if (this.wuduDone) {
            this.lastWuduPrayerKey = prayerKey;
        } else {
            this.lastWuduPrayerKey = '';
        }

        log(`[SalatExtension ExtensionManager] 💧 Quick Wudu toggled: done=${this.wuduDone} for prayer=${prayerName}`);
        this.reloadAndSyncUI();

        const lang = this.config ? this.config.lang : 'auto';
        if (this.wuduDone) {
            NotificationService.notifyWuduDone(prayerName, lang);
            if (this.config && this.config.wuduAudioPath && this.config.wuduAudioPath.trim().length > 0) {
                AudioService.playAudio(this.config.wuduAudioPath, this.dir, this.path);
            } else {
                AudioService.playSystemSound('message-new-instant');
            }
        } else {
            NotificationService.notifyWuduCleared(prayerName, lang);
        }
    }
}
