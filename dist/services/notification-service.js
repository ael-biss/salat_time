var GLib = imports.gi.GLib;
var I18n = imports.misc.extensionUtils.getCurrentExtension().imports['utils']['i18n'];
function escapeQuotes(str) {
    return str.replace(/"/g, '\\"');
}
function notifyAdhan(lang) {
    const title = I18n.t('adhan', lang);
    GLib.spawn_command_line_async(`notify-send -u critical "Salat Timer" "📢 ${escapeQuotes(title)} time!"`);
}
function notifyDuaa(lang) {
    const title = I18n.t('duaa_title', lang);
    let body = I18n.t('duaa_text', lang);
    if (lang === 'en') {
        body += "\n\nO Allah, Lord of this perfect call and established prayer, grant Muhammad the intercession and distinction, and resurrect him to the praised position You have promised him.";
    }
    else if (lang === 'fr') {
        body += "\n\nÔ Allah, Seigneur de cet appel parfait et de la prière établie, accorde à Muhammad l'intercession et l'éminence, et ressuscite-le au rang louable que Tu lui as promis.";
    }
    try {
        GLib.spawn_command_line_async(`notify-send -u normal "${escapeQuotes(title)}" "${escapeQuotes(body)}"`);
    }
    catch (e) {
        log('[SalatExtension NotificationService] Error sending Du\'aa notification: ' + e.message);
    }
}
function notifyFriday(minutes, lang) {
    const title = I18n.t('friday_reminder_title', lang);
    const body = I18n.t('friday_reminder_body', lang, { minutes });
    try {
        GLib.spawn_command_line_async(`notify-send -u critical "${escapeQuotes(title)}" "${escapeQuotes(body)}"`);
    }
    catch (e) {
        log('[SalatExtension NotificationService] Error sending Friday reminder: ' + e.message);
    }
}
function notifyWudu(prayerName, minutes, lang) {
    const title = I18n.t('wudu_reminder_title', lang);
    const body = I18n.t('wudu_reminder_body', lang, { prayer: prayerName, minutes });
    try {
        GLib.spawn_command_line_async(`notify-send -u normal "${escapeQuotes(title)}" "${escapeQuotes(body)}"`);
    }
    catch (e) {
        log('[SalatExtension NotificationService] Error sending Wudu notification: ' + e.message);
    }
}
function notifyWuduDone(prayerName, lang) {
    const title = I18n.t('wudu_marked_title', lang);
    const body = I18n.t('wudu_marked_body', lang, { prayer: prayerName });
    try {
        GLib.spawn_command_line_async(`notify-send -u normal "${escapeQuotes(title)}" "${escapeQuotes(body)}"`);
    }
    catch (e) {
        log('[SalatExtension NotificationService] Error sending Wudu done notification: ' + e.message);
    }
}
function notifyWuduCleared(prayerName, lang) {
    const title = I18n.t('wudu_cleared_title', lang);
    const body = I18n.t('wudu_cleared_body', lang, { prayer: prayerName });
    try {
        GLib.spawn_command_line_async(`notify-send -u normal "${escapeQuotes(title)}" "${escapeQuotes(body)}"`);
    }
    catch (e) {
        log('[SalatExtension NotificationService] Error sending Wudu cleared notification: ' + e.message);
    }
}
function notifyIqama(prayerName) {
    try {
        GLib.spawn_command_line_async(`notify-send "Salat Timer" "🕌 Iqama time for ${escapeQuotes(prayerName)}!"`);
    }
    catch (e) { }
}
function notifyLocking() {
    try {
        GLib.spawn_command_line_async('notify-send -u critical "Salat Timer" "🔒 Iqama finished! Locking screen..."');
    }
    catch (e) { }
}
