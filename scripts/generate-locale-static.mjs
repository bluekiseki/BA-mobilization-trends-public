// Splits app/locales/{locale}/*.json into one static file per namespace under
// public/locales/{locale}/{ns}.json, so the client can fetch translations as plain
// static assets (served via the existing CDN pipeline) instead of a Worker route.
//
// Layout convention (matches app/locales/*/index.ts):
// - The file named after the locale itself (e.g. en/en.json) bundles several namespaces
//   as top-level keys and must be split apart.
// - Every other *.json file in the locale directory is already a single namespace
//   (filename minus extension = namespace name).
import { readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';

const LOCALES = ['en', 'ja', 'ko', 'zh_Hant'];
const localesDir = new URL('../app/locales/', import.meta.url);
const outDir = new URL('../public/locales/', import.meta.url);

let totalFiles = 0;

for (const locale of LOCALES) {
  const localeDir = new URL(`${locale}/`, localesDir);
  const localeOutDir = new URL(`${locale}/`, outDir);
  await rm(localeOutDir, { recursive: true, force: true });
  await mkdir(localeOutDir, { recursive: true });

  const files = (await readdir(localeDir)).filter((name) => name.endsWith('.json'));
  const namespaces = {};

  for (const file of files) {
    const raw = JSON.parse(await readFile(new URL(file, localeDir), 'utf8'));
    if (file === `${locale}.json`) {
      // Merged file: each top-level key is its own namespace.
      Object.assign(namespaces, raw);
    } else {
      namespaces[file.slice(0, -'.json'.length)] = raw;
    }
  }

  // Matches the old /api/locales/:lng/translation special case (always empty).
  namespaces.translation = {};

  for (const [ns, data] of Object.entries(namespaces)) {
    await writeFile(new URL(`${ns}.json`, localeOutDir), JSON.stringify(data), 'utf8');
    totalFiles++;
  }
}

console.log(`Generated ${totalFiles} locale namespace files under public/locales/ for ${LOCALES.length} locales.`);
