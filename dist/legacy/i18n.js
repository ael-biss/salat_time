
var GLib = imports.gi.GLib;
var LANGUAGES = [
    { code: "auto", name: "Auto (System Language)" },
    { code: "en", name: "English" },
    { code: "ar", name: "العربية (Arabic)" },
    { code: "fr", name: "Français (French)" },
];
var TRANSLATIONS = {
    en: {
        loading: "Loading Salat...",
        adhan_in: "{prayer} in {time}",
        iqama_in: " Iqama ({prayer}) in {time}",
        fajr: "Fajr",
        dhuhr: "Dhuhr",
        asr: "Asr",
        maghrib: "Maghrib",
        isha: "Isha",
        adhan: "Adhan",
        iqama: "Iqama",
        custom_iqama: "⚙ Custom Iqama Delays",
        reset_defaults: "🔄 Reset All Delays to Default",
        minutes_after: "{min} minutes after Adhan",
        official_header: "📍 {city}",
        prefs_general_title: "General Settings",
        prefs_general_desc: "Select your city and language preference.",
        prefs_city_title: "City",
        prefs_lang_title: "Language",
        prefs_iqama_title: "Iqama Delays",
        prefs_iqama_desc: "Set the delay (in minutes) after Adhan for each prayer.",
        prefs_adhan_title: "Adhan & Audio",
        prefs_adhan_desc: "Configure the Adhan sound and choose a custom audio file.",
        prefs_adhan_path: "Adhan Audio File",
        prefs_adhan_path_sub: "Leave empty to use the bundled Moroccan Adhan",
        prefs_adhan_browse: "Browse...",
        prefs_adhan_test: "▶ Test",
        prefs_adhan_reset: "Reset",
        prefs_adhan_default: "Default (bundled adan.mp3)",
        prefs_lock_title: "Lock Screen on Iqama",
        prefs_lock_desc: "Automatically lock the screen when Iqama countdown reaches zero.",
        prefs_lock_enable: "Enable Screen Lock",
        prefs_lock_enable_sub: "Lock screen when prayer time starts (ft_lock)",
        prefs_lock_cmd: "Custom Lock Command",
        prefs_lock_cmd_sub: "Default: ft_lock (falls back to loginctl / gnome-screensaver)",
        lock_screen: "🔒 Lock on Iqama",
        open_settings: "⚙ Open Settings",
        prefs_actions_title: "Save & Apply",
        prefs_save_button: "💾 Save & Apply Settings",
        prefs_saved_success: "✔ Saved & Applied Successfully!",
    },
    ar: {
        loading: "جاري تحميل مواقيت الصلاة...",
        adhan_in: "{prayer} بعد {time}",
        iqama_in: " إقامة ({prayer}) بعد {time}",
        fajr: "الفجر",
        dhuhr: "الظهر",
        asr: "العصر",
        maghrib: "المغرب",
        isha: "العشاء",
        adhan: "الأذان",
        iqama: "الإقامة",
        custom_iqama: "⚙ أوقات الإقامة",
        reset_defaults: "🔄 إعادة ضبط الأوقات الافتراضية",
        minutes_after: "{min} دقيقة بعد الأذان",
        official_header: "📍 {city}",
        prefs_general_title: "الإعدادات العامة",
        prefs_general_desc: "اختر مدينتك ولغتك المفضلة.",
        prefs_city_title: "المدينة",
        prefs_lang_title: "اللغة",
        prefs_iqama_title: "أوقات الإقامة",
        prefs_iqama_desc: "حدد مدة الإقامة (بالدقائق) بعد الأذان لكل صلاة.",
        prefs_adhan_title: "الأذان والصوت",
        prefs_adhan_desc: "تخصيص صوت الأذان واختيار ملف صوتي من جهازك.",
        prefs_adhan_path: "ملف صوت الأذان",
        prefs_adhan_path_sub: "اتركه فارغاً لاستخدام أذان المغرب الافتراضي",
        prefs_adhan_browse: "استعراض...",
        prefs_adhan_test: "▶ تجربة",
        prefs_adhan_reset: "استعادة الافتراضي",
        prefs_adhan_default: "الافتراضي (صوت الأذان المدمج)",
        prefs_lock_title: "قفل الشاشة عند الإقامة",
        prefs_lock_desc: "قفل الشاشة تلقائياً عند انتهاء وقت الإقامة للذهاب للصلاة.",
        prefs_lock_enable: "تفعيل قفل الشاشة",
        prefs_lock_enable_sub: "قفل الشاشة عند بداية الصلاة (ft_lock)",
        prefs_lock_cmd: "أمر القفل المخصص",
        prefs_lock_cmd_sub: "الافتراضي: ft_lock (أو loginctl / gnome-screensaver)",
        lock_screen: "🔒 قفل الشاشة عند الإقامة",
        open_settings: "⚙ فتح الإعدادات",
        prefs_actions_title: "حفظ وتطبيق الإعدادات",
        prefs_save_button: "💾 حفظ وتطبيق الآن",
        prefs_saved_success: "✔ تم الحفظ والتطبيق بنجاح!",
    },
    fr: {
        loading: "Chargement des prières...",
        adhan_in: "{prayer} dans {time}",
        iqama_in: " Iqama ({prayer}) dans {time}",
        fajr: "Fajr",
        dhuhr: "Dhuhr",
        asr: "Asr",
        maghrib: "Maghrib",
        isha: "Isha",
        adhan: "Adhan",
        iqama: "Iqama",
        custom_iqama: "⚙ Délais d'Iqama",
        reset_defaults: "🔄 Réinitialiser les délais",
        minutes_after: "{min} minutes après l'Adhan",
        official_header: "📍 {city}",
        prefs_general_title: "Paramètres généraux",
        prefs_general_desc: "Sélectionnez votre ville et votre langue.",
        prefs_city_title: "Ville",
        prefs_lang_title: "Langue",
        prefs_iqama_title: "Délais d'Iqama",
        prefs_iqama_desc: "Définissez le délai (en minutes) après l'Adhan pour chaque prière.",
        prefs_adhan_title: "Adhan & Audio",
        prefs_adhan_desc: "Personnaliser le son de l'Adhan avec un fichier audio local.",
        prefs_adhan_path: "Fichier audio de l'Adhan",
        prefs_adhan_path_sub: "Laisser vide pour utiliser l'Adhan marocain intégré",
        prefs_adhan_browse: "Parcourir...",
        prefs_adhan_test: "▶ Tester",
        prefs_adhan_reset: "Réinitialiser",
        prefs_adhan_default: "Par défaut (Adhan intégré)",
        prefs_lock_title: "Verrouillage de l'écran à l'Iqama",
        prefs_lock_desc: "Verrouiller automatiquement l'écran à la fin du compte à rebours de l'Iqama.",
        prefs_lock_enable: "Activer le verrouillage de l'écran",
        prefs_lock_enable_sub: "Verrouiller l'écran à l'heure de la prière (ft_lock)",
        prefs_lock_cmd: "Commande de verrouillage personnalisée",
        prefs_lock_cmd_sub: "Par défaut : ft_lock (ou loginctl / gnome-screensaver)",
        lock_screen: "🔒 Verrouiller à l'Iqama",
        open_settings: "⚙ Ouvrir les paramètres",
        prefs_actions_title: "Enregistrer & Appliquer",
        prefs_save_button: "💾 Enregistrer & Appliquer",
        prefs_saved_success: "✔ Enregistré et appliqué !",
    },
};
function getSystemLang() {
    try {
        let locales = GLib.get_language_names();
        for (let loc of locales) {
            if (loc.startsWith("ar"))
                return "ar";
            if (loc.startsWith("fr"))
                return "fr";
            if (loc.startsWith("en"))
                return "en";
        }
    }
    catch (e) { }
    return "en";
}
function resolveLang(langCode) {
    if (!langCode || langCode === "auto")
        return getSystemLang();
    return TRANSLATIONS[langCode] ? langCode : "en";
}
function t(key, langCode = "auto", params = {}) {
    let dict = TRANSLATIONS[resolveLang(langCode)] || TRANSLATIONS["en"];
    let str = dict[key] || TRANSLATIONS["en"][key] || key;
    for (let p in params) {
        str = str.replace(new RegExp(`\\{${p}\\}`, "g"), params[p]);
    }
    return str;
}
