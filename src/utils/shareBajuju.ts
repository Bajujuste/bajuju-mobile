import { Share } from 'react-native';

const BAJUJU_LINK = 'https://bajuju.it';

type ShareExperienceParams = {
  title?: string | null;
  category?: string | null;
  city?: string | null;
  province?: string | null;
  date?: string | null;
  time?: string | null;
};

export async function shareBajujuHome() {
  await Share.share({
    title: 'Bajuju',
    message: `Bajuju - Dal Vivo è Meglio\nTrova persone per esperienze dal vivo.\n${BAJUJU_LINK}`,
  });
}

export async function shareBajujuExperience(params: ShareExperienceParams) {
  const title = params.title?.trim() || 'Esperienza Bajuju';
  const category = params.category?.trim();
  const place = [params.city, params.province].filter(Boolean).join(', ');
  const when = [params.date, params.time].filter(Boolean).join(' alle ');

  const lines = [
    `Guarda questa esperienza su Bajuju:`,
    title,
    category ? `Categoria: ${category}` : '',
    place ? `Dove: ${place}` : '',
    when ? `Quando: ${when}` : '',
    '',
    'Dal Vivo è Meglio',
    BAJUJU_LINK,
  ].filter(Boolean);

  await Share.share({
    title,
    message: lines.join('\n'),
  });
}

export async function shareBajujuFlash(params: ShareExperienceParams) {
  const title = params.title?.trim() || 'Flash Bajuju';
  const place = [params.city, params.province].filter(Boolean).join(', ');
  const when = [params.date, params.time].filter(Boolean).join(' alle ');

  const lines = [
    `Flash Bajuju:`,
    title,
    place ? `Dove: ${place}` : '',
    when ? `Quando: ${when}` : '',
    '',
    'Tutto può iniziare in pochi minuti.',
    BAJUJU_LINK,
  ].filter(Boolean);

  await Share.share({
    title,
    message: lines.join('\n'),
  });
}
