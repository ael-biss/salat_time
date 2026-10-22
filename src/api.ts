/// <reference path="./types.d.ts" />
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';
import * as Constants from './constants.js';

function securePermissions(path: string, mode: number): void {
    try {
        let f = Gio.File.new_for_path(path);
        f.set_attribute_uint32(Gio.FILE_ATTRIBUTE_UNIX_MODE, mode, Gio.FileQueryInfoFlags.NONE, null);
    } catch (e: any) {}
}

export function createSession(): any {
    return new Soup.Session();
}

export function loadCache(): MonthlyCacheData {
    let cache: MonthlyCacheData = { cities: {} };
    try {
        if (!GLib.file_test(Constants.CACHE_FILE, GLib.FileTest.EXISTS)) return cache;
        let [ok, contents] = GLib.file_get_contents(Constants.CACHE_FILE);
        if (!ok) return cache;
        let parsed = JSON.parse(new TextDecoder('utf-8').decode(contents));
        if (parsed && typeof parsed.cities === 'object') {
            cache = parsed;
        }
    } catch (e: any) {
        log('[SalatExtension API] Load cache error: ' + e.message);
    }
    return cache;
}

export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function saveCache(cache: MonthlyCacheData): void {
    try {
        if (!GLib.file_test(Constants.CONFIG_DIR, GLib.FileTest.EXISTS)) {
            GLib.mkdir_with_parents(Constants.CONFIG_DIR, 0o700);
        }
        securePermissions(Constants.CONFIG_DIR, 0o700);
        cache.lastUpdated = Date.now();
        let data = JSON.stringify(cache, null, 2);
        GLib.file_set_contents(Constants.CACHE_FILE, new TextEncoder().encode(data));
        securePermissions(Constants.CACHE_FILE, 0o600);
        log('[SalatExtension API] Saved cache securely (0600) to ' + Constants.CACHE_FILE);
    } catch (e: any) {
        log('[SalatExtension API] Save cache error: ' + e.message);
    }
}

export function getCachedPrayerTimes(cityId: number, date: Date): PrayerTimesData | null {
    try {
        let cache = loadCache();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const monthKey = `${year}-${month}`;
        const dayKey = String(date.getDate());
        const cid = String(cityId);

        if (cache.cities && cache.cities[cid] && cache.cities[cid][monthKey]) {
            return cache.cities[cid][monthKey][dayKey] || null;
        }
    } catch (e: any) {
        log('[SalatExtension API] Get cached prayer error: ' + e.message);
    }
    return null;
}

export function setCachedPrayerTimes(cityId: number, date: Date, data: PrayerTimesData): void {
    try {
        let cache = loadCache();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const monthKey = `${year}-${month}`;
        const dayKey = String(date.getDate());
        const cid = String(cityId);

        if (!cache.cities) cache.cities = {};
        if (!cache.cities[cid]) cache.cities[cid] = {};
        if (!cache.cities[cid][monthKey]) cache.cities[cid][monthKey] = {};

        cache.cities[cid][monthKey][dayKey] = data;
        saveCache(cache);
    } catch (e: any) {
        log('[SalatExtension API] Set cached prayer error: ' + e.message);
    }
}

export function getCacheStatus(cityId: number, date: Date = new Date()): { cachedDays: number; totalDays: number } {
    try {
        let cache = loadCache();
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const totalDays = new Date(year, month, 0).getDate();
        const cid = String(cityId);

        let cachedDays = 0;
        if (cache.cities && cache.cities[cid] && cache.cities[cid][monthKey]) {
            cachedDays = Object.keys(cache.cities[cid][monthKey]).length;
        }
        return { cachedDays, totalDays };
    } catch (e: any) {
        return { cachedDays: 0, totalDays: 31 };
    }
}

export function syncMonthlyCache(
    session: any,
    cityId: number,
    force: boolean = false,
    onComplete?: (count: number) => void
): void {
    if (!session) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const totalDays = new Date(year, month, 0).getDate();
    const cid = String(cityId);

    let cache = loadCache();
    if (!cache.cities) cache.cities = {};
    if (!cache.cities[cid]) cache.cities[cid] = {};
    if (!cache.cities[cid][monthKey]) cache.cities[cid][monthKey] = {};
    if (!cache.lastSyncTimes) cache.lastSyncTimes = {};

    let monthData = cache.cities[cid][monthKey];
    const syncKey = `${cid}_${monthKey}`;
    const lastSync = cache.lastSyncTimes[syncKey] || 0;
    const isStale = (now.getTime() - lastSync) >= ONE_WEEK_MS;

    let missingDays: number[] = [];
    for (let d = 1; d <= totalDays; d++) {
        if (isStale || force || !monthData[String(d)]) {
            missingDays.push(d);
        }
    }

    if (missingDays.length === 0) {
        log(`[SalatExtension API] Monthly cache up-to-date for city ${cityId} (${monthKey}) within the past 7 days.`);
        if (onComplete) onComplete(totalDays);
        return;
    }

    log(`[SalatExtension API] Syncing monthly cache for city ${cityId} (${monthKey}): fetching ${missingDays.length} days in background (weekly refresh=${isStale})...`);

    let newCount = 0;
    const fetchDay = (idx: number) => {
        if (idx >= missingDays.length) {
            cache.lastSyncTimes![syncKey] = Date.now();
            saveCache(cache);
            const total = Object.keys(cache.cities[cid][monthKey]).length;
            log(`[SalatExtension API] Completed weekly monthly cache sync! ${total}/${totalDays} days now securely cached in ${Constants.CACHE_FILE}`);
            if (onComplete) onComplete(total);
            return;
        }

        const day = missingDays[idx];
        const url = `https://apisearch.hadithm6.ma/api/prieres/ville/${cityId}/${month}/${day}`;
        const request = Soup.Message.new('GET', url);

        const handleSuccess = (rawText: string) => {
            try {
                const parsed = JSON.parse(rawText);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    cache.cities[cid][monthKey][String(day)] = parsed[0];
                    newCount++;
                }
            } catch (e: any) {}
            // polite 50ms interval between requests
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                fetchDay(idx + 1);
                return GLib.SOURCE_REMOVE;
            });
        };

        if (session.send_and_read_async) {
            session.send_and_read_async(request, GLib.PRIORITY_DEFAULT, null, (_sess: any, res: any) => {
                try {
                    const bytes = session.send_and_read_finish(res);
                    handleSuccess(new TextDecoder('utf-8').decode(bytes.get_data()));
                } catch (e: any) {
                    fetchDay(idx + 1);
                }
            });
        } else {
            session.queue_message(request, (_sess: any, message: any) => {
                if (message.status_code === 200) {
                    handleSuccess(message.response_body.data);
                } else {
                    fetchDay(idx + 1);
                }
            });
        }
    };

    fetchDay(0);
}

export function fetchPrayerTimes(
    session: any,
    cityId: number,
    onSuccess: (data: PrayerTimesData) => void,
    onError?: (err: Error) => void
): void {
    const now = new Date();

    // 1. Instant check from offline cache
    const cached = getCachedPrayerTimes(cityId, now);
    if (cached) {
        log('[SalatExtension API] Loaded prayer times immediately from offline cache for city ' + cityId);
        onSuccess(cached);
    }

    if (!session) {
        if (!cached && onError) onError(new Error('No HTTP session'));
        return;
    }

    // 2. Network live request
    const url = `https://apisearch.hadithm6.ma/api/prieres/ville/${cityId}/${now.getMonth() + 1}/${now.getDate()}`;
    log('[SalatExtension API] Requesting live prayer times URL: ' + url);
    const request = Soup.Message.new('GET', url);

    const parseResponse = (responseText: string) => {
        try {
            log('[SalatExtension API] Raw response length: ' + responseText.length);
            const data = JSON.parse(responseText);
            if (Array.isArray(data) && data.length > 0) {
                log('[SalatExtension API] Prayer data successfully parsed from live API.');
                setCachedPrayerTimes(cityId, now, data[0]);
                onSuccess(data[0]);

                // Sync the rest of the month in background so offline mode is fully prepared
                syncMonthlyCache(session, cityId);
            } else {
                log('[SalatExtension API] Response is empty array or invalid format.');
                if (!cached && onError) onError(new Error('Empty array in API response'));
            }
        } catch (e: any) {
            log('[SalatExtension API] Parse error: ' + e.message);
            if (!cached && onError) onError(e);
        }
    };

    if (session.send_and_read_async) {
        session.send_and_read_async(request, GLib.PRIORITY_DEFAULT, null, (_sess: any, res: any) => {
            try {
                const bytes = session.send_and_read_finish(res);
                parseResponse(new TextDecoder('utf-8').decode(bytes.get_data()));
            } catch (e: any) {
                log('[SalatExtension API] Network fetch error (running offline): ' + e.message);
                if (cached) {
                    log('[SalatExtension API] Seamlessly continuing with cached prayer times.');
                } else if (onError) {
                    onError(e);
                }
            }
        });
    } else {
        session.queue_message(request, (_sess: any, message: any) => {
            if (message.status_code === 200) {
                parseResponse(message.response_body.data);
            } else {
                log('[SalatExtension API] Queue message failed status (running offline): ' + message.status_code);
                if (cached) {
                    log('[SalatExtension API] Seamlessly continuing with cached prayer times.');
                } else if (onError) {
                    onError(new Error(`HTTP Status ${message.status_code}`));
                }
            }
        });
    }
}
