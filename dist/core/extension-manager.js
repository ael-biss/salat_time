var GLib = imports.gi.GLib;
var Constants = imports.misc.extensionUtils.getCurrentExtension().imports['core']['constants'];
var ConfigService = imports.misc.extensionUtils.getCurrentExtension().imports['services']['config-service'];
var PrayerService = imports.misc.extensionUtils.getCurrentExtension().imports['services']['prayer-service'];
var AudioService = imports.misc.extensionUtils.getCurrentExtension().imports['services']['audio-service'];
var NotificationService = imports.misc.extensionUtils.getCurrentExtension().imports['services']['notification-service'];
var SystemService = imports.misc.extensionUtils.getCurrentExtension().imports['services']['system-service'];
var Calculator = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['calculator'];
var { PrayerEventManager } = imports.misc.extensionUtils.getCurrentExtension().imports['core']['event-manager'];
var { SalatIndicator } = imports.misc.extensionUtils.getCurrentExtension().imports['ui']['indicator'];
var ExtensionManager = class ExtensionManager {
    constructor(dir, path) {
        this.indicator = null;
        this.timeoutId = 0;
        this.httpSession = null;
        this.config = null;
        this.configMonitor = null;
        this.prayerTimesData = null;
        this.eventManager = null;
        this.wuduDone = false;
        this.lastWuduPrayerKey = '';
        this.dir = null;
        this.path = '';
        this.dir = dir;
        this.path = path || '';
        this.eventManager = new PrayerEventManager(dir, path);
    }
    enable() {
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
        }
        catch (e) {
            log('[SalatExtension ExtensionManager] FATAL ERROR in enable(): ' + e.message + '\n' + e.stack);
        }
    }
    disable() {
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
        }
        catch (e) {
            log('[SalatExtension ExtensionManager] Error during disable(): ' + e.message);
        }
    }
    onTick() {
        const now = new Date();
        if (!this.prayerTimesData || (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0)) {
            this.refreshPrayerTimes();
            return;
        }
        if (!this.config || !this.indicator)
            return;
        this.indicator.updatePanelText(this.prayerTimesData, this.config.iqamaDelays, this.config.lang, this.wuduDone);
        if (this.eventManager) {
            const { transitioned, shouldResetWudu } = this.eventManager.checkEvents(now, this.config, this.prayerTimesData, this.wuduDone, this.lastWuduPrayerKey);
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
    recreatePanelIndicator() {
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
        }
        catch (e) {
            log('[SalatExtension ExtensionManager] Error recreating panel indicator: ' + e.message);
        }
    }
    reloadAndSyncUI() {
        try {
            if (!this.config || !this.indicator)
                return;
            log('[SalatExtension ExtensionManager] Syncing UI...');
            this.indicator.updatePanelText(this.prayerTimesData, this.config.iqamaDelays, this.config.lang, this.wuduDone);
            const monthly = PrayerService.getMonthlySchedule();
            if (this.prayerTimesData) {
                this.indicator.rebuildMenu(this.config, this.prayerTimesData, {
                    onSelectCity: (city) => {
                        log('[SalatExtension ExtensionManager] City selected: ' + city.name);
                        if (this.config) {
                            this.config.city = city;
                            ConfigService.saveConfig(this.config);
                        }
                        this.recreatePanelIndicator();
                    },
                    onSelectLang: (langCode) => {
                        log('[SalatExtension ExtensionManager] Language selected: ' + langCode);
                        if (this.config) {
                            this.config.lang = langCode;
                            ConfigService.saveConfig(this.config);
                        }
                        this.recreatePanelIndicator();
                    },
                    onSetIqamaDelay: (prayerKey, minutes) => {
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
                    onToggleLock: (enabled) => {
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
                }, this.wuduDone, monthly);
            }
            log('[SalatExtension ExtensionManager] UI sync completed successfully.');
        }
        catch (e) {
            log('[SalatExtension ExtensionManager] Error in reloadAndSyncUI: ' + e.message + '\n' + e.stack);
        }
    }
    refreshPrayerTimes() {
        if (!this.httpSession || !this.config) {
            log('[SalatExtension ExtensionManager] Cannot refresh prayer times: httpSession or config missing.');
            return;
        }
        log(`[SalatExtension ExtensionManager] Refreshing prayer times for city ID ${this.config.city.id} (${this.config.city.name})...`);
        PrayerService.fetchPrayerTimes(this.httpSession, this.config.city.id, (data) => {
            log('[SalatExtension ExtensionManager] Received prayer times data successfully.');
            this.prayerTimesData = data;
            this.reloadAndSyncUI();
        }, (err) => {
            log('[SalatExtension ExtensionManager] Failed to fetch prayer times: ' + err.message);
        });
    }
    toggleQuickWudu() {
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
        }
        else {
            this.lastWuduPrayerKey = '';
        }
        log(`[SalatExtension ExtensionManager] 💧 Quick Wudu toggled: done=${this.wuduDone} for prayer=${prayerName}`);
        this.reloadAndSyncUI();
        const lang = this.config ? this.config.lang : 'auto';
        if (this.wuduDone) {
            NotificationService.notifyWuduDone(prayerName, lang);
            if (this.config && this.config.wuduAudioPath && this.config.wuduAudioPath.trim().length > 0) {
                AudioService.playAudio(this.config.wuduAudioPath, this.dir, this.path);
            }
            else {
                AudioService.playSystemSound('message-new-instant');
            }
        }
        else {
            NotificationService.notifyWuduCleared(prayerName, lang);
        }
    }
}
