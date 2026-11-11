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

const MODULE = 'greyhaven_motion';
const extension_prompt_types = { NONE: -1, IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
const extension_prompt_roles = { SYSTEM: 0, USER: 1, ASSISTANT: 2 };

const DEFAULT_ACTION_PREAMBLE =
  'Greyhaven Motion hidden action context. Treat this as private physical context for the next reply only. ' +
  'Do not quote it, do not mention metadata, and do not list numbers unless the character would naturally react to them.';

const DEFAULT_STYLE_GUIDE =
  'Respond naturally as {{receiver}}. Use the hidden action context to shape the reaction, pacing, comfort, enthusiasm, hesitation, and satisfaction. ' +
  'Do not repeat the summary verbatim.';

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
  skinHer: 'anime',
  skinHim: 'anime',
  previewOpen: false,
  actionPreamble: DEFAULT_ACTION_PREAMBLE,
  styleGuide: DEFAULT_STYLE_GUIDE,
  activeTab: 'actions',
};

function settings() {
  if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
  const s = extension_settings[MODULE];
  for (const k of Object.keys(defaultSettings)) {
    if (!(k in s)) s[k] = defaultSettings[k];
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
  const meta = [
    'position: missionary',
    `visual mode: ${s.xrayMode ? 'x-ray' : 'non x-ray'}`,
    `protection: ${s.protection ? 'on' : 'off'}`,
    `approximate size: ${Number(s.penisCm).toFixed(1)} cm`,
    `tightness: ${Number(s.tightness).toFixed(1)}x`,
    `canal length: ${Number(s.canalLength).toFixed(2)}x`,
    `max depth: ${Math.round(Number(s.maxDepthPct))}%`,
    (s.virginMode && !sim?.state?.hymen?.broken) ? 'virgin barrier intact' : (sim?.state?.hymen?.broken ? 'virgin barrier broken' : 'virgin barrier not active'),
  ].join('; ');
  const guide = (s.styleGuide || DEFAULT_STYLE_GUIDE).replaceAll('{{receiver}}', who).replaceAll('{{giver}}', giver);
  return `*${meta}; ${summary}; ${guide}*`;
}

let injectionStaged = false;
let stagedText = '';
let recordMode = false;
let panelOpen = false;
let sim = null, renderer = null, rafId = null;
let liveStats = { depth: 0 };
let pendingSnap = null;

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

eventSource.on(event_types.GENERATION_ENDED, () => {
  if (!injectionStaged) return;
  clearStagedPrompt();
});

function stopAndStageRecording() {
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
}

function captureScene(fromSim) {
  if (!fromSim) return null;
  const st = fromSim.state;
  return {
    cum: {
      vag: st.cum.vag, womb: st.cum.womb, leak: st.cum.leak,
      vagCount: st.cum.vagCount, wombCount: st.cum.wombCount,
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
    protection: s.protection,
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
  renderer.setProtection?.(s.protection);

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

  sim.on('stroke', e => { touchSession(); session.strokes.push({ ...e, t: performance.now() / 1000 }); updateStatus(); });
  sim.on('deep', () => { touchSession(); session.deepHits++; });
  sim.on('slap', () => { if (session.active) session.ballSlaps++; });
  sim.on('insert', e => { touchSession(); if (!session.firstEntry) session.firstEntry = { speed: e.speed }; });
  sim.on('withdraw', () => { if (session.active) session.fullWithdrawals++; });
  sim.on('outstroke', e => { touchSession(); session.outStrokes.push(e); });
  sim.on('cum', e => { touchSession(); if (e.where === 'womb') session.cumWomb++; else if (e.where === 'vagina') session.cumVag++; else session.cumProtected++; updateStatus(); });
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
    session.lastDepth = e.depthNorm;
    session.endedInside = e.inside;
    const now = performance.now() / 1000;
    if (session.active) {
      const still = Math.abs(e.vel) < 0.02;
      if (still && e.inside && e.depthNorm > 0.15) {
        if (session.pauseStart === null) session.pauseStart = now;
      } else if (session.pauseStart !== null) {
        const len = now - session.pauseStart;
        if (len > 1.5) session.pauses.push(len);
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
  sim?.setPierce(false);
  sim?.resetScene();
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
      <div class="ghmotion-settings-help">You can use <code>{{receiver}}</code> and <code>{{giver}}</code> in the style guide. The hidden summary auto-clears after the next generated reply.</div>
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
        </div>
      </div>
      <div id="ghmotion_tab_scene" class="ghmotion-tab-panel">
        <div id="ghmotion_quick">
          <label><span>X-ray</span><input id="ghmotion_xray" type="checkbox"></label>
          <label><span>Protection</span><input id="ghmotion_protection" type="checkbox"></label>
          <label><span>Virgin</span><input id="ghmotion_virgin" type="checkbox"></label>
          <label><span>Size</span><input id="ghmotion_size" type="number" min="8" max="30" step="0.5"> <span>cm</span></label>
          <label><span>Depth</span><input id="ghmotion_depth" type="number" min="100" max="150" step="5"> <span>%</span></label>
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
          <div class="ghmotion-help">This text stays hidden from the chat box and rides along only with your next sent message. It clears automatically after the reply is generated.</div>
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
    renderer?.setProtection?.(s.protection);
    sim?.setOptions?.({ protection: s.protection });
    if (injectionStaged) stagePrompt(document.getElementById('ghmotion_summary').value);
    saveSettingsDebounced();
  });
  $('#ghmotion_virgin').prop('checked', s.virginMode).on('change', function () {
    s.virginMode = this.checked;
    sim?.setVirgin?.(s.virginMode);
    saveSettingsDebounced();
  });
  $('#ghmotion_size').val(s.penisCm).on('change', function () {
    s.penisCm = Math.min(30, Math.max(8, Number(this.value) || 15));
    this.value = s.penisCm;
    saveSettingsDebounced();
    rebuildGame();
  });
  $('#ghmotion_depth').val(s.maxDepthPct).on('change', function () {
    s.maxDepthPct = Math.min(150, Math.max(100, Number(this.value) || 150));
    this.value = s.maxDepthPct;
    saveSettingsDebounced();
    rebuildGame();
  });
  $('#ghmotion_tight').val(s.tightness).on('change', function () {
    s.tightness = Math.min(2, Math.max(0.5, Number(this.value) || 1));
    this.value = s.tightness;
    sim?.setOptions?.({ tightness: s.tightness });
    saveSettingsDebounced();
  });
  $('#ghmotion_canal').val(s.canalTightness).on('change', function () {
    s.canalTightness = Math.min(3, Math.max(0.5, Number(this.value) || 1));
    this.value = s.canalTightness;
    sim?.setOptions?.({ canalTightness: s.canalTightness });
    saveSettingsDebounced();
  });
  $('#ghmotion_len').val(s.canalLength).on('change', function () {
    s.canalLength = Math.min(1.2, Math.max(0.7, Number(this.value) || 1));
    this.value = s.canalLength;
    saveSettingsDebounced();
    rebuildGame();
  });

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
  $('#ghmotion_clear').on('click', clearStagedPrompt);
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
