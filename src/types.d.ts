// Ambient Types & Declarations for Moroccan Salat GNOME Extension (GNOME 45+ ESM)

declare module 'gi://*';
declare module 'resource://*';

declare function log(message: string): void;

interface City {
    id: number;
    name: string;
}

interface IqamaDelays {
    Fajr: number;
    Dhuhr: number;
    Asr: number;
    Maghrib: number;
    Ishae: number;
    [key: string]: number;
}

interface PrayerEntry {
    key: string;
    name: string;
    time: string;
    delay: number;
    adhanDate: Date;
    iqamaDate: Date;
}

interface ActivePrayer {
    phase: 'IQAMA' | 'NEXT_ADHAN';
    prayer: PrayerEntry;
}

interface UserConfig {
    city: City;
    lang: string;
    iqamaDelays: IqamaDelays;
    lockEnabled?: boolean;
    customLockCommand?: string;
    adhanAudioPath?: string;
    duaaAfterAdhan?: boolean;
    duaaAudioPath?: string;
    fridayReminderEnabled?: boolean;
    fridayReminderMinutes?: number;
    wuduReminderEnabled?: boolean;
    wuduReminderMinutes?: number;
    wuduAudioPath?: string;
}

interface MonthlyScheduleDay {
    date?: string;
    day_ar: string;
    hijri_day: string;
    gregorian_day: number | string;
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
    is_today?: boolean;
}

interface MonthlyScheduleData {
    city: string;
    city_label: string;
    hijri_month: string;
    gregorian_period: string;
    days_count: number;
    days: MonthlyScheduleDay[];
    last_updated?: string;
}

interface MonthlyCacheData {
    cities: {
        [cityId: string]: {
            [yearMonth: string]: {
                [day: string]: PrayerTimesData;
            };
        };
    };
    monthlySchedule?: MonthlyScheduleData;
    lastSyncTimes?: {
        [key: string]: number;
    };
    lastUpdated?: number;
}

interface PrayerTimesData {
    Fajr: string;
    Dhuhr: string;
    Asr: string;
    Maghrib: string;
    Ishae: string;
    [key: string]: any;
}

interface LanguageOption {
    code: string;
    name: string;
}

interface TranslationDict {
    [key: string]: string;
}

interface TranslationsMap {
    [lang: string]: TranslationDict;
}
