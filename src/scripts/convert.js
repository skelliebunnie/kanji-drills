// convert.js — run: node convert.js JMdict_e_examp.xml words.json
const fs = require('fs');
const [, , src, dest] = process.argv;
const xml = fs.readFileSync(src, 'utf8');

const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// all inner texts of <tag ...>...</tag>, with the attribute string too
const all = (s, tag) =>
  [...s.matchAll(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))]
    .map(m => ({ attrs: m[1] || '', body: m[2] }));
const texts = (s, tag) => all(s, tag).map(x => x.body);

const COMMON = /^(news1|ichi1|spec1|spec2|gai1)$/;
const isCommon = block => texts(block, 'ke_pri').concat(texts(block, 're_pri'))
  .some(p => COMMON.test(p));

const words = xml.split('<entry>').slice(1).map(chunk => {
  const e = chunk.split('</entry>')[0];

  const kanji = texts(e, 'k_ele').map(k => ({
    text: texts(k, 'keb')[0],
    common: isCommon(k),
  }));

  const kana = texts(e, 'r_ele').map(r => ({
    text: texts(r, 'reb')[0],
    common: isCommon(r),
  }));

  const sense = texts(e, 'sense').map(s => ({
    pos: texts(s, 'pos').map(p => p.replace(/^&|;$/g, '')),   // "&vs;" -> "vs"
    gloss: texts(s, 'gloss').map(g => ({ text: unesc(g) })),
    examples: texts(s, 'example').map(ex => {
      const sents = all(ex, 'ex_sent');
      const pick = lang => sents.find(x => x.attrs.includes(lang));
      return {
        ja: unesc(pick('jpn')?.body ?? ''),
        en: unesc(pick('eng')?.body ?? ''),
      };
    }),
  }));

  return { id: texts(e, 'ent_seq')[0], kanji, kana, sense };
});

fs.writeFileSync(dest, JSON.stringify(words));
console.log(`${words.length} entries written`);