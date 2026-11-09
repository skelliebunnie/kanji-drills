// Built with the help of Claude.ai, using the JMdict examples data set & kanjiAPI
const apiCache = new Map();

const optionsForm = document.getElementById('options');
const repsInput = document.getElementById('reps');
const kanjiOnlyInput = document.getElementById('kanji-only');
const strokeOrderInput = document.getElementById('stroke-order');
const exampleSentencesInput = document.getElementById('example-sentences');
const englishGlossesInput = document.getElementById('en-gloss');
const relatedWordsInput = document.getElementById('related-words');
const showGridInput = document.getElementById('show-grid');

const defaultOptions = {
  reps: 16,
  exampleSentences: true,
  relatedWords: false,
  englishGlosses: false,
  kanjiOnly: false,
  strokeOrder: false,
  showGrid: false
};

let options = loadOptions();

function loadOptions() {
  try { 
    let opts = JSON.parse(localStorage.getItem('options') ?? JSON.stringify(defaultOptions));
    return opts;
  }
  catch (err) { 
    console.log("error getting options:", err);
  }
}
function saveOptions() {
  try { 
    localStorage.setItem('options', JSON.stringify(options)); 
  } catch (err) {
    console.error('Failed to save options:', err);
  }
}

function getOptions() {
  let opt = {
    reps: parseInt(repsInput.value) || 16,
    kanjiOnly: kanjiOnlyInput.checked,
    strokeOrder: strokeOrderInput.checked,
    exampleSentences: exampleSentencesInput.checked,
    englishGlosses: englishGlossesInput.checked,
    relatedWords: relatedWordsInput.checked,
    showGrid: showGridInput.checked
  };
  saveOptions();
  return opt;
}

const index = { forms: new Map(), chars: new Map(), glosses: new Map() };
const isKanji = ch => /\p{Script=Han}/u.test(ch);

function addTo(map, key, entry) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(entry);
}

function buildIndex(words) {
  for (const w of words) {
    for (const k of w.kanji) {
      addTo(index.forms, k.text, w);                 // 食べる
      for (const ch of new Set(k.text))              // 食, 
        if (isKanji(ch)) addTo(index.chars, ch, w);
    }
    for (const k of w.kana) addTo(index.forms, k.text, w);   // たべる
    for (const s of w.sense)
      for (const g of s.gloss)
        for (const tok of g.text.toLowerCase().split(/\W+/))
          if (tok) addTo(index.glosses, tok, w);     // "eat"
  }
}

const hasJapanese = q => /[\u3040-\u30ff\u4e00-\u9fff]/.test(q);

function search(query, limit = 50) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  
  const scored = new Map();
  const bump = (w, s) => scored.set(w, Math.max(scored.get(w) ?? 0, s));

  if (hasJapanese(q)) {
    (index.forms.get(q) ?? []).forEach(w => bump(w, 100));
    for (const [form, ws] of index.forms)
      if (form.startsWith(q)) ws.forEach(w => bump(w, 50));
    if ([...q].length === 1)                          // single kanji lookup
      (index.chars.get(q) ?? []).forEach(w => bump(w, 25));
  } else {
    (index.glosses.get(q) ?? []).forEach(w => bump(w, 100));
    for (const [tok, ws] of index.glosses)
      if (tok.startsWith(q)) ws.forEach(w => bump(w, 40));
  }

  const isCommon = w => w.kanji.some(k => k.common) || w.kana.some(k => k.common);
  return [...scored]
    .map(([w, s]) => [w, s + (isCommon(w) ? 10 : 0)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

const $ = id => document.getElementById(id);
const input = $('query');
const statusEl = $('status');
const byId = new Map();
const keyOf = (id, form) => `${id}|${form}`;

// key -> { id, form }
let collection = loadCollection();

function loadCollection() {
  try {
    const raw = JSON.parse(localStorage.getItem('collection') ?? '[]');
    const map = new Map();
    for (const item of raw) {
      // accepts: "id" (oldest), ["id", form] (previous version), {id, form} (current)
      const id   = typeof item === 'string' ? item : Array.isArray(item) ? item[0] : item.id;
      const form = typeof item === 'string' ? null : Array.isArray(item) ? item[1] : item.form;
      map.set(keyOf(id, form), { id, form });
    }
    return map;
  } catch { return new Map(); }
}
function saveCollection() {
  try { localStorage.setItem('collection', JSON.stringify([...collection.values()])); } catch {}
}

// legacy items have form === null; fill them in once the dictionary has loaded
function migrateCollection() {
  const fixed = new Map();
  for (const { id, form } of collection.values()) {
    const w = byId.get(id);
    if (!w) continue;                       // also drops ids that no longer exist
    const f = form ?? pickForm(w);
    fixed.set(keyOf(id, f), { id, form: f });
  }
  collection = fixed;
  saveCollection();
}

// the collection as [{ w, form }], skipping any ids that aren't loaded
function collectionEntries() {
  return [...collection.values()]
    .map(({ id, form }) => ({ w: byId.get(id), form }))
    .filter(x => x.w);
}

// best written form for a query: exact match, then starts-with, then contains,
// else fall back to the first kanji form (or the kana if there's no kanji)
function pickForm(w, query = '') {
  const q = query.trim();
  if (q) {
    const texts = w.kanji.map(k => k.text);
    const match = texts.find(t => t === q)
      ?? texts.find(t => t.startsWith(q))
      ?? texts.find(t => t.includes(q));
    if (match) return match;
  }
  return w.kanji[0]?.text ?? w.kana[0].text;
}

// saved choice if the word is in the collection, otherwise the best match for the query
const formFor = (w, query = '') => collection.get(w.id) ?? pickForm(w, query);

// build one result row using textContent (no innerHTML, so no escaping issues)
function entryRow(w, { query = '', form = pickForm(w, query) } = {}) {
  const inCollection = collection.has(keyOf(w.id, form));

  const row = document.createElement('div');
  row.className = 'entry';
  row.dataset.id = w.id;
  row.dataset.form = form;

  row.classList.add(inCollection ? 'remove' : 'add');
  row.dataset.action = inCollection ? 'remove' : 'add';

  const rowHeader = document.createElement('header');
  rowHeader.className = 'entry-header';

  const head = document.createElement('span');
  head.className = 'headword';
  head.textContent = form;
  head.dataset.id = w.id;
  rowHeader.append(head);


  if (w.kanji.length) {
    const r = document.createElement('span');
    r.className = 'reading';
    r.textContent = w.kana[0].text;
    rowHeader.append(r);
  }
  if (w.kanji.some(k => k.common) || w.kana.some(k => k.common)) {
    const t = document.createElement('span');
    t.className = 'tag';
    t.textContent = 'common';
    rowHeader.append(t);
  }

  const gloss = document.createElement('p');
  gloss.className = 'gloss';
  gloss.textContent = w.sense.slice(0, 3)
    .map(s => s.gloss.map(g => g.text).join('; '))
    .join(' / ');
  
    
  row.append(rowHeader, gloss);
  return row;
}

function drillRow(w, form, reps = 4, kanjiOnly = false, exampleSentences = true, englishGlosses = false, relatedWords = false) {
  let word = form;
  let kanji = word.replace(/\P{Script=Han}/gu, ''); 
  let kanjiData = kanji ? getKanjiData(kanji) : null;
  
  let headword = kanjiOnly && kanji !== '' ? kanji.slice(0, 1) : word;
  
  const drillRowContainer = document.createElement('div');
  drillRowContainer.className = "drill-row-container";
  if(exampleSentences) drillRowContainer.classList.add('has-example');
  if(englishGlosses) drillRowContainer.classList.add('has-gloss');
  if(relatedWords) drillRowContainer.classList.add('has-related');

  // the header
  const drillRowHeader = document.createElement('div');
  drillRowHeader.className = "drill-row-header";

  const drillRowTitle = document.createElement('h3');

  if(kanjiOnly && kanjiData !== null) {
    drillRowTitle.innerHTML = `<span class="headword"><strong>${headword}</strong></span>`;
    kanjiData.then(data => {
      if(data) {
        drillRowTitle.innerHTML += data.jlpt ? `<span class="jlpt-tag">N${data.jlpt}</span>` : '';
        drillRowTitle.innerHTML += data.stroke_count ? `<span class="stroke-count">${data.stroke_count}画</span>` : '';
        drillRowTitle.innerHTML += `<div class="readings">
          <p><strong>音読み:</strong> ${data.on_readings?.join(', ') || 'N/A'} | 
          <strong>訓読み:</strong> ${data.kun_readings?.join(', ') || 'N/A'}</p>
        </div>`;
      }
    });

  } else {
    drillRowTitle.innerHTML = `<span class="headword"><strong>${word}</strong></span> <span class="reading">${w.kana[0].text}</span>`;
  }
  drillRowHeader.append(drillRowTitle);

  const exampleAndRelatedCont = document.createElement('div');
  exampleAndRelatedCont.className = "example-related-cont";
  
  getRelatedWords(kanji, word).then(words => {
    if (!words.length) return;
    const container = document.createElement('div');
    container.className = 'related-words';
    container.innerHTML = `<p>${words.join(' &#8226; ')}</p>`;
    exampleAndRelatedCont.append(container);
  });

  if(w.sense[0]?.examples?.length) {
    const exampleSentence = w.sense[0].examples[0];
    const sentenceEl = document.createElement('p');
    sentenceEl.className = 'example-sentence';
    sentenceEl.innerHTML = `<span><strong>例:</strong></span> ${exampleSentence.ja}`;
    exampleAndRelatedCont.append(sentenceEl);
  }
  
  drillRowHeader.append(exampleAndRelatedCont);
  
  const enGlossesContainer = document.createElement('div');
  enGlossesContainer.className = 'en-glosses-container';
  
  if(!kanjiOnly) {
    enGlossesContainer.innerHTML = `<span class="gloss">${w.sense.slice(0, 3).map(s => s.gloss.map(g => g.text).join('; ')).join(' / ')}</span>`;
  } else {
    kanjiData.then(data => {
      enGlossesContainer.innerHTML = `<span class="gloss">${data.meanings.join(', ')}</span>`;
    })
  }
  drillRowHeader.append(enGlossesContainer);

  drillRowContainer.append(drillRowHeader);

  const blockContainer = document.createElement('div');
  blockContainer.className = "block-container";
  // the blocks
  const TRACE_COPIES = 3;                              // how many filled copies to show
  const chars = headword.length > 1 ? [...headword] : headword;                         // also safe for rare kanji
  const blocks = chars.length * reps;
  const filled = chars.length * Math.min(TRACE_COPIES, reps);

  for (let i = 0; i < blocks; i++) {
    const block = document.createElement('div');
    block.className = 'kanji-block';
    if (i < filled) {
      block.classList.add('kanji-character');
      if(i < chars.length) block.classList.add('first');
      if(i < chars.length * 2 && i >= chars.length) block.classList.add('second');
      block.innerHTML = `<span>${chars[i % chars.length]}</span>`;     // wraps around for each copy
    }
    blockContainer.append(block);
  }
  
  drillRowContainer.append(blockContainer);
  return drillRowContainer;
}

function updateOptionsUI() {
  repsInput.value = options.reps;
  kanjiOnlyInput.checked = options.kanjiOnly;
  strokeOrderInput.checked = options.strokeOrder;
  exampleSentencesInput.checked = options.exampleSentences;
  englishGlossesInput.checked = options.englishGlosses;
  relatedWordsInput.checked = options.relatedWords;
  showGridInput.checked = options.showGrid;

  document.getElementById('reps').value = options.reps;
  document.getElementById('kanji-only').checked = options.kanjiOnly;
  document.getElementById('stroke-order').checked = options.strokeOrder; 
  document.getElementById('example-sentences').checked = options.exampleSentences;
  document.getElementById('en-gloss').checked = options.englishGlosses;
  document.getElementById('related-words').checked = options.relatedWords;
  document.getElementById('show-grid').checked = options.showGrid;

  if(options.strokeOrder) {
    document.body.classList.add('stroke-order');
  } else {
    document.body.classList.remove('stroke-order');
  }
  
  if(options.showGrid) {
    document.body.classList.add('grid');
  } else {
    document.body.classList.remove('grid');
  }

  renderDrillRows(options.reps, options.kanjiOnly, options.exampleSentences, options.englishGlosses);
}
updateOptionsUI(); 

function renderResults(list) {
  $('results').replaceChildren(...list.map(w => entryRow(w, { query: input.value })));
  statusEl.textContent = list.length ? `${list.length} result(s)` : (input.value.trim() ? 'No matches' : '');
}

function renderCollection() {
  const items = collectionEntries();
  $('collection').replaceChildren(...items.map(({ w, form }) => entryRow(w, { form })));
  $('count').textContent = items.length;
}

function renderDrillRows(reps = options.reps, kanjiOnly = options.kanjiOnly, exampleSentences = options.exampleSentences, englishGlosses = options.englishGlosses, relatedWords = options.relatedWords) {
  $('sheet').replaceChildren(...collectionEntries().map(({ w, form }) =>
    drillRow(w, form, reps, kanjiOnly, exampleSentences, englishGlosses, relatedWords)));
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.entry[data-action]');
  if (!btn) return;
  const { id, form, action } = btn.dataset;
  const key = keyOf(id, form);
  if (action === 'add') collection.set(key, { id, form });
  else collection.delete(key);
  saveCollection();
  renderCollection();
  renderDrillRows(options.reps, options.kanjiOnly, options.exampleSentences);
  renderResults(search(input.value));
});

$('search').addEventListener('submit', e => e.preventDefault());

// options event listeners


let timer;
input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => renderResults(search(input.value)), 150);
});

// boot
fetch('./src/data/words.json')
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${r.url}`);
    return r.json();
  })
  .then(words => {
    for (const w of words) byId.set(w.id, w);
    buildIndex(words);
    migrateCollection();
    input.disabled = false;
    input.focus();
    statusEl.textContent = `${words.length.toLocaleString()}件の項目を読み込みました`;
    renderCollection();
    renderDrillRows();
  })
  .catch(err => {
    statusEl.textContent = `Failed to load: ${err.message}`;
    console.error(err);
  });

// options changes
optionsForm.addEventListener('change', () => {
  options = getOptions();
  updateOptionsUI(); 
  saveOptions();
});

// Get KanjiAPI data

function kanjiApi(path, character) {
  const url = `https://kanjiapi.dev/v1/${path}/${encodeURIComponent(character)}`;
  if (!apiCache.has(url)) {
    const p = fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return r.json();
      })
      .catch(err => {
        console.error('KanjiAPI failed:', err);
        apiCache.delete(url);                     // don't cache failures
      });
    apiCache.set(url, p);
  }
  return apiCache.get(url);
}

function getKanjiData(text) {
  return kanjiApi('kanji', [...text][0]);         // first kanji only, as before
}

async function getKanjiWords(character) {
  const data = await kanjiApi('words', character);
  return data && [...data].reverse();             // copy, so the cached array isn't mutated
}

// related words for each kanji in a word, as one flat array of strings
async function getRelatedWords(kanji, exclude = '') {
  const chars = [...new Set(kanji)];
  if (!chars.length) return [];
  const perKanji = chars.length === 1 ? 6 : 3;

  const lists = await Promise.all(chars.map(ch => getKanjiWords(ch)));

  const seen = new Set([exclude]);
  const out = [];

  for (const [i, list] of lists.entries()) {
    const ch = chars[i];
    let taken = 0;

    for (const entry of list ?? []) {
      // same dictionary word as the headword (伸ばす ≡ 延ばす), whichever form was picked
      if (entry.variants.some(v => v.written === exclude)) continue;

      // show the written form that actually contains this kanji
      const written = (entry.variants.find(v => v.written.includes(ch)) ?? entry.variants[0])?.written;
      if (!written || seen.has(written)) continue;

      seen.add(written);
      out.push(written);
      if (++taken === perKanji) break;
    }
  }
  return out;
}

// toggle options panel
const toggleOptionsBtn = document.getElementById('toggle-options');
const optionsWrapper = document.querySelector('.options-wrapper');

toggleOptionsBtn.addEventListener('click', () => {
  optionsWrapper.classList.toggle('collapsed');
  const icon = toggleOptionsBtn.querySelector('svg');
  if (optionsWrapper.classList.contains('collapsed')) {
    icon.setAttribute('data-lucide', 'chevron-down');
  } else {
    icon.setAttribute('data-lucide', 'chevron-up');
  }
  lucide.createIcons(); // Refresh icons after changing
});