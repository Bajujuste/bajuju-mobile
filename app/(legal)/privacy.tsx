import React from 'react';

import { LegalDocumentScreen } from '../../src/components/legal/LegalDocumentScreen';
import { PRIVACY_DOCUMENT } from '../../src/legal/legalContent';

export default function PrivacyScreen() {
  return <LegalDocumentScreen document={PRIVACY_DOCUMENT} />;
}
