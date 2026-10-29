import { BAJUJU_COLORS } from '../theme/bajujuTheme';

// Colori del gruppo: al massimo due (primario e secondario). Senza colori il gruppo usa quelli di Bajuju.

export const GROUP_COLOR_PALETTE = [
  { name: 'Nero', hex: '#111111' },
  { name: 'Azzurro', hex: '#1E8FE1' },
  { name: 'Bianco', hex: '#FFFFFF' },
  { name: 'Rosso', hex: '#C8102E' },
  { name: 'Giallo', hex: '#F5C400' },
  { name: 'Blu', hex: '#1F3A93' },
  { name: 'Verde', hex: '#15803D' },
  { name: 'Granata', hex: '#7A1F2B' },
  { name: 'Arancio', hex: '#EE7A1C' },
  { name: 'Viola', hex: '#6B2FA0' },
  { name: 'Celeste', hex: '#8EC9F0' },
  { name: 'Grigio', hex: '#8A8F99' },
] as const;

export const GROUP_COLOR_PRESETS = [
  { name: 'Nero e azzurro', primary: '#111111', secondary: '#1E8FE1' },
  { name: 'Giallo e rosso', primary: '#F5C400', secondary: '#C8102E' },
  { name: 'Bianco e nero', primary: '#111111', secondary: '#FFFFFF' },
  { name: 'Granata e blu', primary: '#7A1F2B', secondary: '#1F3A93' },
  { name: 'Blu e celeste', primary: '#1F3A93', secondary: '#8EC9F0' },
  { name: 'Viola e bianco', primary: '#6B2FA0', secondary: '#FFFFFF' },
] as const;

const DARK_TEXT = '#14161B';
const LIGHT_TEXT = '#FFFFFF';

export function normalizeHexColor(value: unknown) {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9A-F]{6}$/.test(withHash) ? withHash : null;
}

export function colorName(hex: string | null) {
  if (!hex) return 'Standard';
  return GROUP_COLOR_PALETTE.find((item) => item.hex === hex)?.name || hex;
}

// Luminanza relativa WCAG.
function luminance(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Testo bianco o quasi nero, quello che si legge meglio sul colore dato.
export function readableTextOn(hex: string) {
  return contrastRatio(hex, LIGHT_TEXT) >= contrastRatio(hex, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

// Un colore molto chiaro (bianco, giallo, celeste) ha bisogno di un bordo per non sparire sul bianco.
export function needsOutline(hex: string) {
  return contrastRatio(hex, LIGHT_TEXT) < 1.5;
}

export type GroupTheme = {
  custom: boolean;
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  // Per sottolineature, icone e link su sfondo bianco: dei due, quello che si vede di più.
  accent: string;
};

export function resolveGroupTheme(primaryValue?: unknown, secondaryValue?: unknown): GroupTheme {
  const primary = normalizeHexColor(primaryValue);
  const secondary = normalizeHexColor(secondaryValue);

  if (!primary && !secondary) {
    return {
      custom: false,
      primary: BAJUJU_COLORS.pink,
      onPrimary: LIGHT_TEXT,
      secondary: BAJUJU_COLORS.pink,
      onSecondary: LIGHT_TEXT,
      accent: BAJUJU_COLORS.pink,
    };
  }

  const main = primary || secondary || BAJUJU_COLORS.pink;
  const second = secondary || main;
  let accent = contrastRatio(second, LIGHT_TEXT) >= contrastRatio(main, LIGHT_TEXT) ? second : main;
  // Se entrambi sono chiarissimi (es. bianco e giallo) l'accento diventa quasi nero, così resta visibile.
  if (contrastRatio(accent, LIGHT_TEXT) < 2) accent = DARK_TEXT;

  return {
    custom: true,
    primary: main,
    onPrimary: readableTextOn(main),
    secondary: second,
    onSecondary: readableTextOn(second),
    accent,
  };
}
