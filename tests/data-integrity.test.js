// Plain Node script (no browser/Playwright needed) that checks the BUILTIN phrase
// data embedded in index.html. Run directly: `node tests/data-integrity.test.js`
// or via `npm run test:data`. Exits non-zero on failure so it works in CI.
//
// This exists because of a real regression: individual number/weekday cards were
// added with only an `en` field, so they silently vanished from every non-English
// language view. This script would have caught that before it shipped.
const fs = require('fs');
const path = require('path');

const LANGS = ['en', 'ko', 'de', 'ro', 'es', 'fr', 'vi', 'zh', 'pt', 'ru'];
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractArray(varName) {
  const re = new RegExp(`const ${varName} = (\\[[\\s\\S]*?\\n\\]);`);
  const m = html.match(re);
  if (!m) throw new Error(`Could not find ${varName} in index.html`);
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

const CATS = extractArray('CATS');
const BUILTIN = extractArray('BUILTIN');

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
}
function ok(msg) { console.log('ok  -', msg); }

check(BUILTIN.length > 0, 'BUILTIN should not be empty');
ok(`${BUILTIN.length} built-in phrases loaded`);

// every entry must have a Japanese headword and a valid category
const badCat = BUILTIN.filter(d => !CATS.includes(d.cat));
check(badCat.length === 0, `entries with a category not in CATS: ${badCat.map(d => `${d.ja} (${d.cat})`).join(', ')}`);
if (badCat.length === 0) ok('every entry has a category listed in CATS');

const noJa = BUILTIN.filter(d => !d.ja || !d.ja.trim());
check(noJa.length === 0, `${noJa.length} entries missing a ja field`);
if (noJa.length === 0) ok('every entry has a non-empty ja field');

// the regression this test exists for: every entry must have all languages
const missingLang = BUILTIN.filter(d => LANGS.some(l => !d[l]));
check(
  missingLang.length === 0,
  `${missingLang.length} entries missing at least one of the ${LANGS.length} languages:\n` +
    missingLang.map(d => `  - ${d.ja}: missing ${LANGS.filter(l => !d[l]).join(', ')}`).join('\n')
);
if (missingLang.length === 0) ok(`every entry has all ${LANGS.length} languages`);

// each [phrase, kana] pair must be a 2-element array of non-empty strings
let badPairs = [];
BUILTIN.forEach(d => {
  LANGS.forEach(l => {
    const pair = d[l];
    if (!Array.isArray(pair) || pair.length !== 2 || !pair[0]) {
      badPairs.push(`${d.ja} / ${l}`);
    }
  });
});
check(badPairs.length === 0, `${badPairs.length} malformed [phrase, kana] pairs: ${badPairs.slice(0, 10).join(', ')}`);
if (badPairs.length === 0) ok('every [phrase, kana] pair is well-formed');

const noNote = BUILTIN.filter(d => !d.note || !d.note.trim());
check(noNote.length === 0, `${noNote.length} entries have no note (解説): ${noNote.map(d => d.ja).join(', ')}`);
if (noNote.length === 0) ok('every entry has a note (解説)');

// every entry carries a word-by-word gloss (which foreign word means what) - every
// language must be covered, since a partial gloss would silently show nothing for that language.
const badGloss = BUILTIN.filter(d => !d.gloss || LANGS.some(l => !d.gloss[l] || !d.gloss[l].trim()));
check(
  badGloss.length === 0,
  `${badGloss.length} entries missing a gloss for at least one language:\n` +
    badGloss.map(d => `  - ${d.ja}: missing ${d.gloss ? LANGS.filter(l => !d.gloss[l] || !d.gloss[l].trim()).join(', ') : 'gloss entirely'}`).join('\n')
);
if (badGloss.length === 0) ok(`every entry (${BUILTIN.length}) has a gloss for all ${LANGS.length} languages`);

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('All data-integrity checks passed.');
}
