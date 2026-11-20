// Città scritte in modo uniforme: niente spazi in più e, se è tutta minuscola,
// iniziali maiuscole ("bergamo" → "Bergamo", "caprino bergamasco" → "Caprino Bergamasco").
// Le parole brevi di collegamento restano minuscole ("orio al serio" → "Orio al Serio").
const SMALL_WORDS = new Set(['al', 'allo', 'alla', 'di', 'del', 'della', 'dei', 'degli', 'de', 'd', 'sul', 'sull', 'sulla', 'in', 'e', 'con', 'il']);

export function tidyCityName(value: string | null | undefined) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean !== clean.toLowerCase()) return clean;
  return clean
    .split(' ')
    .map((word, index) => word
      .split("'")
      .map((part, partIndex) => (index > 0 && (SMALL_WORDS.has(part) || partIndex > 0 && part.length === 0)) || !part
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1))
      .join("'"))
    .join(' ');
}
