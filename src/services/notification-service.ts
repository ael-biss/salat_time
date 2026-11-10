/// <reference path="../types.d.ts" />
import GLib from 'gi://GLib';
import * as I18n from '../utils/i18n.js';

function escapeQuotes(str: string): string {
    return str.replace(/"/g, '\\"');
}

export function notifyAdhan(lang: string): void {
    const title = I18n.t('adhan', lang);
    GLib.spawn_command_line_async(`notify-send -u critical "Salat Timer" "📢 ${escapeQuotes(title)} time!"`);
}

export function notifyDuaa(lang: string): void {
    const title = I18n.t('duaa_title', lang);
    let body = I18n.t('duaa_text', lang);
    if (lang === 'en') {
        body += "\n\nO Allah, Lord of this perfect call and established prayer, grant Muhammad the intercession and distinction, and resurrect him to the praised position You have promised him.";
    } else if (lang === 'fr') {
        body += "\n\nÔ Allah, Seigneur de cet appel parfait et de la prière établie, accorde à Muhammad l'intercession et l'éminence, et ressuscite-le au rang louable que Tu lui as promis.";
    }

    try {
        GLib.spawn_command_line_async(`notify-send -u normal "${escapeQuotes(title)}" "${escapeQuotes(body)}"`);
    } catch (e: any) {
        log('[SalatExtension NotificationService] Error sending Du\'aa notification: ' + e.message);
    }
}

export function notifyFriday(minutes: number, lang: string): void {
    const title = I18n.t('friday_reminder_title', lang);
    const body = I18n.t('friday_reminder_body', lang, { minutes });
    try {
        GLib.spawn_command_line_async(`notify-send -u critical "${escapeQuotes(title)}" "${escapeQuotes(body)}"`);
    } catch (e: any) {
        log('[SalatExtension NotificationService] Error sending Friday reminder: ' + e.message);
    }
}

export function notifyWudu(prayerName: string, minutes: number, lang: string): void {
    const title = I18n.t('wudu_reminder_title', lang);
    const body = I18n.t('wudu_reminder_body', lang, { prayer: prayerName, minutes });
    try {
        GLib.spawn_command_line_async(`notify-send -u normal "${escapeQuotes(title)}" "${escapeQuotes(body)}"`);
    } catch (e: any) {
        log('[SalatExtension NotificationService] Error sending Wudu notification: ' + e.message);
    }
}

export function notifyWuduDone(prayerName: string, lang: string): void {
    const title = I18n.t('wudu_marked_title', lang);
    const body = I18n.t('wudu_marked_body', lang, { prayer: prayerName });
    try {
        GLib.spawn_command_line_async(`notify-send -u normal "${escapeQuotes(title)}" "${escapeQuotes(body)}"`);
    } catch (e: any) {
        log('[SalatExtension NotificationService] Error sending Wudu done notification: ' + e.message);
    }
}

export function notifyWuduCleared(prayerName: string, lang: string): void {
    const title = I18n.t('wudu_cleared_title', lang);
    const body = I18n.t('wudu_cleared_body', lang, { prayer: prayerName });
    try {
        GLib.spawn_command_line_async(`notify-send -u normal "${escapeQuotes(title)}" "${escapeQuotes(body)}"`);
    } catch (e: any) {
        log('[SalatExtension NotificationService] Error sending Wudu cleared notification: ' + e.message);
    }
}

export function notifyIqama(prayerName: string): void {
    try {
        GLib.spawn_command_line_async(`notify-send "Salat Timer" "🕌 Iqama time for ${escapeQuotes(prayerName)}!"`);
    } catch (e: any) {}
}

export function notifyLocking(): void {
    try {
        GLib.spawn_command_line_async('notify-send -u critical "Salat Timer" "🔒 Iqama finished! Locking screen..."');
    } catch (e: any) {}
}
