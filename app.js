const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const WORDS = [
  'pressure','concrete','vision','hustle','shadow','machine','freedom','city','danger','money',
  'rhythm','family','power','corner','future','battle','mirror','night','street','fire','silence',
  'broken','gold','motion','truth','memory','system','summer','winter','focus','energy','legacy',
  'gravity','respect','change','dream','signal','champion','storm','heart','time','loyalty','noise',
  'diamond','reason','moment','control','culture','vintage','hunger','midnight','victory','story'
];

const state = {
  mode: 'search',
  rhymeType: localStorage.getItem('hf-rhyme-type') || 'both',
  seconds: Number(localStorage.getItem('hf-seconds')) || 30,
  remaining: 30,
  timerId: null,
  running: false,
  held: false,
  currentWord: '',
  requestId: 0
};

const els = {
  seedInput: $('#seedInput'),
  searchBtn: $('#searchBtn'),
  randomBtn: $('#randomBtn'),
  startCypherBtn: $('#startCypherBtn'),
  holdBtn: $('#holdBtn'),
  nextBtn: $('#nextBtn'),
  stopBtn: $('#stopBtn'),
  seedWord: $('#seedWord'),
  rhymeGrid: $('#rhymeGrid'),
  emptyState: $('#emptyState'),
  statusLabel: $('#statusLabel'),
  resultCount: $('#resultCount'),
  timerDisplay: $('#timerDisplay')
};

function setMode(mode) {
  state.mode = mode;
  stopCypher();
  $$('.mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  $('#searchControls').classList.toggle('hidden', mode !== 'search');
  $('#randomControls').classList.toggle('hidden', mode !== 'random');
  $('#cypherControls').classList.toggle('hidden', mode !== 'cypher');
  els.statusLabel.textContent = mode === 'cypher' ? 'CYPHER READY' : 'READY';
}

function randomWord() {
  let next = state.currentWord;
  while (next === state.currentWord && WORDS.length > 1) {
    next = WORDS[Math.floor(Math.random() * WORDS.length)];
  }
  return next;
}

function formatTime(total) {
  return `00:${String(total).padStart(2, '0')}`;
}

function updateTimer() {
  els.timerDisplay.textContent = formatTime(state.remaining);
}

async function fetchRhymes(word) {
  const requestId = ++state.requestId;
  els.statusLabel.textContent = 'LOADING';
  els.rhymeGrid.innerHTML = '';
  els.emptyState.classList.add('hidden');

  try {
    const encoded = encodeURIComponent(word);
    const perfectUrl = `https://api.datamuse.com/words?rel_rhy=${encoded}&md=sp&max=1000`;
    const nearUrl = `https://api.datamuse.com/words?rel_nry=${encoded}&md=sp&max=1000`;

    const calls = [];
    if (state.rhymeType === 'perfect' || state.rhymeType === 'both') calls.push(fetch(perfectUrl).then(r => r.ok ? r.json() : Promise.reject(r.status)));
    else calls.push(Promise.resolve([]));
    if (state.rhymeType === 'near' || state.rhymeType === 'both') calls.push(fetch(nearUrl).then(r => r.ok ? r.json() : Promise.reject(r.status)));
    else calls.push(Promise.resolve([]));

    const [perfect, near] = await Promise.all(calls);
    if (requestId !== state.requestId) return;

    const seed = word.toLowerCase();
    const used = new Set();
    const perfectClean = [];
    const nearClean = [];

    perfect.forEach(item => {
      const key = item.word.toLowerCase();
      if (!used.has(key) && key !== seed) {
        used.add(key);
        perfectClean.push({ ...item, kind: 'perfect' });
      }
    });

    near.forEach(item => {
      const key = item.word.toLowerCase();
      if (!used.has(key) && key !== seed) {
        used.add(key);
        nearClean.push({ ...item, kind: 'near' });
      }
    });

    renderRhymes(perfectClean, nearClean);
    els.statusLabel.textContent = state.running ? (state.held ? 'HELD' : 'CYPHER LIVE') : 'LOCKED IN';
  } catch (err) {
    if (requestId !== state.requestId) return;
    els.statusLabel.textContent = 'CONNECTION MISS';
    els.resultCount.textContent = '0 WORDS';
    els.emptyState.textContent = 'Could not reach the rhyme service. Hit NEXT or try again.';
    els.emptyState.classList.remove('hidden');
  }
}

function renderRhymes(perfectItems, nearItems) {
  els.rhymeGrid.innerHTML = '';
  const total = perfectItems.length + nearItems.length;
  els.resultCount.textContent = `${total} WORD${total === 1 ? '' : 'S'}`;

  if (!total) {
    els.emptyState.textContent = 'No rhymes found. Hit NEXT and keep moving.';
    els.emptyState.classList.remove('hidden');
    return;
  }

  const makeGroup = (label, items, kind) => {
    if (!items.length) return;
    const section = document.createElement('section');
    section.className = `rhyme-section ${kind}`;

    const head = document.createElement('div');
    head.className = 'rhyme-section-head';
    head.innerHTML = `<span>${label}</span><b>${items.length}</b>`;
    section.appendChild(head);

    const list = document.createElement('div');
    list.className = 'rhyme-list';

    items.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'rhyme-word';
      button.textContent = item.word;
      button.title = 'Tap to copy';
      button.addEventListener('click', () => navigator.clipboard?.writeText(item.word).catch(() => {}));
      list.appendChild(button);
    });

    section.appendChild(list);
    els.rhymeGrid.appendChild(section);
  };

  makeGroup('PERFECT RHYMES', perfectItems, 'perfect');
  makeGroup('NEAR RHYMES', nearItems, 'near');
}

function showWord(word) {
  const clean = word.trim().toLowerCase();
  if (!clean) return;
  state.currentWord = clean;
  els.seedWord.textContent = clean;
  els.seedWord.classList.remove('slam');
  void els.seedWord.offsetWidth;
  els.seedWord.classList.add('slam');
  fetchRhymes(clean);
}

function nextWord() {
  if (state.mode === 'search' && !state.running) {
    const typed = els.seedInput.value.trim();
    showWord(typed || randomWord());
    return;
  }
  showWord(randomWord());
  if (state.running) resetCypherClock();
}

function resetCypherClock() {
  state.remaining = state.seconds;
  updateTimer();
}

function startCypher() {
  stopCypher();
  state.running = true;
  state.held = false;
  els.holdBtn.disabled = false;
  els.holdBtn.textContent = 'HOLD';
  els.stopBtn.classList.remove('hidden');
  els.startCypherBtn.textContent = 'RESTART CYPHER';
  els.statusLabel.textContent = 'CYPHER LIVE';
  resetCypherClock();
  showWord(randomWord());

  state.timerId = setInterval(() => {
    if (!state.running || state.held) return;
    state.remaining -= 1;
    updateTimer();
    if (state.remaining <= 0) {
      showWord(randomWord());
      resetCypherClock();
    }
  }, 1000);
}

function stopCypher() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
  state.running = false;
  state.held = false;
  els.holdBtn.disabled = true;
  els.holdBtn.textContent = 'HOLD';
  els.stopBtn.classList.add('hidden');
  els.startCypherBtn.textContent = 'START CYPHER';
  state.remaining = state.seconds;
  updateTimer();
}

function toggleHold() {
  if (!state.running) return;
  state.held = !state.held;
  els.holdBtn.textContent = state.held ? 'RELEASE' : 'HOLD';
  els.statusLabel.textContent = state.held ? 'HELD' : 'CYPHER LIVE';
}

$$('.mode-btn').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
els.searchBtn.addEventListener('click', () => showWord(els.seedInput.value));
els.seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') showWord(els.seedInput.value); });
els.randomBtn.addEventListener('click', () => showWord(randomWord()));
els.nextBtn.addEventListener('click', nextWord);
els.startCypherBtn.addEventListener('click', startCypher);
els.stopBtn.addEventListener('click', stopCypher);
els.holdBtn.addEventListener('click', toggleHold);

$$('[data-seconds]').forEach(btn => btn.addEventListener('click', () => {
  state.seconds = Number(btn.dataset.seconds);
  state.remaining = state.seconds;
  localStorage.setItem('hf-seconds', String(state.seconds));
  $$('[data-seconds]').forEach(b => b.classList.toggle('selected', b === btn));
  updateTimer();
  if (state.running) startCypher();
}));

$$('[data-rhyme]').forEach(btn => btn.addEventListener('click', () => {
  state.rhymeType = btn.dataset.rhyme;
  localStorage.setItem('hf-rhyme-type', state.rhymeType);
  $$('[data-rhyme]').forEach(b => b.classList.toggle('selected', b === btn));
  if (state.currentWord) fetchRhymes(state.currentWord);
}));

$$('[data-seconds]').forEach(btn => btn.classList.toggle('selected', Number(btn.dataset.seconds) === state.seconds));
$$('[data-rhyme]').forEach(btn => btn.classList.toggle('selected', btn.dataset.rhyme === state.rhymeType));
state.remaining = state.seconds;
updateTimer();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
