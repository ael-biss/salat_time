function formatDiff(diffMs) {
    const totalSecs = Math.max(0, Math.floor(diffMs / 1000));
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0)
        return `${hours}h ${mins}m`;
    if (mins > 0)
        return `${mins}m ${secs}s`;
    return `${secs}s`;
}
function formatHeroCountdown(diffMs) {
    const totalSecs = Math.max(0, Math.floor(diffMs / 1000));
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) {
        return `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    }
    if (mins > 0) {
        return `${mins}m ${String(secs).padStart(2, '0')}s`;
    }
    return `${secs}s`;
}
function formatHeaderDate(now, lang, monthlySchedule) {
    const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysFr = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const daysAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthsFr = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'];
    let dayName = daysEn[now.getDay()];
    let monthName = monthsEn[now.getMonth()];
    if (lang === 'fr') {
        dayName = daysFr[now.getDay()];
        monthName = monthsFr[now.getMonth()];
    }
    else if (lang === 'ar') {
        dayName = daysAr[now.getDay()];
        monthName = monthsAr[now.getMonth()];
    }
    const gregDate = `${dayName} ${now.getDate()} ${monthName}`;
    let hijriStr = '';
    if (monthlySchedule) {
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const found = Array.isArray(monthlySchedule.days)
            ? monthlySchedule.days.find((d) => d.date === todayIso || Number(d.gregorian_day) === now.getDate())
            : null;
        if (found && found.hijri_day) {
            hijriStr = `${found.hijri_day} ${monthlySchedule.hijri_month || ''}`.trim();
        }
        else if (monthlySchedule.hijri_month) {
            hijriStr = monthlySchedule.hijri_month;
        }
    }
    if (hijriStr) {
        return `${gregDate} · ${hijriStr}`;
    }
    return gregDate;
}
