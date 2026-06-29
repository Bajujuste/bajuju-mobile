export const EXPERIENCE_CATEGORIES = [
  'Tutti',
  'Cena',
  'Aperitivo',
  'Camminata',
  'Sport',
  'Cultura',
  'Musica',
  'Cinema/Teatro',
  'Gita',
  'Giochi',
  'Altro',
];

export const EXPERIENCE_CREATION_CATEGORIES = [
  'Cena',
  'Aperitivo',
  'Camminata',
  'Sport',
  'Cultura',
  'Musica',
  'Cinema/Teatro',
  'Gita',
  'Giochi',
  'Altro',
];

export function normalizeExperienceCategory(value: string | null | undefined) {
  const clean = String(value || '').trim().toLowerCase();

  if (!clean) return 'Altro';

  if (clean.includes('cena')) return 'Cena';
  if (clean.includes('aperitivo')) return 'Aperitivo';
  if (clean.includes('camminata') || clean.includes('trekking') || clean.includes('passeggiata')) return 'Camminata';
  if (clean.includes('sport') || clean.includes('calcetto') || clean.includes('tennis') || clean.includes('padel')) return 'Sport';
  if (clean.includes('cultura') || clean.includes('museo') || clean.includes('mostra')) return 'Cultura';
  if (clean.includes('musica') || clean.includes('concerto')) return 'Musica';
  if (clean.includes('cinema') || clean.includes('teatro')) return 'Cinema/Teatro';
  if (clean.includes('gita') || clean.includes('vacanza') || clean.includes('viaggio')) return 'Gita';
  if (clean.includes('giochi') || clean.includes('gioco')) return 'Giochi';
  if (clean.includes('altro')) return 'Altro';

  return value ? String(value).trim() : 'Altro';
}

export function getExperienceCategoryIcon(value: string | null | undefined) {
  const category = normalizeExperienceCategory(value);

  switch (category) {
    case 'Cena':
      return '🍝';
    case 'Aperitivo':
      return '🍹';
    case 'Camminata':
      return '🥾';
    case 'Sport':
      return '⚽';
    case 'Cultura':
      return '🎭';
    case 'Musica':
      return '🎵';
    case 'Cinema/Teatro':
      return '🎬';
    case 'Gita':
      return '🧭';
    case 'Giochi':
      return '🎲';
    default:
      return '✨';
  }
}
