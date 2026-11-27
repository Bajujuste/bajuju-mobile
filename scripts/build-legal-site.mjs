#!/usr/bin/env node
// Genera le pagine legali del sito www.bajuju.it dalla stessa fonte usata dall'app
// (src/legal/legal-content.json), così app e sito restano identici.
//
// Uso: node scripts/build-legal-site.mjs <cartella public del ramo sito>
// Scrive: privacy.html, regole/index.html, delete-account.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const content = JSON.parse(readFileSync(join(here, '..', 'src', 'legal', 'legal-content.json'), 'utf8'));
const css = readFileSync(join(here, 'legal-site.css'), 'utf8');
const outDir = process.argv[2];

if (!outDir) {
  console.error('Uso: node scripts/build-legal-site.mjs <cartella public>');
  process.exit(1);
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Rende cliccabili email e indirizzi web citati nei testi.
function linkify(text) {
  return escapeHtml(text)
    .replace(/\b([a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi, '<a href="mailto:$1">$1</a>')
    .replace(/\bwww\.garanteprivacy\.it\b/g, '<a href="https://www.garanteprivacy.it" rel="noopener">www.garanteprivacy.it</a>');
}

function renderBlocks(blocks) {
  return blocks
    .map((block) =>
      Array.isArray(block)
        ? `      <ul>\n${block.map((item) => `        <li>${linkify(item)}</li>`).join('\n')}\n      </ul>`
        : `      <p>${linkify(block)}</p>`
    )
    .join('\n');
}

function renderSections(sections) {
  return sections
    .map((section) => `      <h2>${escapeHtml(section.title)}</h2>\n${renderBlocks(section.blocks)}`)
    .join('\n\n');
}

function page({ title, description, canonical, heading, summary, body }) {
  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${canonical}" />
    <title>${escapeHtml(title)}</title>
    <style>
${css}
      .versions {
        margin-top: 32px;
        color: var(--muted);
        font-size: 15px;
      }
    </style>
  </head>
  <body>
    <header>
      <div class="header-inner">
        <a class="brand" href="/" aria-label="Bajuju, torna alla homepage">
          <img src="/bajuju-panda.png" alt="Panda Bajuju" />
          <span>Bajuju</span>
        </a>
        <h1>${escapeHtml(heading)}</h1>
        <p class="updated">Ultimo aggiornamento: ${escapeHtml(content.versionLabel)} · versione ${escapeHtml(content.version)}</p>
      </div>
    </header>

    <main>
      <p class="summary">${summary}</p>

${body}

      <p class="versions">
        Documenti collegati: <a href="/regole/">Termini e regole</a> ·
        <a href="/privacy.html">Informativa privacy</a> ·
        <a href="/delete-account.html">Eliminazione dell’account</a>
      </p>
    </main>

    <footer>
      <p>© 2026 Bajuju · ${escapeHtml(content.controller.name)} · P.IVA ${escapeHtml(content.controller.vat)} · <a href="/">Torna al sito</a></p>
    </footer>
  </body>
</html>
`;
}

const write = (relativePath, html) => {
  const target = join(outDir, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
  console.log(`scritto ${target}`);
};

write(
  'privacy.html',
  page({
    title: 'Informativa privacy | Bajuju',
    description: 'Informativa sul trattamento dei dati personali dell’app Bajuju e del sito bajuju.it.',
    canonical: 'https://www.bajuju.it/privacy.html',
    heading: content.privacy.title,
    summary: escapeHtml(content.privacy.subtitle) + '. È lo stesso testo mostrato nell’app Bajuju.',
    body: renderSections(content.privacy.sections),
  })
);

write(
  'regole/index.html',
  page({
    title: 'Termini e regole | Bajuju',
    description: 'Termini di utilizzo e regole della community di Bajuju.',
    canonical: 'https://www.bajuju.it/regole/',
    heading: content.terms.title,
    summary:
      escapeHtml(content.terms.subtitle) +
      `. Per registrarti nell’app devi selezionare «${escapeHtml(content.acceptanceLabel)}».`,
    body: renderSections(content.terms.sections),
  })
);

const deletion = content.privacy.sections.find((section) => section.title.includes('Eliminazione'));
const privacyEmail = content.controller.privacyEmail;
write(
  'delete-account.html',
  page({
    title: 'Eliminazione account | Bajuju',
    description: 'Come eliminare l’account Bajuju e quali dati vengono cancellati.',
    canonical: 'https://www.bajuju.it/delete-account.html',
    heading: 'Elimina il tuo account Bajuju',
    summary:
      'Il modo più rapido è dall’app: apri il tuo profilo, scegli «Elimina definitivamente account» e conferma due volte. Se non puoi usare l’app, scrivi dall’indirizzo email dell’account a ' +
      `<a href="mailto:${privacyEmail}?subject=Richiesta%20eliminazione%20account%20Bajuju">${privacyEmail}</a>` +
      ' indicando email e nome utente, senza inviare la password.',
    body: renderSections([
      {
        title: 'Richiesta via email',
        blocks: [
          'Potremmo chiederti una semplice verifica per assicurarci che la richiesta provenga dalla persona titolare dell’account. Eseguiamo l’eliminazione e ti rispondiamo entro un mese dalla richiesta.',
        ],
      },
      { title: 'Cosa viene eliminato e cosa resta', blocks: deletion.blocks },
    ]),
  })
);
