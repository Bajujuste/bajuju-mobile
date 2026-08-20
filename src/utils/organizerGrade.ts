export const ORGANIZER_GRADE_OPTIONS = [
  'Organizzatore base',
  'Organizzatore attivo',
  'Organizzatore esperto',
  'Organizzatore top',
] as const;

export type OrganizerGradeLabel = (typeof ORGANIZER_GRADE_OPTIONS)[number];
export type OrganizerGradeLevel = 'base' | 'active' | 'expert' | 'top';

export type OrganizerGradeInfo = {
  label: OrganizerGradeLabel;
  level: OrganizerGradeLevel;
  index: number;
};

const GRADE_INFO: Record<OrganizerGradeLabel, OrganizerGradeInfo> = {
  'Organizzatore base': {
    label: 'Organizzatore base',
    level: 'base',
    index: 0,
  },
  'Organizzatore attivo': {
    label: 'Organizzatore attivo',
    level: 'active',
    index: 1,
  },
  'Organizzatore esperto': {
    label: 'Organizzatore esperto',
    level: 'expert',
    index: 2,
  },
  'Organizzatore top': {
    label: 'Organizzatore top',
    level: 'top',
    index: 3,
  },
};

export function isOrganizerGradeLabel(value: unknown): value is OrganizerGradeLabel {
  return typeof value === 'string' && ORGANIZER_GRADE_OPTIONS.includes(value as OrganizerGradeLabel);
}

export function organizerGradeFromCount(count: number): OrganizerGradeInfo {
  if (count > 20) return GRADE_INFO['Organizzatore top'];
  if (count > 10) return GRADE_INFO['Organizzatore esperto'];
  if (count > 5) return GRADE_INFO['Organizzatore attivo'];
  return GRADE_INFO['Organizzatore base'];
}

export function organizerGradeFromLabel(value: unknown): OrganizerGradeInfo | null {
  if (!isOrganizerGradeLabel(value)) return null;
  return GRADE_INFO[value];
}

export function effectiveOrganizerGrade(count: number, manualOverride: unknown): OrganizerGradeInfo {
  const automaticGrade = organizerGradeFromCount(count);
  const promotedGrade = organizerGradeFromLabel(manualOverride);

  if (!promotedGrade || promotedGrade.index <= automaticGrade.index) {
    return automaticGrade;
  }

  return promotedGrade;
}

export function organizerGradeHint(grade: OrganizerGradeInfo) {
  switch (grade.level) {
    case 'top':
      return 'Ha organizzato molte esperienze Bajuju.';
    case 'expert':
      return 'Ha già una buona esperienza come organizzatore.';
    case 'active':
      return 'Partecipa attivamente alla vita della community.';
    default:
      return 'Sta iniziando il suo percorso su Bajuju.';
  }
}
