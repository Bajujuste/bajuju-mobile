import { Alert, Linking } from 'react-native';

const BAJUJU_EVENT_LINK = 'https://bajuju.it/experience-detail';
const DEFAULT_DURATION_HOURS = 2;

type GoogleCalendarEvent = {
  id?: string | null;
  title?: string | null;
  date?: string | null; // YYYY-MM-DD
  time?: string | null; // HH:MM o HH:MM:SS
  place?: string | null;
  description?: string | null;
};

const pad = (value: number) => String(value).padStart(2, '0');

// Data "a muro" (senza fuso): Google la interpreta con ctz=Europe/Rome.
function formatLocal(date: Date, withTime: boolean) {
  const day = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  if (!withTime) return day;
  return `${day}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
}

export function buildGoogleCalendarUrl(event: GoogleCalendarEvent): string | null {
  const dateMatch = String(event.date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;
  const [, y, m, d] = dateMatch.map(Number);
  const timeMatch = String(event.time || '').match(/^(\d{1,2}):(\d{2})/);

  let dates: string;
  if (timeMatch) {
    const start = new Date(Date.UTC(y, m - 1, d, Number(timeMatch[1]), Number(timeMatch[2])));
    const end = new Date(start.getTime() + DEFAULT_DURATION_HOURS * 60 * 60 * 1000);
    dates = `${formatLocal(start, true)}/${formatLocal(end, true)}`;
  } else {
    // Senza ora: evento di tutto il giorno.
    const start = new Date(Date.UTC(y, m - 1, d));
    const end = new Date(Date.UTC(y, m - 1, d + 1));
    dates = `${formatLocal(start, false)}/${formatLocal(end, false)}`;
  }

  const id = String(event.id || '').trim();
  const link = id ? `${BAJUJU_EVENT_LINK}?id=${encodeURIComponent(id)}` : 'https://bajuju.it';
  const details = [event.description?.trim(), `Evento su Bajuju: ${link}`].filter(Boolean).join('\n\n');

  const params = [
    ['action', 'TEMPLATE'],
    ['text', event.title?.trim() || 'Evento Bajuju'],
    ['dates', dates],
    ['ctz', 'Europe/Rome'],
    ['details', details],
    ['location', event.place?.trim() || ''],
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return `https://calendar.google.com/calendar/render?${params}`;
}

export async function addToGoogleCalendar(event: GoogleCalendarEvent) {
  const url = buildGoogleCalendarUrl(event);
  if (!url) {
    Alert.alert('Data mancante', "Questo evento non ha ancora una data.");
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Errore', 'Non riesco ad aprire Google Calendar.');
  }
}
