const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// "Sab 5 dic · 20:00": l'anno compare solo se diverso da quello corrente.
export function experienceDateLabel(date: Date | null, withTime = true) {
  if (!date || Number.isNaN(date.getTime())) return 'Data da definire';
  const year = date.getFullYear() === new Date().getFullYear() ? '' : ` ${date.getFullYear()}`;
  const day = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}${year}`;
  if (!withTime) return day;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} · ${hours}:${minutes}`;
}
