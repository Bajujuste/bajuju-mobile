export type ProfileRowLike = Record<string, unknown> | null | undefined;

export type ProfileCompletion = {
  complete: boolean;
  missing: Array<'foto' | 'età' | 'città' | 'sesso'>;
  photoUrl: string;
  city: string;
  age: number | null;
  gender: string;
};

function firstProfileText(row: ProfileRowLike, keys: string[]) {
  if (!row) return '';

  for (const key of keys) {
    const value = row[key];

    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return '';
}

export function getProfileCompletion(row: ProfileRowLike): ProfileCompletion {
  const photoUrl = firstProfileText(
    row,
    ['avatar_url', 'photo_url', 'profile_photo_url', 'profile_image_url', 'image_url', 'foto']
  );

  const city = firstProfileText(
    row,
    ['city', 'citta', 'comune', 'location_city']
  );

  const rawAge = firstProfileText(
    row,
    ['age', 'eta', 'età', 'user_age', 'age_range', 'fascia_eta', 'age_band', 'eta_range']
  );

  const gender = firstProfileText(
    row,
    ['gender', 'genere', 'sex']
  ).toLowerCase();

  const parsedAge = Number(rawAge);
  const age =
    Number.isInteger(parsedAge) && parsedAge >= 18 && parsedAge <= 99
      ? parsedAge
      : null;

  const validGender = [
    'maschio',
    'uomo',
    'male',
    'femmina',
    'donna',
    'female',
    'non_binario',
    'non binario',
    'non-binary',
    'nonbinary',
  ].includes(gender);

  const missing: ProfileCompletion['missing'] = [];

  if (!photoUrl) missing.push('foto');
  if (!age) missing.push('età');
  if (!city) missing.push('città');
  if (!validGender) missing.push('sesso');

  return {
    complete: missing.length === 0,
    missing,
    photoUrl,
    city,
    age,
    gender,
  };
}

export function hasCompleteRequiredProfile(row: ProfileRowLike) {
  return getProfileCompletion(row).complete;
}

export function profileGenderLabel(row: ProfileRowLike) {
  const gender = getProfileCompletion(row).gender;

  if (['maschio', 'uomo', 'male'].includes(gender)) return 'Uomo';
  if (['femmina', 'donna', 'female'].includes(gender)) return 'Donna';
  if (['non_binario', 'non binario', 'non-binary', 'nonbinary'].includes(gender)) {
    return 'Non binario';
  }

  return 'Non indicato';
}
