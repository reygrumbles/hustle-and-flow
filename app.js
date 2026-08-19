const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const WORDS = [
  'pressure','concrete','vision','hustle','shadow','machine','freedom','city','danger','money',
  'rhythm','family','power','corner','future','battle','mirror','night','street','fire','silence',
  'broken','gold','motion','truth','memory','system','summer','winter','focus','energy','legacy',
  'gravity','respect','change','dream','signal','champion','storm','heart','time','loyalty','noise',
  'diamond','reason','moment','control','culture','vintage','hunger','midnight','victory','story',
  'game','flame','motion','pressure','reason','kingdom','signal','damage','honor','grind','soul'
];

const savedRhyme = localStorage.getItem('hf-rhyme-type');
const savedSeconds = Number(localStorage.getItem('hf-seconds'));
const state = {
  mode: 'cypher',
  rhymeType: ['both','perfect','near'].includes(savedRhyme) ? savedRhyme : 'both',
  seconds: [30,60,90].includes(savedSeconds) ? savedSeconds : 30,
  running: false,
  held: false,
  focus: false,
  timerId: null,
  single: { word: '', remaining: 30, request: 0 },
  dual: {
    a: { word: '', remaining: 30, request: 0 },
    b: { word: '', remaining: 30, request: 0 },
    bStarted: false,
    offsetRemaining: 15,
    lastChanged: 'a'
  }
};

const els = {
  modeSelect: $('#modeSelect'),
  timeSelect: $('#timeSelect'),
  rhymeSelect: $('#rhymeSelect'),
  timeSelectBox: $('#timeSelectBox'),
  dualNote: $('#dualNote'),
  writeControls: $('#writeControls'),
  seedInput: $('#seedInput'),
  searchBtn: $('#searchBtn'),
  primaryBtn: $('#primaryBtn'),
  focusBtn: $('#focusBtn'),
  singleStage: $('#singleStage'),
  singleWord: $('#singleWord'),
  singleTimer: $('#singleTimer'),
  singleCount: $('#singleCount'),
  singleBreakdown: $('#singleBreakdown'),
  singleBank: $('#singleBank'),
  dualStage: $('#dualStage'),
  laneA: $('#laneA'), laneB: $('#laneB'),
  wordA: $('#wordA'), wordB: $('#wordB'),
  timerA: $('#timerA'), timerB: $('#timerB'),
  countA: $('#countA'), countB: $('#countB'),
  bankA: $('#bankA'), bankB: $('#bankB'),
  holdBtn: $('#holdBtn'), nextBtn: $('#nextBtn'), stopBtn: $('#stopBtn'),
  focusHandle: $('#focusHandle'), focusDock: $('#focusDock'),
  focusHoldBtn: $('#focusHoldBtn'), focusNextBtn: $('#focusNextBtn'), exitFocusBtn: $('#exitFocusBtn')
};

function formatTime(total) {
  return `00:${String(Math.max(0, total)).padStart(2, '0')}`;
}

function randomWord(exclude = []) {
  const blocked = new Set(exclude.filter(Boolean).map(w => w.toLowerCase()));
  const pool = WORDS.filter(w => !blocked.has(w.toLowerCase()));
  return pool[Math.floor(Math.random() * pool.length)] || WORDS[0];
}

function setActiveLane(which) {
  state.dual.lastChanged = which;
  els.laneA.classList.toggle('active-lane', which === 'a');
  els.laneB.classList.toggle('active-lane', which === 'b');
}

function setMode(mode) {
  stopSession();
  state.mode = mode;
  els.modeSelect.value = mode;
  const timed = mode === 'cypher' || mode === 'dual';
  els.timeSelectBox.classList.toggle('hidden', !timed);
  els.dualNote.classList.toggle('hidden', mode !== 'dual');
  els.writeControls.classList.toggle('hidden', mode !== 'search');
  els.singleStage.classList.toggle('hidden', mode === 'dual');
  els.dualStage.classList.toggle('hidden', mode !== 'dual');

  if (mode === 'search') els.primaryBtn.textContent = 'RUN WORD';
  if (mode === 'random') els.primaryBtn.textContent = 'THROW A WORD';
  if (mode === 'cypher') els.primaryBtn.textContent = 'START CYPHER';
  if (mode === 'dual') els.primaryBtn.textContent = 'START DUAL CYPHER';

  resetStageCopy();
}

function resetStageCopy() {
  if (state.mode !== 'dual') {
    els.singleTimer.textContent = state.mode === 'cypher' ? formatTime(state.seconds) : '—';
    els.singleBreakdown.textContent = 'READY';
  } else {
    els.timerA.textContent = formatTime(state.seconds);
    els.timerB.textContent = '+00:15';
  }
}

async function getRhymes(word) {
  const encoded = encodeURIComponent(word);
  const perfectUrl = `https://api.datamuse.com/words?rel_rhy=${encoded}&md=sp&max=1000`;
  const nearUrl = `https://api.datamuse.com/words?rel_nry=${encoded}&md=sp&max=1000`;
  const perfectPromise = state.rhymeType === 'near' ? Promise.resolve([]) : fetch(perfectUrl).then(r => r.ok ? r.json() : Promise.reject(r.status));
  const nearPromise = state.rhymeType === 'perfect' ? Promise.resolve([]) : fetch(nearUrl).then(r => r.ok ? r.json() : Promise.reject(r.status));
  const [perfectRaw, nearRaw] = await Promise.all([perfectPromise, nearPromise]);

  const used = new Set([word.toLowerCase()]);
  const clean = (items, kind) => items.reduce((out, item) => {
    const key = item.word.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      out.push({ word: item.word, kind });
    }
    return out;
  }, []);
  return { perfect: clean(perfectRaw, 'perfect'), near: clean(nearRaw, 'near') };
}

function bankMarkup(perfect, near) {
  const group = (label, items, kind) => {
    if (!items.length) return '';
    return `<section class="rhyme-group ${kind}">
      <div class="group-head"><span>${label}</span><b>${items.length}</b></div>
      <div class="word-grid">${items.map(item => `<button class="rhyme-word" data-copy="${escapeAttr(item.word)}">${escapeHtml(item.word)}</button>`).join('')}</div>
    </section>`;
  };
  return group('PERFECT', perfect, 'perfect') + group('NEAR', near, 'near');
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function escapeAttr(text) { return escapeHtml(text); }

function wireCopy(container) {
  container.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => {
    navigator.clipboard?.writeText(btn.dataset.copy).catch(() => {});
  }));
}

async function loadSingle(word) {
  const clean = word.trim().toLowerCase();
  if (!clean) return;
  state.single.word = clean;
  const req = ++state.single.request;
  els.singleWord.textContent = clean;
  els.singleBreakdown.textContent = 'LOADING';
  els.singleBank.innerHTML = '<div class="empty-copy">Loading the full rhyme bank…</div>';

  try {
    const { perfect, near } = await getRhymes(clean);
    if (req !== state.single.request) return;
    const total = perfect.length + near.length;
    els.singleCount.textContent = `${total} WORD${total === 1 ? '' : 'S'}`;
    els.singleBreakdown.textContent = `${perfect.length} PERFECT • ${near.length} NEAR`;
    els.singleBank.innerHTML = total ? bankMarkup(perfect, near) : '<div class="empty-copy">No rhymes found. Hit NEXT.</div>';
    wireCopy(els.singleBank);
    els.focusBtn.disabled = false;
    els.nextBtn.disabled = false;
  } catch {
    if (req !== state.single.request) return;
    els.singleCount.textContent = '0 WORDS';
    els.singleBreakdown.textContent = 'CONNECTION MISS';
    els.singleBank.innerHTML = '<div class="empty-copy">Could not reach the rhyme service. Hit NEXT or try again.</div>';
  }
}

async function loadLane(which, word) {
  const lane = state.dual[which];
  const clean = word.trim().toLowerCase();
  lane.word = clean;
  const req = ++lane.request;
  const wordEl = which === 'a' ? els.wordA : els.wordB;
  const countEl = which === 'a' ? els.countA : els.countB;
  const bankEl = which === 'a' ? els.bankA : els.bankB;
  const cardEl = which === 'a' ? els.laneA : els.laneB;
  wordEl.textContent = clean;
  cardEl.classList.remove('waiting');
  bankEl.innerHTML = '<div class="empty-copy">Loading rhyme bank…</div>';
  setActiveLane(which);

  try {
    const { perfect, near } = await getRhymes(clean);
    if (req !== lane.request) return;
    const total = perfect.length + near.length;
    countEl.textContent = `${total} WORD${total === 1 ? '' : 'S'}`;
    bankEl.innerHTML = total ? bankMarkup(perfect, near) : '<div class="empty-copy">No rhymes found. Rotate the lane.</div>';
    wireCopy(bankEl);
    els.focusBtn.disabled = false;
    els.nextBtn.disabled = false;
  } catch {
    if (req !== lane.request) return;
    countEl.textContent = '0 WORDS';
    bankEl.innerHTML = '<div class="empty-copy">Connection miss. This lane will retry on the next word.</div>';
  }
}

function startSingleCypher() {
  stopTimerOnly();
  state.running = true;
  state.held = false;
  state.single.remaining = state.seconds;
  updateSingleTimer();
  loadSingle(randomWord([state.single.word]));
  updateControls();
  els.primaryBtn.textContent = 'RESTART CYPHER';
  state.timerId = setInterval(() => {
    if (!state.running || state.held) return;
    state.single.remaining -= 1;
    if (state.single.remaining <= 0) {
      state.single.remaining = state.seconds;
      loadSingle(randomWord([state.single.word]));
    }
    updateSingleTimer();
  }, 1000);
}

function startDual() {
  stopTimerOnly();
  state.running = true;
  state.held = false;
  state.dual.a.remaining = state.seconds;
  state.dual.b.remaining = state.seconds;
  state.dual.bStarted = false;
  state.dual.offsetRemaining = 15;
  els.wordB.textContent = 'STANDBY';
  els.countB.textContent = '0 WORDS';
  els.bankB.innerHTML = '<div class="empty-copy">Lane B enters 15 seconds after Lane A.</div>';
  els.laneB.classList.add('waiting');
  loadLane('a', randomWord([state.dual.a.word, state.dual.b.word]));
  updateDualTimers();
  updateControls();
  els.primaryBtn.textContent = 'RESTART DUAL';

  state.timerId = setInterval(() => {
    if (!state.running || state.held) return;
    state.dual.a.remaining -= 1;
    if (state.dual.a.remaining <= 0) {
      state.dual.a.remaining = state.seconds;
      loadLane('a', randomWord([state.dual.a.word, state.dual.b.word]));
    }

    if (!state.dual.bStarted) {
      state.dual.offsetRemaining -= 1;
      if (state.dual.offsetRemaining <= 0) {
        state.dual.bStarted = true;
        state.dual.b.remaining = state.seconds;
        loadLane('b', randomWord([state.dual.a.word, state.dual.b.word]));
      }
    } else {
      state.dual.b.remaining -= 1;
      if (state.dual.b.remaining <= 0) {
        state.dual.b.remaining = state.seconds;
        loadLane('b', randomWord([state.dual.a.word, state.dual.b.word]));
      }
    }
    updateDualTimers();
  }, 1000);
}

function updateSingleTimer() { els.singleTimer.textContent = formatTime(state.single.remaining); }
function updateDualTimers() {
  els.timerA.textContent = formatTime(state.dual.a.remaining);
  els.timerB.textContent = state.dual.bStarted ? formatTime(state.dual.b.remaining) : `+${formatTime(state.dual.offsetRemaining)}`;
}

function stopTimerOnly() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}

function stopSession() {
  stopTimerOnly();
  state.running = false;
  state.held = false;
  state.single.remaining = state.seconds;
  state.dual.a.remaining = state.seconds;
  state.dual.b.remaining = state.seconds;
  state.dual.offsetRemaining = 15;
  state.dual.bStarted = false;
  updateControls();
  resetStageCopy();
  if (state.mode === 'cypher') els.primaryBtn.textContent = 'START CYPHER';
  if (state.mode === 'dual') els.primaryBtn.textContent = 'START DUAL CYPHER';
}

function updateControls() {
  const timed = state.mode === 'cypher' || state.mode === 'dual';
  els.holdBtn.disabled = !state.running || !timed;
  els.focusHoldBtn.classList.toggle('hidden', !timed);
  els.nextBtn.disabled = state.mode === 'search' ? !state.single.word : false;
  els.stopBtn.disabled = !state.running;
  const label = state.held ? 'RELEASE' : 'HOLD';
  els.holdBtn.textContent = label;
  els.focusHoldBtn.textContent = label;
}

function toggleHold() {
  if (!state.running) return;
  state.held = !state.held;
  updateControls();
}

function nextNow() {
  if (state.mode === 'search') {
    const word = els.seedInput.value.trim() || randomWord([state.single.word]);
    loadSingle(word);
    return;
  }
  if (state.mode === 'random') {
    loadSingle(randomWord([state.single.word]));
    return;
  }
  if (state.mode === 'cypher') {
    state.single.remaining = state.seconds;
    updateSingleTimer();
    loadSingle(randomWord([state.single.word]));
    return;
  }
  if (state.mode === 'dual') {
    const which = state.dual.lastChanged === 'a' ? 'b' : 'a';
    if (which === 'b' && !state.dual.bStarted) {
      state.dual.bStarted = true;
      state.dual.b.remaining = state.seconds;
    } else {
      state.dual[which].remaining = state.seconds;
    }
    loadLane(which, randomWord([state.dual.a.word, state.dual.b.word]));
    updateDualTimers();
  }
}

function primaryAction() {
  if (state.mode === 'search') {
    loadSingle(els.seedInput.value.trim() || randomWord([state.single.word]));
  } else if (state.mode === 'random') {
    loadSingle(randomWord([state.single.word]));
  } else if (state.mode === 'cypher') {
    startSingleCypher();
  } else {
    startDual();
  }
}

async function enterFocus() {
  if (els.focusBtn.disabled) return;
  state.focus = true;
  document.body.classList.add('focus-mode');
  els.focusHandle.classList.remove('hidden');
  els.focusDock.classList.add('hidden');
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch (_) {}
}

async function exitFocus() {
  state.focus = false;
  document.body.classList.remove('focus-mode');
  els.focusHandle.classList.add('hidden');
  els.focusDock.classList.add('hidden');
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  } catch (_) {}
}

els.modeSelect.value = state.mode;
els.timeSelect.value = String(state.seconds);
els.rhymeSelect.value = state.rhymeType;
setMode(state.mode);

els.modeSelect.addEventListener('change', e => setMode(e.target.value));
els.timeSelect.addEventListener('change', e => {
  state.seconds = Number(e.target.value);
  localStorage.setItem('hf-seconds', String(state.seconds));
  stopSession();
});
els.rhymeSelect.addEventListener('change', e => {
  state.rhymeType = e.target.value;
  localStorage.setItem('hf-rhyme-type', state.rhymeType);
  if (state.mode === 'dual') {
    if (state.dual.a.word) loadLane('a', state.dual.a.word);
    if (state.dual.bStarted && state.dual.b.word) loadLane('b', state.dual.b.word);
  } else if (state.single.word) loadSingle(state.single.word);
});
els.primaryBtn.addEventListener('click', primaryAction);
els.searchBtn.addEventListener('click', () => loadSingle(els.seedInput.value.trim() || randomWord([state.single.word])));
els.seedInput.addEventListener('keydown', e => { if (e.key === 'Enter') primaryAction(); });
els.holdBtn.addEventListener('click', toggleHold);
els.focusHoldBtn.addEventListener('click', toggleHold);
els.nextBtn.addEventListener('click', nextNow);
els.focusNextBtn.addEventListener('click', nextNow);
els.stopBtn.addEventListener('click', stopSession);
els.focusBtn.addEventListener('click', enterFocus);
els.exitFocusBtn.addEventListener('click', exitFocus);
els.focusHandle.addEventListener('click', () => els.focusDock.classList.toggle('hidden'));
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && state.focus) {
    state.focus = false;
    document.body.classList.remove('focus-mode');
    els.focusHandle.classList.add('hidden');
    els.focusDock.classList.add('hidden');
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
