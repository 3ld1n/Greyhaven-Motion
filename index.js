const stCtx = SillyTavern.getContext();
const {
  eventSource,
  saveSettingsDebounced,
  setExtensionPrompt,
  extensionSettings: extension_settings,
  eventTypes: event_types,
} = stCtx;
const getContext = () => SillyTavern.getContext();

import { createSim, CENTERLINES } from './simFacade.js';
import { SKIN_TONES, herTone, himTone } from './skins.js';
import { buildSummary } from './summary.js';
import { createMissionaryRenderer } from './renderMissionary.js';
import { createEventManager, DEFAULT_RISKS, DEFAULT_RANGES, formatEventSummary } from './eventManager.js';
import { createPromptReplay } from './promptReplay.js';

const MODULE = 'greyhaven_motion';
const extension_prompt_types = { NONE: -1, IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
const extension_prompt_roles = { SYSTEM: 0, USER: 1, ASSISTANT: 2 };

const DEFAULT_ACTION_PREAMBLE =
  'Greyhaven Motion hidden action context. Treat this as private physical context for the next reply only. ' +
  'Do not quote it, do not mention metadata, and do not list numbers unless the character would naturally react to them.';

const LEGACY_STYLE_GUIDE =
  'Respond naturally as {{receiver}}. Use the hidden action context to shape the reaction, pacing, comfort, enthusiasm, hesitation, and satisfaction. ' +
  'Do not repeat the summary verbatim.';
const DEFAULT_STYLE_GUIDE =
  'Respond naturally as {{receiver}} according to their established personality, boundaries, and the scene. ' +
  'The motion log describes events, not how they must feel. Do not repeat the summary verbatim.';

const defaultSettings = {
  receiverName: '',
  giverName: '',
  xrayMode: true,
  protection: false,
  virginMode: false,
  penisCm: 15.0,
  maxDepthPct: 150,
  tightness: 1.0,
  canalTightness: 1.0,
  canalLength: 1.0,
  // User-configurable scene control limits. Defaults match v0.1.12.
  sizeMinCm: 8, sizeMaxCm: 30,
  depthMinPct: 100, depthMaxPct: 150,
  tightnessMin: 0.5, tightnessMax: 2,
  canalTightnessMin: 0.5, canalTightnessMax: 3,
  canalLengthMin: 0.7, canalLengthMax: 1.2,
  skinHer: 'anime',
  skinHim: 'anime',
  previewOpen: false,
  actionPreamble: DEFAULT_ACTION_PREAMBLE,
  styleGuide: DEFAULT_STYLE_GUIDE,
  activeTab: 'actions',
  eventRisks: { ...DEFAULT_RISKS },
  eventRanges: { ...DEFAULT_RANGES },
};

// Keep UI limits within the bounds already supported by the existing simulation.
// These are not changes to the engine itself.
const SCENE_LIMIT_SPECS = [
  { label: 'Size', unit: 'cm', value: 'penisCm', input: '#ghmotion_size', min: 'sizeMinCm', max: 'sizeMaxCm', hardMin: 2, hardMax: 35, step: 0.1, fallback: 15, rebuild: true },
  { label: 'Depth', unit: '%', value: 'maxDepthPct', input: '#ghmotion_depth', min: 'depthMinPct', max: 'depthMaxPct', hardMin: 100, hardMax: 150, step: 1, fallback: 150, rebuild: true },
  { label: 'Tightness', unit: '×', value: 'tightness', input: '#ghmotion_tight', min: 'tightnessMin', max: 'tightnessMax', hardMin: 0.5, hardMax: 2, step: 0.1, fallback: 1, option: 'tightness' },
  { label: 'Canal tightness', unit: '×', value: 'canalTightness', input: '#ghmotion_canal', min: 'canalTightnessMin', max: 'canalTightnessMax', hardMin: 0.5, hardMax: 3, step: 0.1, fallback: 1, option: 'canalTightness' },
  { label: 'Length multiplier', unit: '×', value: 'canalLength', input: '#ghmotion_len', min: 'canalLengthMin', max: 'canalLengthMax', hardMin: 0.7, hardMax: 1.2, step: 0.05, fallback: 1, rebuild: true },
];
function finiteNumber(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clipNumber(value, min, max, fallback) {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}
function normalizeSceneLimits(s) {
  for (const spec of SCENE_LIMIT_SPECS) {
    const min = clipNumber(s[spec.min], spec.hardMin, spec.hardMax, defaultSettings[spec.min]);
    const max = clipNumber(s[spec.max], min, spec.hardMax, defaultSettings[spec.max]);
    s[spec.min] = min;
    s[spec.max] = max;
    s[spec.value] = clipNumber(s[spec.value], min, max, spec.fallback);
  }
}
function settings() {
  if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
  const s = extension_settings[MODULE];
  for (const k of Object.keys(defaultSettings)) {
    if (!(k in s)) s[k] = defaultSettings[k];
  }
  // Upgrade only the original built-in style guide, never a user's custom text.
  if (s.styleGuide === LEGACY_STYLE_GUIDE) s.styleGuide = DEFAULT_STYLE_GUIDE;
  normalizeSceneLimits(s);
  if (!s.eventRisks || typeof s.eventRisks !== 'object') s.eventRisks = { ...DEFAULT_RISKS };
  for (const [key,val] of Object.entries(DEFAULT_RISKS)) {
    const n = Number(s.eventRisks[key]);
    s.eventRisks[key] = Number.isFinite(n) ? Math.max(0,Math.min(100,n)) : val;
  }
  if (!s.eventRanges || typeof s.eventRanges !== 'object') s.eventRanges = { ...DEFAULT_RANGES };
  for (const [key,val] of Object.entries(DEFAULT_RANGES)) {
    const n=Number(s.eventRanges[key]);
    s.eventRanges[key] = Number.isFinite(n) ? Math.max(key.startsWith('preFluid') ? 1 : 0, Math.min(1000, Math.floor(n))) : val;
  }
  for (const prefix of ['motion','release','preFluid']) {
    const lo = `${prefix}MinStrokes`, hi = `${prefix}MaxStrokes`;
    if (s.eventRanges[lo]>s.eventRanges[hi]) s.eventRanges[hi]=s.eventRanges[lo];
  }
  return s;
}

const session = {
  active: false,
  startT: 0,
  lastActivityT: 0,
  strokes: [],
  outStrokes: [],
  deepHits: 0,
  ballSlaps: 0,
  fullWithdrawals: 0,
  pauses: [],
  pauseStart: null,
  endedInside: false,
  lastDepth: 0,
  cumVag: 0,
  cumWomb: 0,
  cumProtected: 0,
  cervixPierced: false,
  cervixBreached: false,
  wombBreached: false,
  firstEntry: null,
  sceneAlreadyContacted: false,
  entryPopStrain: null,
  entryAttempts: 0,
  hymenBreak: null,
  hymenStretches: 0,
  cervixStretches: 0,
  wombStretches: 0,
  frontierStart: null,
};

function resetSession() {
  session.active = false;
  session.startT = 0;
  session.lastActivityT = 0;
  session.strokes = [];
  session.outStrokes = [];
  session.deepHits = 0;
  session.ballSlaps = 0;
  session.fullWithdrawals = 0;
  session.pauses = [];
  session.pauseStart = null;
  session.endedInside = false;
  session.lastDepth = 0;
  session.cumVag = 0;
  session.cumWomb = 0;
  session.cumProtected = 0;
  session.cervixPierced = false;
  session.cervixBreached = false;
  session.wombBreached = false;
  session.firstEntry = null;
  session.sceneAlreadyContacted = false;
  session.entryPopStrain = null;
  session.entryAttempts = 0;
  session.hymenBreak = null;
  session.hymenStretches = 0;
  session.cervixStretches = 0;
  session.wombStretches = 0;
  session.frontierStart = null;
  if (sim) {
    sim.state.hymenOver = 0;
    sim.state.cervixOver = 0;
    sim.state.wombOver = 0;
  }
}

function touchSession() {
  const now = performance.now() / 1000;
  if (!session.active) {
    resetSession();
    session.active = true;
    session.startT = now;
    session.frontierStart = sim ? sim.state.maxReach : 0;
    session.sceneAlreadyContacted = !!(sim && sim.state.maxReach > 0.5);
  }
  session.lastActivityT = now;
}

function cmToInches(cm) {
  return cm / 2.54;
}

function composeSummaryCore() {
  const s = settings();
  return buildSummary(session, sim?.state ?? null, {
    receiverName: s.receiverName,
    bloodEnabled: true,
    view: 'pov',
    actionPreamble: s.actionPreamble,
    defaultPreamble: DEFAULT_ACTION_PREAMBLE,
    // Broken protection uses the same unprotected physics as the display.
    protection: sceneEvents.status().protection === 'intact',
    virginMode: s.virginMode,
  });
}

function buildHiddenContext() {
  const s = settings();
  const who = (s.receiverName || '').trim() || '{{char}}';
  const giver = (s.giverName || '').trim() || '{{user}}';
  let summary = composeSummaryCore().trim();
  if (summary.startsWith('[') && summary.endsWith(']')) {
    summary = summary.slice(1, -1);
  }
  // Only show story-relevant fields. Render mode and physics parameters are internal.
  // Always include position: future animations will use this to communicate a switch.
  const metaParts = [
    'position: missionary',
    `protection: ${sceneEvents.status().protection}`,
    `cock size: ${Number(s.penisCm).toFixed(1)} cm`,
  ];
  if (s.virginMode) {
    const barrierBroken = !!sim?.state?.hymen?.broken;
    // The virginity story flag belongs to the receiver only.
    // 'Simulated barrier' is tracked separately, and its change is described once
    // by the event phrase for the sequence where it happens.
    metaParts.push(barrierBroken
      ? `${who} was a virgin at the start of this scene; simulated barrier: broken`
      : `${who} is a virgin; simulated barrier: intact`);
  }
  const meta = metaParts.join('; ');
  const guide = (s.styleGuide || DEFAULT_STYLE_GUIDE).replaceAll('{{receiver}}', who).replaceAll('{{giver}}', giver);
  const mechanics = formatEventSummary(sceneEvents.pending(), sceneEvents.status());
  const text = `*${meta}; ${summary}${mechanics ? '; ' + mechanics : ''}; ${guide}*`;
  // Respect an explicitly set giver name in *all* clauses, not only the guide.
  return String(s.giverName || '').trim() ? text.replaceAll('{{user}}', giver) : text;
}

// Identify the current user turn. Only a swipe/regeneration of this SAME turn
// may inherit its previous hidden prompt. Switching chats or sending a new user
// message invalidates replay to prevent context leaking across conversations.
function currentTurnAnchor() {
  const ctx=getContext();
  const chat=Array.isArray(ctx.chat) ? ctx.chat : [];
  let i=chat.length-1;
  while(i>=0 && !chat[i]?.is_user) i--;
  if(i<0) return null;
  const msg=chat[i];
  const chatKey=String(ctx.chatId ?? ctx.chat_id ?? ctx.chatFile ?? ctx.chat_file_name ?? 'current');
  return JSON.stringify([chatKey,i,String(msg.send_date ?? ''),String(msg.mes ?? '')]);
}
const promptReplay = createPromptReplay();
let replayAttempt = false;
let injectionStaged = false;
let stagedText = '';
let recordMode = false;
let panelOpen = false;
let sim = null, renderer = null, rafId = null;
let liveStats = { depth: 0 };
let pendingSnap = null;
const sceneEvents = createEventManager({options:{...settings().eventRisks, ...settings().eventRanges}, protectedInitially:settings().protection});
function syncProtectionPresentation() {
  const condition = sceneEvents.status().protection;
  if (condition === 'broken') {
    // One-time conversion; subsequent updates may run every stroke safely.
    sim?.ruptureProtection?.();
  } else {
    sim?.setOptions?.({protection: condition === 'intact'});
  }
  renderer?.setProtection?.(condition !== 'off', condition === 'broken');
}
function applySceneEventVisual(e) {
  if (!e) return;
  if (e.type === 'pre-fluid') sim?.registerPreFluid?.(e.atDepth, e.reachedDepth);
  if (e.type === 'pre-fluid-depth-changed') sim?.advancePreFluid?.(e.atDepth);
}
function refreshEventStatus() {
  const el=document.getElementById('ghmotion_event_status');
  if (!el) return;
  const st=sceneEvents.status();
  el.textContent = `Protection: ${st.protection} · Fluid event: ${st.preFluid}`;
  el.classList.toggle('ghmotion-event-alert', st.protection==='broken'||st.preFluid==='occurred');
  const btn=document.getElementById('ghmotion_break_protection');
  if(btn) btn.disabled=st.protection!=='intact';
}

function stagePrompt(text) {
  const payload = (text || '').trim();
  stagedText = payload;
  const preview = document.getElementById('ghmotion_summary');
  if (preview && preview.value !== payload) preview.value = payload;
  setExtensionPrompt(MODULE, payload, extension_prompt_types.IN_CHAT, 1, false, extension_prompt_roles.SYSTEM);
  injectionStaged = !!payload;
  updateStatus();
}

function clearStagedPrompt() {
  stagedText = '';
  const preview = document.getElementById('ghmotion_summary');
  if (preview) preview.value = '';
  setExtensionPrompt(MODULE, '', extension_prompt_types.IN_CHAT, 0, false, extension_prompt_roles.SYSTEM);
  injectionStaged = false;
  updateStatus();
}

// Reapply only when SillyTavern is generating an alternative for the same
// user message. GENERATION_AFTER_COMMANDS is early enough to influence prompt
// assembly; GENERATION_STARTED is a second, idempotent safeguard.
function restorePromptForAlternative(type) {
  if (injectionStaged) return;
  const cached=promptReplay.restore(type,currentTurnAnchor());
  if(!cached) return;
  replayAttempt=true;
  stagePrompt(cached);
}
if (event_types.GENERATION_AFTER_COMMANDS) {
  eventSource.on(event_types.GENERATION_AFTER_COMMANDS,restorePromptForAlternative);
}
if (event_types.GENERATION_STARTED) {
  eventSource.on(event_types.GENERATION_STARTED,restorePromptForAlternative);
}
if (event_types.MESSAGE_SENT) {
  eventSource.on(event_types.MESSAGE_SENT,()=>{
    // A new actual user message ends the old reply's replay window.
    promptReplay.newUserTurn();
    replayAttempt=false;
  });
}
if (event_types.MESSAGE_DELETED) {
  eventSource.on(event_types.MESSAGE_DELETED,()=>promptReplay.deleted());
}
if (event_types.CHAT_CHANGED) {
  eventSource.on(event_types.CHAT_CHANGED,()=>{
    promptReplay.changeChat();
    replayAttempt=false;
    clearStagedPrompt();
  });
}
eventSource.on(event_types.GENERATION_ENDED, () => {
  if (!injectionStaged) return;
  if (!replayAttempt) sceneEvents.markReported();
  promptReplay.remember(stagedText,currentTurnAnchor());
  clearStagedPrompt();
  replayAttempt=false;
});

function stopAndStageRecording() {
  // Flush any still-in-progress stationary hold before constructing the summary.
  if (session.pauseStart !== null) {
    const now = performance.now() / 1000;
    const len = now - session.pauseStart;
    if (len >= 2) session.pauses.push({ sec: len, atSec: Math.max(0, session.pauseStart - session.startT) });
    session.pauseStart = null;
    session.lastActivityT = Math.max(session.lastActivityT, now);
  }
  // A new, explicitly recorded event replaces the prior turn's swipe replay.
  promptReplay.newUserTurn();
  replayAttempt=false;
  const ctx = getContext();
  let text = buildHiddenContext();
  text = ctx.substituteParams ? ctx.substituteParams(text) : text;
  stagePrompt(text);
  resetSession();
  updateStatus();
  toastr.success('Hidden action summary staged for your next send.', 'Greyhaven Motion');
}

function toggleRecord() {
  recordMode = !recordMode;
  const btn = $('#ghmotion_record');
  btn.toggleClass('ghmotion-on', recordMode);
  btn.text(recordMode ? 'Stop' : 'Record');
  if (recordMode) {
    resetSession();
    session.active = true;
    const now = performance.now() / 1000;
    session.startT = now;
    session.lastActivityT = now;
    session.frontierStart = sim ? sim.state.maxReach : 0;
    session.sceneAlreadyContacted = !!(sim && sim.state.maxReach > 0.5);
    toastr.info('Recording motion. Stop when you want to stage the hidden summary.', 'Greyhaven Motion');
  } else {
    stopAndStageRecording();
  }
  updateStatus();
}

function updateStatus() {
  const el = document.getElementById('ghmotion_status');
  if (!el) return;
  const rec = recordMode ? 'REC · ' : '';
  const staged = injectionStaged ? ' · staged ✓' : '';
  const womb = (sim?.state?.pierce && liveStats.depth > 1.03) ? ' · womb' : '';
  el.textContent = `${rec}depth ${Math.round(Math.min(1.5, liveStats.depth) * 100)}%${womb} · strokes ${session.strokes.length}${staged}`;
  refreshEventStatus();
}

function captureScene(fromSim) {
  if (!fromSim) return null;
  const st = fromSim.state;
  return {
    cum: {
      vag: st.cum.vag, womb: st.cum.womb, leak: st.cum.leak,
      spurting: st.cum.spurting, spawnAcc: st.cum.spawnAcc,
      particles: (st.cum.particles || []).map(p => ({...p})),
      vagCount: st.cum.vagCount, wombCount: st.cum.wombCount,
      condom: st.cum.condom, condomCount: st.cum.condomCount,
      preFluid: st.cum.preFluid ? {...st.cum.preFluid} : null,
    },
    pierce: st.pierce,
    wombBroken: st.wombBroken,
    cervixHits: st.cervixHits,
    reachFrac: st.maxReach / st.MAX_NORMAL,
    loose: st.loose,
    entrancePopped: st.entrancePopped,
    hymenBroken: st.hymen.broken,
    hymenOver: st.hymenOver,
    cervixOver: st.cervixOver,
    wombOver: st.wombOver,
    blood: st.blood,
  };
}

function restoreScene(toSim, snap) {
  if (!toSim || !snap) return;
  const st = toSim.state;
  Object.assign(st.cum, snap.cum);
  // Rebuild copies should not share a live effect object with an older sim.
  if (snap.cum.preFluid) st.cum.preFluid = {...snap.cum.preFluid};
  st.cum.particles = (snap.cum.particles || []).map(p => ({...p}));
  st.wombBroken = !!snap.wombBroken;
  toSim.setPierce(snap.pierce);
  st.cervixHits = snap.cervixHits || 0;
  st.maxReach = snap.reachFrac * st.MAX_NORMAL;
  st.loose = snap.loose;
  st.entrancePopped = snap.entrancePopped;
  st.hymen.broken = snap.hymenBroken;
  st.hymenOver = snap.hymenOver || 0;
  st.cervixOver = snap.cervixOver || 0;
  st.wombOver = snap.wombOver || 0;
  st.blood = snap.blood;
}

function gameLoop(prev) {
  const now = performance.now();
  if (sim && renderer && panelOpen) {
    const dt = (now - prev) / 1000;
    try {
      sim.update(dt);
      renderer.render(sim);
    } catch (err) {
      console.error('[Greyhaven Motion] frame error', err);
      try { renderer?.resize?.(); } catch (_) {}
    }
    rafId = requestAnimationFrame(() => gameLoop(now));
  }
}

function rebuildGame() {
  if (!panelOpen) return;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  pendingSnap = captureScene(sim);
  renderer?.destroy?.();
  const old = document.getElementById('ghmotion_canvas');
  old.replaceWith(old.cloneNode(false));
  sim = null;
  renderer = null;
  initGame();
  gameLoop(performance.now());
}

function initGame() {
  if (sim) return;
  const s = settings();
  const canvas = document.getElementById('ghmotion_canvas');
  sim = createSim({
    centerline: CENTERLINES.pov,
    wallDamping: 7,
    jiggleScale: 1.0,
    shaftDamping: 16,
    tightness: s.tightness,
    canalTightness: s.canalTightness,
    virgin: s.virginMode,
    blood: true,
    wombCapacity: 3,
    protection: s.protection && sceneEvents.status().protection !== 'broken',
    penisInches: cmToInches(s.penisCm),
    maxDepthPct: s.maxDepthPct,
    canalLength: s.canalLength,
  });
  if (pendingSnap) {
    restoreScene(sim, pendingSnap);
    pendingSnap = null;
  }
  renderer = createMissionaryRenderer(canvas);
  renderer.setSkin?.(herTone(s.skinHer), himTone(s.skinHim));
  renderer.setXray?.(s.xrayMode);
  syncProtectionPresentation();

  let dragging = false, grabDepth = 0, grabScene = null;
  canvas.addEventListener('pointerdown', ev => {
    dragging = true;
    canvas.setPointerCapture(ev.pointerId);
    grabScene = renderer.screenToScene(ev.clientX, ev.clientY);
    grabDepth = sim.state.d;
    touchSession();
  });
  canvas.addEventListener('pointermove', ev => {
    if (!dragging) return;
    const p = renderer.screenToScene(ev.clientX, ev.clientY);
    const inward = { x: -sim.state.entranceTan.x, y: -sim.state.entranceTan.y };
    const delta = (p.x - grabScene.x) * inward.x + (p.y - grabScene.y) * inward.y;
    sim.setTarget(grabDepth + delta * 1.15);
    touchSession();
  });
  const release = () => { dragging = false; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  sim.on('stroke', e => {
    touchSession(); session.strokes.push({ ...e, t: performance.now() / 1000 });
    const result = sceneEvents.onStroke(e, performance.now()/1000);
    for (const event of result.events) applySceneEventVisual(event);
    if (result.broken) syncProtectionPresentation();
    updateStatus();
  });
  sim.on('deep', () => { touchSession(); session.deepHits++; });
  sim.on('slap', () => { if (session.active) session.ballSlaps++; });
  sim.on('insert', e => {
    touchSession();
    if (!session.firstEntry) session.firstEntry = {
      speed: e.speed,
      atSec: Math.max(0, performance.now() / 1000 - session.startT),
    };
  });
  sim.on('withdraw', () => { if (session.active) session.fullWithdrawals++; });
  sim.on('outstroke', e => { touchSession(); session.outStrokes.push({ ...e, t: performance.now() / 1000 }); });
  sim.on('cum', e => {
    touchSession();
    if (e.where === 'protected') {
      sceneEvents.onProtectedRelease();
      if(sceneEvents.status().protection==='broken') syncProtectionPresentation();
    }
    if (e.where === 'womb') session.cumWomb++; else if (e.where === 'vagina') session.cumVag++; else session.cumProtected++;
    updateStatus();
  });
  sim.on('cervix_pop', () => { touchSession(); session.cervixPierced = true; });
  sim.on('cervix_breach', () => { touchSession(); session.cervixBreached = true; });
  sim.on('womb_breach', () => { touchSession(); session.wombBreached = true; });
  sim.on('gate_pop', e => { touchSession(); session.entryPopStrain = e.strainSec; });
  sim.on('gate_retreat', () => { touchSession(); session.entryAttempts++; });
  sim.on('hymen_strain', e => { touchSession(); session.hymenStretches = e.count; });
  sim.on('cervix_strain', e => { touchSession(); session.cervixStretches = e.count; });
  sim.on('womb_strain', e => { touchSession(); session.wombStretches = e.count; });
  sim.on('hymen_break', e => { touchSession(); session.hymenBreak = e; });
  sim.on('move', e => {
    liveStats.depth = e.depthNorm;
    applySceneEventVisual(sceneEvents.onDepth(e.depthNorm));
    session.lastDepth = e.depthNorm;
    session.endedInside = e.inside;
    const now = performance.now() / 1000;
    if (session.active) {
      const still = Math.abs(e.vel) < 0.02;
      if (still && e.inside && e.depthNorm > 0.15) {
        if (session.pauseStart === null) session.pauseStart = now;
      } else if (session.pauseStart !== null) {
        const len = now - session.pauseStart;
        if (len >= 2) session.pauses.push({ sec: len, atSec: Math.max(0, session.pauseStart - session.startT) });
        session.pauseStart = null;
        if (!still) session.lastActivityT = now;
      }
    }
    updateStatus();
  });
}

function resetSceneCompletely() {
  resetSession();
  clearStagedPrompt();
  promptReplay.newUserTurn();
  replayAttempt=false;
  sim?.setPierce(false);
  sim?.resetScene();
  sceneEvents.reset(settings().protection);
  syncProtectionPresentation();
  updateStatus();
}

function togglePanel() {
  const panel = document.getElementById('ghmotion_panel');
  panelOpen = !panelOpen;
  panel.style.display = panelOpen ? 'flex' : 'none';
  if (panelOpen) {
    initGame();
    renderer?.resize?.();
    gameLoop(performance.now());
  } else if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}


function mountSettingsPanel() {
  const host = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
  if (!host || document.getElementById('ghmotion_settings_drawer')) return;
  const s = settings();
  const wrap = document.createElement('div');
  wrap.id = 'ghmotion_settings_drawer';
  wrap.className = 'inline-drawer';
  wrap.innerHTML = `
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>Greyhaven Motion</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="ghmotion-settings-grid">
        <label><span>Receiver name</span><input id="ghmotion_setting_receiver" class="text_pole" type="text" placeholder="{{char}}"></label>
        <label><span>Giver name</span><input id="ghmotion_setting_giver" class="text_pole" type="text" placeholder="{{user}}"></label>
        <label><span>Action preamble</span><textarea id="ghmotion_setting_preamble" class="text_pole" rows="3"></textarea></label>
        <label><span>Style guide</span><textarea id="ghmotion_setting_guide" class="text_pole" rows="4"></textarea></label>
      </div>
      <details id="ghmotion_limits_details" class="ghmotion-limits-details">
        <summary>Scene control limits</summary>
        <div class="ghmotion-settings-limits-grid">
          ${SCENE_LIMIT_SPECS.map(spec => `
            <fieldset class="ghmotion-limit-pair">
              <legend>${spec.label} (${spec.unit})</legend>
              <label><span>Minimum</span><input class="text_pole" type="number" id="ghmotion_limit_${spec.value}_min" min="${spec.hardMin}" max="${spec.hardMax}" step="${spec.step}"></label>
              <label><span>Maximum</span><input class="text_pole" type="number" id="ghmotion_limit_${spec.value}_max" min="${spec.hardMin}" max="${spec.hardMax}" step="${spec.step}"></label>
            </fieldset>`).join('')}
        </div>
        <div class="ghmotion-settings-help">Limits control the allowed values in the Scene tab. They stay within the current simulator's supported ranges; no motion physics are changed. For size, you can now set the minimum as low as 2 cm.</div>
      </details>
      <details class="ghmotion-limits-details">
        <summary>Event probabilities (fictional simulation)</summary>
        <div class="ghmotion-event-risk-grid">
          ${Object.entries(DEFAULT_RISKS).map(([key,value])=>`
            <label><span>${key.replace(/([A-Z])/g,' $1')} (%)</span><input type="number" class="text_pole" min="0" max="100" step="0.5" id="ghmotion_risk_${key}"></label>
          `).join('')}
        </div>
        <div class="ghmotion-settings-help">Speed risks use one preselected roll per protection instance; completion risks are separately rolled once per event. This is a fictional game mechanic, not real-world medical probability.</div>
      </details>
      <details class="ghmotion-limits-details">
        <summary>Event timing (stroke ranges)</summary>
        <div class="ghmotion-settings-limits-grid">
          ${[['motion','Protection: motion-triggered failure'],['release','Protection: release-triggered failure'],['preFluid','Pre-fluid event']].map(([prefix,label])=>`
            <fieldset class="ghmotion-limit-pair">
              <legend>${label}</legend>
              <label><span>Minimum strokes</span><input class="text_pole" type="number" id="ghmotion_range_${prefix}_min" min="${prefix==='preFluid'?1:0}" max="1000" step="1"></label>
              <label><span>Maximum strokes</span><input class="text_pole" type="number" id="ghmotion_range_${prefix}_max" min="${prefix==='preFluid'?1:0}" max="1000" step="1"></label>
            </fieldset>`).join('')}
        </div>
        <div class="ghmotion-settings-help">Changes apply to newly enabled protection or the next scene reset. Stroke counts are independent of Record/Stop. A scheduled event keeps its existing deadline.</div>
      </details>
      <div class="ghmotion-settings-help">You can use <code>{{receiver}}</code> and <code>{{giver}}</code> in the style guide. Hidden summaries replay only when regenerating the same reply, never on a new user turn.</div>
    </div>`;
  host.appendChild(wrap);
  const receiver = wrap.querySelector('#ghmotion_setting_receiver');
  const giver = wrap.querySelector('#ghmotion_setting_giver');
  const preamble = wrap.querySelector('#ghmotion_setting_preamble');
  const guide = wrap.querySelector('#ghmotion_setting_guide');
  receiver.value = s.receiverName || '';
  giver.value = s.giverName || '';
  preamble.value = s.actionPreamble || DEFAULT_ACTION_PREAMBLE;
  guide.value = s.styleGuide || DEFAULT_STYLE_GUIDE;
  receiver.addEventListener('input', () => { s.receiverName = receiver.value; saveSettingsDebounced(); if (injectionStaged) stagePrompt(document.getElementById('ghmotion_summary')?.value || stagedText); });
  giver.addEventListener('input', () => { s.giverName = giver.value; saveSettingsDebounced(); if (injectionStaged) stagePrompt(document.getElementById('ghmotion_summary')?.value || stagedText); });
  preamble.addEventListener('input', () => { s.actionPreamble = preamble.value; saveSettingsDebounced(); if (injectionStaged) stagePrompt(document.getElementById('ghmotion_summary')?.value || stagedText); });
  guide.addEventListener('input', () => { s.styleGuide = guide.value; saveSettingsDebounced(); if (injectionStaged) stagePrompt(document.getElementById('ghmotion_summary')?.value || stagedText); });

  for (const [key,defaultVal] of Object.entries(DEFAULT_RISKS)) {
    const field = wrap.querySelector(`#ghmotion_risk_${key}`);
    field.value = s.eventRisks[key] ?? defaultVal;
    field.addEventListener('change',()=>{
      const number=clipNumber(field.value,0,100,defaultVal);
      s.eventRisks[key]=number; field.value=number;
      sceneEvents.configure({[key]:number});
      saveSettingsDebounced();
    });
  }

  for (const prefix of ['motion','release','preFluid']) {
    const lo=`${prefix}MinStrokes`, hi=`${prefix}MaxStrokes`;
    const lower=wrap.querySelector(`#ghmotion_range_${prefix}_min`);
    const upper=wrap.querySelector(`#ghmotion_range_${prefix}_max`);
    lower.value=s.eventRanges[lo]; upper.value=s.eventRanges[hi];
    const onChange=(which)=>{
      const floor=prefix==='preFluid'?1:0;
      let min=Math.floor(clipNumber(lower.value,floor,1000,s.eventRanges[lo]));
      let max=Math.floor(clipNumber(upper.value,floor,1000,s.eventRanges[hi]));
      if(min>max) { if(which==='min') max=min; else min=max; }
      s.eventRanges[lo]=min; s.eventRanges[hi]=max;
      lower.value=min; upper.value=max;
      sceneEvents.configure({[lo]:min,[hi]:max});
      saveSettingsDebounced();
    };
    lower.addEventListener('change',()=>onChange('min'));
    upper.addEventListener('change',()=>onChange('max'));
  }

  for (const spec of SCENE_LIMIT_SPECS) {
    const minField = wrap.querySelector(`#ghmotion_limit_${spec.value}_min`);
    const maxField = wrap.querySelector(`#ghmotion_limit_${spec.value}_max`);
    minField.value = s[spec.min];
    maxField.value = s[spec.max];
    const onChange = (editedSide) => {
      const before = s[spec.value];
      // Both fields are parsed together; order of editing can never create min>max.
      let lower = clipNumber(minField.value, spec.hardMin, spec.hardMax, s[spec.min]);
      let upper = clipNumber(maxField.value, spec.hardMin, spec.hardMax, s[spec.max]);
      if (lower > upper) {
        if (editedSide === 'min') upper = lower;
        else lower = upper;
      }
      s[spec.min] = lower;
      s[spec.max] = upper;
      normalizeSceneLimits(s);
      minField.value = s[spec.min];
      maxField.value = s[spec.max];
      const sceneField = document.querySelector(spec.input);
      if (sceneField) {
        sceneField.min = String(s[spec.min]);
        sceneField.max = String(s[spec.max]);
        sceneField.value = String(s[spec.value]);
      }
      saveSettingsDebounced();
      if (before !== s[spec.value]) {
        if (spec.rebuild) rebuildGame();
        else if (spec.option) sim?.setOptions?.({ [spec.option]: s[spec.value] });
      }
    };
    minField.addEventListener('change', () => onChange('min'));
    maxField.addEventListener('change', () => onChange('max'));
  }
}

jQuery(() => {
  const s = settings();
  mountSettingsPanel();

  $('body').append(`
    <div id="ghmotion_panel" style="display:none;">
      <div id="ghmotion_header">
        <div class="ghmotion-title-wrap">
          <span class="ghmotion-title">Greyhaven Motion</span>
          <span class="ghmotion-sub">Missionary MVP</span>
        </div>
        <div id="ghmotion_status"></div>
        <button class="ghmotion-icon" id="ghmotion_close" title="Close">✕</button>
      </div>
      <div id="ghmotion_canvas_wrap"><canvas id="ghmotion_canvas"></canvas></div>
      <div id="ghmotion_event_status" class="ghmotion-event-status" aria-live="polite"></div>
      <div id="ghmotion_tabs">
        <button class="ghmotion-tab" data-tab="actions">Actions</button>
        <button class="ghmotion-tab" data-tab="scene">Scene</button>
        <button class="ghmotion-tab" data-tab="prompt">Prompt</button>
      </div>
      <div id="ghmotion_tab_actions" class="ghmotion-tab-panel">
        <div id="ghmotion_controls">
          <button class="menu_button" id="ghmotion_record">Record</button>
          <button class="menu_button" id="ghmotion_cum">Cum</button>
          <button class="menu_button" id="ghmotion_break">Break</button>
          <button class="menu_button" id="ghmotion_womb">Womb</button>
          <button class="menu_button" id="ghmotion_preview_toggle">Prompt</button>
          <button class="menu_button" id="ghmotion_reset">Reset</button>
          <button class="menu_button" id="ghmotion_break_protection">Break protection</button>
        </div>
      </div>
      <div id="ghmotion_tab_scene" class="ghmotion-tab-panel">
        <div id="ghmotion_quick">
          <label><span>X-ray</span><input id="ghmotion_xray" type="checkbox"></label>
          <label><span>Protection</span><input id="ghmotion_protection" type="checkbox"></label>
          <label><span>Virgin</span><input id="ghmotion_virgin" type="checkbox"></label>
          <label><span>Size</span><input id="ghmotion_size" type="number" min="2" max="35" step="0.1"> <span>cm</span></label>
          <label><span>Depth</span><input id="ghmotion_depth" type="number" min="100" max="150" step="1"> <span>%</span></label>
          <label><span>Tight</span><input id="ghmotion_tight" type="number" min="0.5" max="2" step="0.1"></label>
          <label><span>Canal</span><input id="ghmotion_canal" type="number" min="0.5" max="3" step="0.1"></label>
          <label><span>Len</span><input id="ghmotion_len" type="number" min="0.7" max="1.2" step="0.05"></label>
          <label><span>Her</span><select id="ghmotion_her"></select></label>
          <label><span>His</span><select id="ghmotion_him"></select></label>
        </div>
      </div>
      <div id="ghmotion_tab_prompt" class="ghmotion-tab-panel">
        <div id="ghmotion_preview" style="display:block;">
          <div class="ghmotion-preview-head">
            <span>Hidden summary for the next send</span>
            <button class="menu_button" id="ghmotion_clear">Clear staged</button>
          </div>
          <textarea id="ghmotion_summary" class="text_pole" rows="8" placeholder="Your hidden summary will appear here after you stop recording."></textarea>
          <div class="ghmotion-help">The active prompt clears after generation but a private replay copy is kept for swipes or regeneration of the same reply only. Sending a new user message discards that copy.</div>
        </div>
      </div>
    </div>
  `);

  function activateTab(tab) {
    s.activeTab = tab;
    $('.ghmotion-tab').removeClass('active');
    $(`.ghmotion-tab[data-tab="${tab}"]`).addClass('active');
    $('.ghmotion-tab-panel').removeClass('active');
    $(`#ghmotion_tab_${tab}`).addClass('active');
    saveSettingsDebounced();
  }

  $('#extensionsMenu').append(`
    <div id="ghmotion_menu_item" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
      <div class="fa-solid fa-wand-magic-sparkles extensionsMenuExtensionButton"></div>
      Greyhaven Motion
    </div>`);

  $('#ghmotion_menu_item').on('click', togglePanel);
  $('#ghmotion_close').on('click', togglePanel);
  $('.ghmotion-tab').on('click', function () { activateTab($(this).data('tab')); });
  activateTab(s.activeTab || 'actions');

  $('#ghmotion_xray').prop('checked', s.xrayMode).on('change', function () {
    s.xrayMode = this.checked;
    renderer?.setXray?.(s.xrayMode);
    saveSettingsDebounced();
  });
  $('#ghmotion_protection').prop('checked', s.protection).on('change', function () {
    s.protection = this.checked;
    sceneEvents.setProtection(s.protection);
    // Keep the model, cosmetic state, and checker aligned when protection is
    // switched on/off mid-scene (including reactivating a new instance).
    if (!s.protection && sim?.state?.cum) {
      sim.state.cum.condom = 0;
      sim.state.cum.condomCount = 0;
    }
    syncProtectionPresentation();
    refreshEventStatus();
    if (injectionStaged) stagePrompt(document.getElementById('ghmotion_summary').value);
    saveSettingsDebounced();
  });
  $('#ghmotion_virgin').prop('checked', s.virginMode).on('change', function () {
    s.virginMode = this.checked;
    sim?.setVirgin?.(s.virginMode);
    saveSettingsDebounced();
  });
  for (const spec of SCENE_LIMIT_SPECS) {
    const control = $(spec.input);
    control.attr({ min: s[spec.min], max: s[spec.max], step: spec.step });
    control.val(s[spec.value]).on('change', function () {
      const value = clipNumber(this.value, s[spec.min], s[spec.max], s[spec.value]);
      const changed = s[spec.value] !== value;
      s[spec.value] = value;
      this.value = String(value);
      saveSettingsDebounced();
      if (changed) {
        if (spec.rebuild) rebuildGame();
        else if (spec.option) sim?.setOptions?.({ [spec.option]: value });
      }
    });
  }

  for (const [selId, key] of [['#ghmotion_her', 'skinHer'], ['#ghmotion_him', 'skinHim']]) {
    const sel = $(selId);
    for (const [name, tone] of Object.entries(SKIN_TONES)) {
      sel.append($('<option>').val(name).text(tone.label));
    }
    sel.val(s[key]).on('change', function () {
      s[key] = this.value;
      renderer?.setSkin?.(herTone(s.skinHer), himTone(s.skinHim));
      saveSettingsDebounced();
    });
  }

  const safeAction = (fn) => () => {
    touchSession();
    try {
      fn?.();
      if (sim && renderer) renderer.render(sim);
    } catch (err) {
      console.error('[Greyhaven Motion] action error', err);
    }
  };

  $('#ghmotion_record').on('click', toggleRecord);
  $('#ghmotion_cum').on('click', safeAction(() => sim?.ejaculate?.()));
  $('#ghmotion_break').on('click', safeAction(() => sim?.armBreak?.()));
  $('#ghmotion_womb').on('click', safeAction(() => sim?.slamToWomb?.()));
  $('#ghmotion_reset').on('click', resetSceneCompletely);
  $('#ghmotion_break_protection').on('click', () => {
    if(sceneEvents.breakProtection('manual')) {
      syncProtectionPresentation();
      updateStatus();
    }
  });
  $('#ghmotion_clear').on('click', () => {
    promptReplay.newUserTurn();
    replayAttempt=false;
    clearStagedPrompt();
  });
  $('#ghmotion_preview_toggle').on('click', () => {
    activateTab('prompt');
  });
  $('#ghmotion_summary').on('input', function () {
    if (this.value.trim()) stagePrompt(this.value);
    else clearStagedPrompt();
  });

  const panel = document.getElementById('ghmotion_panel');
  const header = document.getElementById('ghmotion_header');
  let moving = false, startX = 0, startY = 0, left = 0, top = 0;
  if (header && panel) {
    header.addEventListener('pointerdown', ev => {
      if (ev.target.closest('button')) return;
      moving = true;
      header.setPointerCapture(ev.pointerId);
      startX = ev.clientX; startY = ev.clientY;
      left = panel.offsetLeft; top = panel.offsetTop;
    });
    header.addEventListener('pointermove', ev => {
      if (!moving) return;
      panel.style.left = `${Math.max(8, left + ev.clientX - startX)}px`;
      panel.style.top = `${Math.max(8, top + ev.clientY - startY)}px`;
      panel.style.right = 'auto';
    });
    const stopMove = () => { moving = false; };
    header.addEventListener('pointerup', stopMove);
    header.addEventListener('pointercancel', stopMove);
  }

  updateStatus();
});
