var GLib = imports.gi.GLib;
var CONFIG_DIR = GLib.get_user_config_dir() + '/salat-gnome-extension';
var CONFIG_FILE = CONFIG_DIR + '/config.json';
var CACHE_FILE = CONFIG_DIR + '/cache.json';
var CLOUDFLARE_API_URL = 'https://small-morning-6206.abdo-bissari.workers.dev/api/sala-al-jadida';
var CITIES = [
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
var DEFAULT_IQAMA_DELAYS = {
    Fajr: 30,
    Dhuhr: 15,
    Asr: 15,
    Maghrib: 10,
    Ishae: 15
};
var PRAYER_EMOJIS = {
    Fajr: '🌅',
    Dhuhr: '☀️',
    Asr: '🌤',
    Maghrib: '🌙',
    Ishae: '🌌'
};
