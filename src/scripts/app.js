// Built with the help of Claude.ai, using the JMdict examples data set

const optionsForm = document.getElementById('options');
const repsInput = document.getElementById('reps');
const kanjiOnlyInput = document.getElementById('kanji-only');
const strokeOrderInput = document.getElementById('stroke-order');
const exampleSentencesInput = document.getElementById('example-sentences');
const englishGlossesInput = document.getElementById('en-gloss');
const relatedWordsInput = document.getElementById('related-words');

let options = loadOptions() || {
  exampleSentences: true,
  englishGlosses: false,
  reps: 4,
  kanjiOnly: false,
  strokeOrder: false,
  relatedWords: false
};

function loadOptions() {
  try { 
    let opts = JSON.parse(localStorage.getItem('options') ?? '{}');
    return opts;
  }
  catch { return {}; }
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
    reps: parseInt(repsInput.value) || 4,
    kanjiOnly: kanjiOnlyInput.checked,
    strokeOrder: strokeOrderInput.checked,
    exampleSentences: exampleSentencesInput.checked,
    englishGlosses: englishGlossesInput.checked,
    relatedWords: relatedWordsInput.checked
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
const input = $('query'), statusEl = $('status');
const byId = new Map();
let collection = loadCollection();

function loadCollection() {
  try { return new Set(JSON.parse(localStorage.getItem('collection') ?? '[]')); }
  catch { return new Set(); }
}
function saveCollection() {
  try { localStorage.setItem('collection', JSON.stringify([...collection])); } catch {}
}

// build one result row using textContent (no innerHTML, so no escaping issues)
function entryRow(w, { removable = false } = {}) {
  const row = document.createElement('div');
  row.className = 'entry';
  row.dataset.id = w.id;
  
  if(removable || collection.has(w.id)) {
    row.classList.add("remove");
    row.dataset.action = "remove";
  } else {
    row.classList.add("add");
    row.dataset.action = "add";
  }
  
  const rowHeader = document.createElement("header");
  rowHeader.className = "entry-header";

  const head = document.createElement('span');
  head.className = 'headword';
  head.textContent = w.kanji[0]?.text ?? w.kana[0].text;
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

function drillRow(w, reps = 4, kanjiOnly = false, exampleSentences = true, englishGlosses = false, relatedWords = false) {
  let headword = w.kanji[0]?.text ?? w.kana[0].text;

  if(kanjiOnly) {
    headword = headword.replace(/\P{Script=Han}/gu, '');
  }

  let blocks = headword.length * reps;
  
  const drillRowContainer = document.createElement('div');
  drillRowContainer.className = "drill-row-container";

  // the header
  const drillRowHeader = document.createElement('div');
  drillRowHeader.className = "drill-row-header";

  const drillRowTitle = document.createElement('h3');

  if(kanjiOnly) {
    drillRowTitle.innerHTML = `<span class="headword"><strong>${headword}</strong></span>`;
    getKanjiData(headword).then(data => {
      if(data) {
        drillRowTitle.innerHTML += data.jlpt ? `<span class="jlpt-tag">N${data.jlpt}</span>` : '';
        drillRowTitle.innerHTML += data.stroke_count ? `<span class="stroke-count">${data.stroke_count}画</span>` : '';
        drillRowTitle.innerHTML += `<div class="readings">
          <span><strong>音読み:</strong> ${data.on_readings?.join(', ') || 'N/A'}</span>
          <span><strong>訓読み:</strong> ${data.kun_readings?.join(', ') || 'N/A'}</span>
        </div>`;
      }
    });

  } else {
    drillRowTitle.innerHTML = `<span class="headword"><strong>${w.kanji[0]?.text ?? w.kana[0].text}</strong></span> <span class="reading">${w.kana[0].text}</span>`;
  }
  drillRowHeader.append(drillRowTitle);

  if(relatedWords) {
    getKanjiWords(headword).then(data => {
      if(data && data.length) {
        const relatedWordsContainer = document.createElement('div');
        relatedWordsContainer.className = 'related-words-container';
        relatedWordsContainer.innerHTML = `<strong>Related Words:</strong>`;
        data.slice(0, 5).forEach(word => {
          const wordEl = document.createElement('span');
          wordEl.className = 'related-word';
          wordEl.innerHTML = `<ruby>${word.variants[0].written}<rt>${word.variants[0].pronounced}</rt></ruby>`;
          relatedWordsContainer.append(wordEl);
        });
        drillRowHeader.append(relatedWordsContainer);
      }
    });
  } 


  if(englishGlosses) {
    drillRowHeader.innerHTML += `<div class="gloss-container"><span class="gloss">${w.sense.slice(0, 3).map(s => s.gloss.map(g => g.text).join('; ')).join(' / ')}</span></div>`;
  }

  if(exampleSentences && w.sense[0]?.examples?.length) {
    const exampleSentence = w.sense[0].examples[0];
    const sentenceEl = document.createElement('p');
    sentenceEl.className = 'example-sentence';
    sentenceEl.innerHTML = `<strong>例:</strong> ${exampleSentence.ja}`;
    drillRowHeader.append(sentenceEl);
  }

  drillRowContainer.append(drillRowHeader);

  const blockContainer = document.createElement('div');
  blockContainer.className = "block-container";
  // the blocks
  for(let i = 0; i < blocks; i++) {
    const block = document.createElement('div');
    block.className = "kanji-block";
    if(i < headword.length) {
      block.classList.add("kanji-character");
      block.textContent = headword.charAt(i);
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

  document.getElementById('reps').value = options.reps;
  document.getElementById('kanji-only').checked = options.kanjiOnly;
  document.getElementById('stroke-order').checked = options.strokeOrder; 
  document.getElementById('example-sentences').checked = options.exampleSentences;
  document.getElementById('en-gloss').checked = options.englishGlosses;

  if(options.strokeOrder) {
    document.body.classList.add('stroke-order');
  } else {
    document.body.classList.remove('stroke-order');
  }

  renderDrillRows(options.reps, options.kanjiOnly, options.exampleSentences, options.englishGlosses);
}
updateOptionsUI(); 

function renderResults(list) {
  $('results').replaceChildren(...list.map(w => entryRow(w, false)));
  statusEl.textContent = list.length ? `${list.length} result(s)` : (input.value.trim() ? 'No matches' : '');
}

function renderCollection() {
  const words = [...collection].map(id => byId.get(id)).filter(Boolean);
  $('collection').replaceChildren(...words.map(w => entryRow(w, { removable: true })));
  $('count').textContent = words.length;
}

function renderDrillRows(reps = options.reps, kanjiOnly = options.kanjiOnly, exampleSentences = options.exampleSentences, englishGlosses = options.englishGlosses, relatedWords = options.relatedWords) {
  const words = [...collection].map(id => byId.get(id)).filter(Boolean);
  $('sheet').replaceChildren(...words.map(w => drillRow(w, reps, kanjiOnly, exampleSentences, englishGlosses, relatedWords)));
}

// one listener per container instead of one per button
document.addEventListener('click', e => {
  const btn = e.target.closest('.entry[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'add') collection.add(btn.dataset.id);
  else collection.delete(btn.dataset.id);
  saveCollection();
  renderCollection();
  renderDrillRows(options.reps, options.kanjiOnly, options.exampleSentences);
  renderResults(search(input.value));   // refresh Add/Added states
});

$('search-form').addEventListener('submit', e => e.preventDefault());

// options event listeners


let timer;
input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => renderResults(search(input.value)), 150);
});

// boot
fetch('/src/data/words.json')
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${r.url}`);
    return r.json();
  })
  .then(words => {
    for (const w of words) byId.set(w.id, w);
    buildIndex(words);
    input.disabled = false;
    input.focus();
    statusEl.textContent = `${words.length.toLocaleString()} entries loaded`;
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

  if(options.strokeOrder) {
    document.body.classList.add('stroke-order');
  } else {
    document.body.classList.remove('stroke-order');
  }
  saveOptions();
  renderDrillRows(options.reps, options.kanjiOnly);
});

// Get KanjiAPI data
async function getKanjiData(character) {
  const url = `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(character)}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch kanji:', error);
  }
}

async function getKanjiWords(character) {
  const url = `https://kanjiapi.dev/v1/words/${encodeURIComponent(character)}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch kanji:', error);
  }
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