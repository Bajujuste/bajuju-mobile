import React from 'react';

import { LegalDocumentScreen } from '../../src/components/legal/LegalDocumentScreen';
import { TERMS_DOCUMENT } from '../../src/legal/legalContent';

export default function RulesScreen() {
  return <LegalDocumentScreen document={TERMS_DOCUMENT} />;
}
