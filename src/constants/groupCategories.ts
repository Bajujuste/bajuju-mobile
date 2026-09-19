export const BAJUJU_GROUP_CATEGORIES = [
  'Cinema & Teatro',
  'Aperitivi & Serate',
  'Cene & Food',
  'Viaggi & Gite',
  'Sport',
  'Trekking & Natura',
  'Musica',
  'Cultura',
  'Giochi & Hobby',
  'Amicizia & Incontri',
  'Altro',
] as const;

export type BajujuGroupCategory = (typeof BAJUJU_GROUP_CATEGORIES)[number];

export function normalizeBajujuGroupCategory(value: string | null | undefined): BajujuGroupCategory {
  const clean = String(value || '').trim().toLowerCase();

  if (clean.includes('cinema') || clean.includes('teatro')) return 'Cinema & Teatro';
  if (clean.includes('aperitiv') || clean.includes('serat') || clean.includes('discotec')) return 'Aperitivi & Serate';
  if (clean.includes('cena') || clean.includes('food') || clean.includes('ristor')) return 'Cene & Food';
  if (clean.includes('viagg') || clean.includes('gita') || clean.includes('vacanz')) return 'Viaggi & Gite';
  if (clean.includes('trekking') || clean.includes('natura') || clean.includes('cammin') || clean.includes('passegg')) return 'Trekking & Natura';
  if (clean.includes('sport') || clean.includes('calcetto') || clean.includes('calcio') || clean.includes('padel') || clean.includes('tennis')) return 'Sport';
  if (clean.includes('musica') || clean.includes('concerto')) return 'Musica';
  if (clean.includes('cultura') || clean.includes('muse') || clean.includes('arte')) return 'Cultura';
  if (clean.includes('gioc') || clean.includes('hobby')) return 'Giochi & Hobby';
  if (clean.includes('single') || clean.includes('amic') || clean.includes('incontr') || clean.includes('social')) return 'Amicizia & Incontri';

  return 'Altro';
}
