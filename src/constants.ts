/// <reference path="./types.d.ts" />
import GLib from 'gi://GLib';

export const CONFIG_DIR: string = GLib.get_user_config_dir() + '/salat-gnome-extension';
export const CONFIG_FILE: string = CONFIG_DIR + '/config.json';
export const CACHE_FILE: string = CONFIG_DIR + '/cache.json';
export const CLOUDFLARE_API_URL: string = 'https://small-morning-6206.abdo-bissari.workers.dev/api/sala-al-jadida';

export const CITIES: City[] = [
    { id: 1, name: 'Sala Al Jadida' },
    { id: 5, name: 'Casablanca' },
    { id: 10, name: 'Marrakech' },
    { id: 11, name: 'Tanger' },
    { id: 6, name: 'Fès' },
    { id: 9, name: 'Agadir' },
    { id: 7, name: 'Meknès' },
    { id: 8, name: 'Oujda' },
    { id: 12, name: 'Tétouan' },
    { id: 13, name: 'Kénitra' },
    { id: 14, name: 'Safi' },
    { id: 15, name: 'Nador' },
    { id: 16, name: 'Béni Mellal' },
    { id: 17, name: 'El Jadida' },
    { id: 28, name: 'Mohammedia' },
    { id: 29, name: 'Dakhla' },
    { id: 30, name: 'Laâyoune' }
];

export const DEFAULT_IQAMA_DELAYS: IqamaDelays = {
    Fajr: 30,
    Dhuhr: 15,
    Asr: 15,
    Maghrib: 10,
    Ishae: 15
};

export const PRAYER_EMOJIS: Record<string, string> = {
    Fajr: '🌅',
    Dhuhr: '☀️',
    Asr: '🌤',
    Maghrib: '🌙',
    Ishae: '🌌'
};
