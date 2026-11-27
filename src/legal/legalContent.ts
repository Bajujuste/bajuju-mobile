// Fonte unica dei testi legali di Bajuju: la usano le schermate dell'app e lo script
// scripts/build-legal-site.mjs che genera privacy.html e regole/index.html del sito.
// Quando cambia la versione va aggiornato anche app_settings.legal_version su Supabase:
// gli utenti che non hanno accettato la versione in vigore vedono LegalAcceptanceGate.
import content from './legal-content.json';

export type LegalBlock = string | string[];

export type LegalSection = {
  title: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  title: string;
  subtitle: string;
  sections: LegalSection[];
};

type LegalContent = {
  version: string;
  versionLabel: string;
  controller: {
    name: string;
    vat: string;
    city: string;
    pec: string;
    privacyEmail: string;
    generalEmail: string;
  };
  acceptanceLabel: string;
  updateSummary: string[];
  privacy: LegalDocument;
  terms: LegalDocument;
};

export const LEGAL_CONTENT = content as LegalContent;
export const LEGAL_VERSION = LEGAL_CONTENT.version;
export const LEGAL_VERSION_LABEL = LEGAL_CONTENT.versionLabel;
export const LEGAL_ACCEPTANCE_LABEL = LEGAL_CONTENT.acceptanceLabel;
export const PRIVACY_DOCUMENT = LEGAL_CONTENT.privacy;
export const TERMS_DOCUMENT = LEGAL_CONTENT.terms;
