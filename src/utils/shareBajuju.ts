import { Platform, Share } from 'react-native';

const BAJUJU_EVENT_LINK = 'https://bajuju.it';
const BAJUJU_GROUP_LINK = 'https://bajuju.netlify.app';
const BAJUJU_LINK = 'https://bajuju.it';

type ShareExperienceParams = {
  title?: string | null;
  category?: string | null;
  city?: string | null;
  province?: string | null;
  date?: string | null;
  time?: string | null;
  id?: string | null;
  activityId?: string | null;
};

const MONTHS_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

// Le date arrivano dal database come "2026-12-05": nel messaggio diventano "5 dicembre 2026".
function formatShareDate(value?: string | null) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;

  const [, year, month, day] = match;
  const monthName = MONTHS_IT[Number(month) - 1];
  return monthName ? `${Number(day)} ${monthName} ${year}` : raw;
}

// Gli orari arrivano come "20:00:00": nel messaggio diventano "20:00".
function formatShareTime(value?: string | null) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : raw;
}

function formatShareWhen(date?: string | null, time?: string | null) {
  return [formatShareDate(date), formatShareTime(time)].filter(Boolean).join(' alle ');
}

function capitalize(value?: string | null) {
  const text = String(value || '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

type ShareGroupParams = {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  city?: string | null;
  province?: string | null;
};

export async function shareBajujuHome() {
  await Share.share({
    title: 'Bajuju',
    message: `Bajuju - Dal Vivo è Meglio\nTrova persone per esperienze dal vivo.\n${BAJUJU_LINK}`,
  });
}

export async function shareBajujuExperience(params: ShareExperienceParams) {
  const title = params.title?.trim() || 'Esperienza Bajuju';
  const category = capitalize(params.category);
  const place = [params.city, params.province].filter(Boolean).join(', ');
  const when = formatShareWhen(params.date, params.time);
  const id = String(params.id || params.activityId || '').trim();
  const eventLink = id
    ? `${BAJUJU_EVENT_LINK}/experience-detail?id=${encodeURIComponent(id)}`
    : BAJUJU_LINK;

  // Le righe mancanti sono null; la riga vuota resta e stacca il motto dal resto.
  const lines = [
    `Guarda questa esperienza su Bajuju:`,
    title,
    category ? `Categoria: ${category}` : null,
    place ? `Dove: ${place}` : null,
    when ? `Quando: ${when}` : null,
    '',
    'Dal Vivo è Meglio',
  ].filter((line) => line !== null);

  if (Platform.OS === 'ios') {
    // Su iOS il link va in url: Facebook lo usa per la card con foto e titolo, WhatsApp mostra anche il testo.
    await Share.share({ title, message: lines.join('\n'), url: eventLink });
    return;
  }

  // Su Android Share.share manda un solo testo: l'app di Facebook crea la card di anteprima solo
  // se il testo è il link da solo, altrimenti pubblica il testo lungo senza anteprima. La card
  // (foto, titolo, luogo e data dalla pagina bajuju.it) porta già tutte le informazioni.
  await Share.share({ title, message: eventLink });
}

export async function shareBajujuGroup(params: ShareGroupParams) {
  const name = params.name?.trim() || 'Gruppo Bajuju';
  const category = capitalize(params.category);
  const place = [params.city, params.province].filter(Boolean).join(', ');
  const id = String(params.id || '').trim();
  const groupLink = id
    ? `${BAJUJU_GROUP_LINK}/group-detail?id=${encodeURIComponent(id)}`
    : BAJUJU_LINK;

  const lines = [
    'Guarda questo gruppo su Bajuju:',
    name,
    category ? `Categoria: ${category}` : null,
    place ? `Dove: ${place}` : null,
    '',
    'Dal Vivo è Meglio',
    groupLink,
  ].filter((line) => line !== null);

  await Share.share({
    title: name,
    message: lines.join('\n'),
  });
}

export async function shareBajujuFlash(params: ShareExperienceParams) {
  const title = params.title?.trim() || 'Flash Bajuju';
  const place = [params.city, params.province].filter(Boolean).join(', ');
  const when = formatShareWhen(params.date, params.time);

  const lines = [
    `Flash Bajuju:`,
    title,
    place ? `Dove: ${place}` : null,
    when ? `Quando: ${when}` : null,
    '',
    'Tutto può iniziare in pochi minuti.',
    BAJUJU_LINK,
  ].filter((line) => line !== null);

  await Share.share({
    title,
    message: lines.join('\n'),
  });
}
