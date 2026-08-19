const $ = (sel) => document.querySelector(sel);

const WORDS = [
  'pressure','concrete','vision','hustle','shadow','machine','freedom','city','danger','money',
  'rhythm','family','power','corner','future','battle','mirror','night','street','fire','silence',
  'broken','gold','motion','truth','memory','system','summer','winter','focus','energy','legacy',
  'gravity','respect','change','dream','signal','champion','storm','heart','time','loyalty','noise',
  'diamond','reason','moment','control','culture','vintage','hunger','midnight','victory','story',
  'game','flame','kingdom','damage','honor','grind','soul'
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
    view: 'a',
    unseen: { a: false, b: false }
  },
  recording: {
    mediaRecorder: null,
    stream: null,
    chunks: [],
    startedAt: 0,
    clockId: null,
    rawUrl: '',
    polishedUrl: '',
    processing: false
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
  dualSwapBtn: $('#dualSwapBtn'),
  dualSwapStatus: $('#dualSwapStatus'),
  dualSwapWord: $('#dualSwapWord'),
  dualSwapTimer: $('#dualSwapTimer'),
  holdBtn: $('#holdBtn'), nextBtn: $('#nextBtn'), stopBtn: $('#stopBtn'),
  focusHandle: $('#focusHandle'), focusDock: $('#focusDock'),
  focusHoldBtn: $('#focusHoldBtn'), focusNextBtn: $('#focusNextBtn'), exitFocusBtn: $('#exitFocusBtn'),
  recordBtn: $('#recordBtn'), recordBtnLabel: $('#recordBtnLabel'), recordClock: $('#recordClock'),
  recordingTray: $('#recordingTray'), recordingStatus: $('#recordingStatus'), recordingDuration: $('#recordingDuration'),
  processingNote: $('#processingNote'), recordingPlayers: $('#recordingPlayers'),
  rawPlayer: $('#rawPlayer'), polishedPlayer: $('#polishedPlayer'), savePolished: $('#savePolished')
};

function formatTime(total) {
  const safe = Math.max(0, Number(total) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function randomWord(exclude = []) {
  const blocked = new Set(exclude.filter(Boolean).map(w => w.toLowerCase()));
  const pool = WORDS.filter(w => !blocked.has(w.toLowerCase()));
  return pool[Math.floor(Math.random() * pool.length)] || WORDS[0];
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
  els.dualSwapBtn.classList.add('hidden');

  if (mode === 'search') els.primaryBtn.textContent = 'RUN WORD';
  if (mode === 'random') els.primaryBtn.textContent = 'THROW A WORD';
  if (mode === 'cypher') els.primaryBtn.textContent = 'START CYPHER';
  if (mode === 'dual') {
    els.primaryBtn.textContent = 'START DUAL CYPHER';
    setViewedLane('a');
  }

  resetStageCopy();
}

function resetStageCopy() {
  if (state.mode !== 'dual') {
    els.singleTimer.textContent = state.mode === 'cypher' ? formatTime(state.seconds) : '—';
    els.singleBreakdown.textContent = 'READY';
  } else {
    els.timerA.textContent = formatTime(state.seconds);
    els.timerB.textContent = '+00:15';
    updateDualSwap();
  }
}

async function getRhymes(word) {
  const encoded = encodeURIComponent(word);
  const perfectUrl = `https://api.datamuse.com/words?rel_rhy=${encoded}&md=sp&max=1000`;
  const nearUrl = `https://api.datamuse.com/words?rel_nry=${encoded}&md=sp&max=1000`;
  const perfectPromise = state.rhymeType === 'near'
    ? Promise.resolve([])
    : fetch(perfectUrl).then(r => r.ok ? r.json() : Promise.reject(r.status));
  const nearPromise = state.rhymeType === 'perfect'
    ? Promise.resolve([])
    : fetch(nearUrl).then(r => r.ok ? r.json() : Promise.reject(r.status));
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

function laneEls(which) {
  return which === 'a'
    ? { word: els.wordA, count: els.countA, bank: els.bankA, card: els.laneA }
    : { word: els.wordB, count: els.countB, bank: els.bankB, card: els.laneB };
}

function markLaneUpdated(which) {
  if (state.dual.view !== which) state.dual.unseen[which] = true;
  updateDualSwap();
}

async function loadLane(which, word) {
  const lane = state.dual[which];
  const clean = word.trim().toLowerCase();
  lane.word = clean;
  const req = ++lane.request;
  const view = laneEls(which);

  view.word.textContent = clean;
  view.card.classList.remove('waiting');
  view.bank.innerHTML = '<div class="empty-copy">Loading rhyme bank…</div>';
  markLaneUpdated(which);

  try {
    const { perfect, near } = await getRhymes(clean);
    if (req !== lane.request) return;
    const total = perfect.length + near.length;
    view.count.textContent = `${total} WORD${total === 1 ? '' : 'S'}`;
    view.bank.innerHTML = total ? bankMarkup(perfect, near) : '<div class="empty-copy">No rhymes found. Rotate the lane.</div>';
    wireCopy(view.bank);
    els.focusBtn.disabled = false;
    els.nextBtn.disabled = false;
    updateDualSwap();
  } catch {
    if (req !== lane.request) return;
    view.count.textContent = '0 WORDS';
    view.bank.innerHTML = '<div class="empty-copy">Connection miss. This lane will retry on the next word.</div>';
    updateDualSwap();
  }
}

function setViewedLane(which) {
  if (which === 'b' && !state.dual.bStarted) return;
  state.dual.view = which;
  state.dual.unseen[which] = false;
  els.laneA.classList.toggle('view-lane', which === 'a');
  els.laneB.classList.toggle('view-lane', which === 'b');
  els.laneA.classList.toggle('offscreen-lane', which !== 'a');
  els.laneB.classList.toggle('offscreen-lane', which !== 'b');
  els.laneA.classList.toggle('active-lane', which === 'a');
  els.laneB.classList.toggle('active-lane', which === 'b');
  updateDualSwap();
}

function updateDualSwap() {
  if (state.mode !== 'dual' || !state.running) {
    els.dualSwapBtn.classList.add('hidden');
    return;
  }

  const other = state.dual.view === 'a' ? 'b' : 'a';
  const lane = state.dual[other];
  const waitingForB = other === 'b' && !state.dual.bStarted;

  els.dualSwapBtn.classList.remove('hidden');
  els.dualSwapBtn.disabled = waitingForB;
  els.dualSwapBtn.dataset.target = other;
  els.dualSwapBtn.classList.toggle('has-new', !waitingForB && state.dual.unseen[other]);

  if (waitingForB) {
    els.dualSwapStatus.textContent = 'ENTERS IN';
    els.dualSwapWord.textContent = 'LANE B';
    els.dualSwapTimer.textContent = `+${formatTime(state.dual.offsetRemaining)}`;
    return;
  }

  els.dualSwapStatus.textContent = state.dual.unseen[other] ? 'NEW BANK' : 'OTHER BANK';
  els.dualSwapWord.textContent = lane.word || (other === 'a' ? 'LANE A' : 'LANE B');
  els.dualSwapTimer.textContent = formatTime(lane.remaining);
}

function switchDualBank() {
  if (state.mode !== 'dual' || !state.running) return;
  const target = state.dual.view === 'a' ? 'b' : 'a';
  if (target === 'b' && !state.dual.bStarted) return;
  setViewedLane(target);
  els.focusDock.classList.add('hidden');
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
  state.dual.unseen = { a: false, b: false };

  els.wordB.textContent = 'STANDBY';
  els.countB.textContent = '0 WORDS';
  els.bankB.innerHTML = '<div class="empty-copy">Lane B enters 15 seconds after Lane A.</div>';
  els.laneB.classList.add('waiting');

  state.dual.view = 'a';
  els.laneA.classList.add('view-lane', 'active-lane');
  els.laneA.classList.remove('offscreen-lane');
  els.laneB.classList.remove('view-lane', 'active-lane');
  els.laneB.classList.add('offscreen-lane');

  loadLane('a', randomWord([state.dual.a.word, state.dual.b.word]));
  updateDualTimers();
  updateControls();
  updateDualSwap();
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
    updateDualSwap();
  }, 1000);
}

function updateSingleTimer() {
  els.singleTimer.textContent = formatTime(state.single.remaining);
}

function updateDualTimers() {
  els.timerA.textContent = formatTime(state.dual.a.remaining);
  els.timerB.textContent = state.dual.bStarted
    ? formatTime(state.dual.b.remaining)
    : `+${formatTime(state.dual.offsetRemaining)}`;
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
  state.dual.unseen = { a: false, b: false };
  els.dualSwapBtn.classList.add('hidden');
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
    const which = state.dual.view;
    state.dual[which].remaining = state.seconds;
    loadLane(which, randomWord([state.dual.a.word, state.dual.b.word]));
    updateDualTimers();
    updateDualSwap();
  }
}

function primaryAction() {
  if (state.mode === 'search') {
    loadSingle(els.seedInput.value.trim() || randomWord([state.single.word]));
  } else if (state.mode === 'random') {
    loadSingle(randomWord([state.single.word]));
  } else if (state.mode === 'cypher') {
    startSingleCypher();
    enterFocus();
  } else {
    startDual();
    enterFocus();
  }
}

async function enterFocus() {
  if (els.focusBtn.disabled && !state.running) return;
  state.focus = true;
  document.body.classList.add('focus-mode');
  els.focusHandle.classList.remove('hidden');
  els.recordBtn.classList.remove('hidden');
  els.focusDock.classList.add('hidden');
  if (state.mode === 'dual') updateDualSwap();

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
  els.recordBtn.classList.add('hidden');
  els.focusDock.classList.add('hidden');

  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  } catch (_) {}
}



function revokeRecordingUrls() {
  if (state.recording.rawUrl) URL.revokeObjectURL(state.recording.rawUrl);
  if (state.recording.polishedUrl) URL.revokeObjectURL(state.recording.polishedUrl);
  state.recording.rawUrl = '';
  state.recording.polishedUrl = '';
}

function updateRecordClock() {
  if (!state.recording.startedAt) {
    els.recordClock.textContent = '00:00';
    return;
  }
  const seconds = Math.floor((Date.now() - state.recording.startedAt) / 1000);
  els.recordClock.textContent = formatTime(seconds);
  els.recordingDuration.textContent = formatTime(seconds);
}

function setRecordingUi(mode, text = '') {
  const recording = mode === 'recording';
  const processing = mode === 'processing';
  els.recordBtn.classList.toggle('is-recording', recording);
  els.recordBtn.classList.toggle('is-processing', processing);
  document.body.classList.toggle('recording-active', recording);
  els.recordBtnLabel.textContent = recording ? 'STOP' : processing ? 'POLISH' : 'REC';
  if (text) els.recordingStatus.textContent = text;
}

async function toggleRecording() {
  if (state.recording.processing) return;
  if (state.recording.mediaRecorder?.state === 'recording') {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    els.recordingTray.classList.remove('hidden');
    els.recordingStatus.textContent = 'MIC NOT SUPPORTED';
    els.processingNote.textContent = 'This browser cannot record microphone audio here.';
    return;
  }

  try {
    revokeRecordingUrls();
    els.recordingPlayers.classList.add('hidden');
    els.recordingTray.classList.remove('hidden');
    els.processingNote.textContent = 'Recording raw vocal. When you stop, the take is processed automatically.';
    els.recordingStatus.textContent = 'REQUESTING MIC';

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      }
    });

    const preferred = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4'
    ].find(type => MediaRecorder.isTypeSupported?.(type));

    const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
    state.recording.stream = stream;
    state.recording.mediaRecorder = recorder;
    state.recording.chunks = [];

    recorder.addEventListener('dataavailable', event => {
      if (event.data?.size) state.recording.chunks.push(event.data);
    });
    recorder.addEventListener('stop', finishRecording, { once: true });

    recorder.start(250);
    state.recording.startedAt = Date.now();
    clearInterval(state.recording.clockId);
    state.recording.clockId = setInterval(updateRecordClock, 250);
    updateRecordClock();
    setRecordingUi('recording', 'RECORDING');
  } catch (error) {
    els.recordingTray.classList.remove('hidden');
    els.recordingStatus.textContent = 'MIC BLOCKED';
    els.processingNote.textContent = 'Microphone permission was not granted. Allow mic access and hit REC again.';
    setRecordingUi('idle');
  }
}

function stopRecording() {
  const recorder = state.recording.mediaRecorder;
  if (!recorder || recorder.state !== 'recording') return;
  recorder.stop();
  clearInterval(state.recording.clockId);
  state.recording.clockId = null;
  updateRecordClock();
  setRecordingUi('processing', 'PROCESSING VOCAL');
  state.recording.processing = true;
}

async function finishRecording() {
  const recorder = state.recording.mediaRecorder;
  const mime = recorder?.mimeType || 'audio/webm';
  const rawBlob = new Blob(state.recording.chunks, { type: mime });

  state.recording.stream?.getTracks().forEach(track => track.stop());
  state.recording.stream = null;
  state.recording.mediaRecorder = null;

  state.recording.rawUrl = URL.createObjectURL(rawBlob);
  els.rawPlayer.src = state.recording.rawUrl;
  els.recordingPlayers.classList.add('hidden');
  els.processingNote.textContent = 'Analyzing the full take: cleanup → tonal pitch guard → EQ → compression → level.';

  try {
    const polishedBlob = await polishVocal(rawBlob);
    state.recording.polishedUrl = URL.createObjectURL(polishedBlob);
    els.polishedPlayer.src = state.recording.polishedUrl;
    els.savePolished.href = state.recording.polishedUrl;
    els.recordingPlayers.classList.remove('hidden');
    els.recordingStatus.textContent = 'POLISHED';
    els.processingNote.textContent = 'RAW is untouched. POLISHED is the automatic vocal pass. Stable sung notes receive gentle pitch correction; speech/rap is left natural.';
  } catch (error) {
    console.error(error);
    els.recordingPlayers.classList.remove('hidden');
    els.polishedPlayer.removeAttribute('src');
    els.savePolished.removeAttribute('href');
    els.recordingStatus.textContent = 'RAW SAVED';
    els.processingNote.textContent = 'The take recorded, but this browser could not finish the polish pass. Your raw vocal is still playable.';
  } finally {
    state.recording.processing = false;
    state.recording.startedAt = 0;
    els.recordClock.textContent = '00:00';
    setRecordingUi('idle');
  }
}

async function polishVocal(blob) {
  const bytes = await blob.arrayBuffer();
  const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await decodeCtx.decodeAudioData(bytes.slice(0));
  await decodeCtx.close().catch(() => {});

  const sampleRate = decoded.sampleRate;
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const src = decoded.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += src[i] / decoded.numberOfChannels;
  }

  const pitched = gentlePitchPolish(mono, sampleRate);
  const inputBuffer = new AudioBuffer({ length: pitched.length, numberOfChannels: 1, sampleRate });
  inputBuffer.copyToChannel(pitched, 0);

  const offline = new OfflineAudioContext(1, inputBuffer.length, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = inputBuffer;

  const highpass = offline.createBiquadFilter();
  highpass.type = 'highpass'; highpass.frequency.value = 78; highpass.Q.value = .7;

  const mudCut = offline.createBiquadFilter();
  mudCut.type = 'peaking'; mudCut.frequency.value = 230; mudCut.Q.value = .9; mudCut.gain.value = -2.2;

  const presence = offline.createBiquadFilter();
  presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = .8; presence.gain.value = 2.1;

  const air = offline.createBiquadFilter();
  air.type = 'highshelf'; air.frequency.value = 8500; air.gain.value = 1.25;

  const compressor = offline.createDynamicsCompressor();
  compressor.threshold.value = -22;
  compressor.knee.value = 18;
  compressor.ratio.value = 3.6;
  compressor.attack.value = .006;
  compressor.release.value = .14;

  source.connect(highpass).connect(mudCut).connect(presence).connect(air).connect(compressor).connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  const out = new Float32Array(rendered.length);
  out.set(rendered.getChannelData(0));
  normalizeAndSoftLimit(out, .94);
  return encodeWav(out, sampleRate);
}

function normalizeAndSoftLimit(samples, targetPeak = .94) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = peak > 1e-5 ? Math.min(3.2, targetPeak / peak) : 1;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] * gain;
    samples[i] = Math.tanh(x * 1.08) / Math.tanh(1.08) * targetPeak;
  }
}

function gentlePitchPolish(input, sampleRate) {
  // Conservative granular pitch guard. It only acts on stable, tonal frames.
  // Pitch is analyzed at a slower cadence to keep post-processing practical on phones.
  const grain = sampleRate >= 44000 ? 2048 : 1024;
  const hop = Math.floor(grain / 4);
  const analysisSize = grain * 2;
  const pitchHop = grain * 2;
  const output = new Float32Array(input.length);
  const weight = new Float32Array(input.length);
  const pitchTrack = [];

  for (let center = 0; center < input.length; center += pitchHop) {
    pitchTrack.push(detectPitch(input, center, analysisSize, sampleRate));
  }

  let smoothCents = 0;
  for (let outStart = 0; outStart < input.length; outStart += hop) {
    const trackIndex = Math.min(pitchTrack.length - 1, Math.max(0, Math.round(outStart / pitchHop)));
    const current = pitchTrack[trackIndex];
    const prev = pitchTrack[trackIndex - 1];
    const next = pitchTrack[trackIndex + 1];
    let cents = 0;

    if (current && prev && next && current.confidence > .72 && prev.confidence > .66 && next.confidence > .66) {
      const spread = Math.max(
        centsBetween(current.hz, prev.hz),
        centsBetween(current.hz, next.hz),
        centsBetween(prev.hz, next.hz)
      );
      if (spread < 95 && current.rms > .012) {
        const midi = 69 + 12 * Math.log2(current.hz / 440);
        cents = (Math.round(midi) - midi) * 100;
        cents = Math.max(-62, Math.min(62, cents));
      }
    }

    smoothCents = smoothCents * .78 + cents * .22;
    const rate = Math.pow(2, smoothCents / 1200);
    const half = grain / 2;

    for (let i = 0; i < grain; i++) {
      const dst = outStart + i;
      if (dst >= input.length) break;
      const centered = i - half;
      const srcPos = outStart + half + centered * rate;
      const sample = linearSample(input, srcPos);
      const win = .5 - .5 * Math.cos((2 * Math.PI * i) / (grain - 1));
      output[dst] += sample * win;
      weight[dst] += win;
    }
  }

  for (let i = 0; i < output.length; i++) {
    output[i] = weight[i] > .0001 ? output[i] / weight[i] : input[i];
  }
  return output;
}

function centsBetween(a, b) {
  return Math.abs(1200 * Math.log2(a / b));
}

function linearSample(samples, position) {
  if (position <= 0) return samples[0] || 0;
  if (position >= samples.length - 1) return samples[samples.length - 1] || 0;
  const i = Math.floor(position);
  const f = position - i;
  return samples[i] * (1 - f) + samples[i + 1] * f;
}

function detectPitch(samples, center, size, sampleRate) {
  const start = Math.max(0, Math.floor(center - size / 2));
  const end = Math.min(samples.length, start + size);
  if (end - start < size * .7) return null;

  let mean = 0, rms = 0;
  for (let i = start; i < end; i += 2) mean += samples[i];
  mean /= Math.ceil((end - start) / 2);
  for (let i = start; i < end; i += 2) {
    const v = samples[i] - mean;
    rms += v * v;
  }
  rms = Math.sqrt(rms / Math.ceil((end - start) / 2));
  if (rms < .008) return null;

  const minLag = Math.floor(sampleRate / 520);
  const maxLag = Math.min(Math.floor(sampleRate / 78), Math.floor((end - start) / 2));
  let coarseLag = 0, coarseBest = 0;

  // Coarse scan: fewer lag candidates and fewer samples.
  for (let lag = minLag; lag <= maxLag; lag += 3) {
    let corr = 0, a2 = 0, b2 = 0;
    const limit = end - lag;
    for (let i = start; i < limit; i += 8) {
      const a = samples[i] - mean;
      const b = samples[i + lag] - mean;
      corr += a * b; a2 += a * a; b2 += b * b;
    }
    const norm = corr / Math.sqrt((a2 * b2) + 1e-12);
    if (norm > coarseBest) { coarseBest = norm; coarseLag = lag; }
  }

  if (!coarseLag || coarseBest < .48) return null;

  // Refine only around the coarse winner.
  let bestLag = coarseLag, best = coarseBest;
  const refineStart = Math.max(minLag, coarseLag - 4);
  const refineEnd = Math.min(maxLag, coarseLag + 4);
  for (let lag = refineStart; lag <= refineEnd; lag++) {
    let corr = 0, a2 = 0, b2 = 0;
    const limit = end - lag;
    for (let i = start; i < limit; i += 2) {
      const a = samples[i] - mean;
      const b = samples[i + lag] - mean;
      corr += a * b; a2 += a * a; b2 += b * b;
    }
    const norm = corr / Math.sqrt((a2 * b2) + 1e-12);
    if (norm > best) { best = norm; bestLag = lag; }
  }

  if (best < .55) return null;
  return { hz: sampleRate / bestLag, confidence: best, rms };
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: 'audio/wav' });
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
  } else if (state.single.word) {
    loadSingle(state.single.word);
  }
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
els.dualSwapBtn.addEventListener('click', switchDualBank);
els.recordBtn.addEventListener('click', toggleRecording);

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && state.focus) {
    state.focus = false;
    document.body.classList.remove('focus-mode');
    els.focusHandle.classList.add('hidden');
    els.recordBtn.classList.add('hidden');
    els.focusDock.classList.add('hidden');
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
