// Deterministic transcription: session stats + scene state -> explicit text.
// Pure module (no ST, no DOM) so it can be golden-tested in node.
// NOTE: buildSummary clears state.strainAcc after reading it, same as the
// original inline version did.

import { DEFAULT_PHRASES, fill } from './phrases.js';

// Group recorded stroke intervals by tempo, with a gap ending a phase.
// This is best-effort: a gap may be a pause or movement that did not form a
// complete stroke. Explicit pause events are reported separately.
function timedStrokePhases(session) {
    const strokes = session.strokes || [];
    if (strokes.length < 5 || !Number.isFinite(session.startT) ||
        strokes.some(s => !Number.isFinite(s.t))) return [];
    const phases = [];
    let current = null;
    for (let i = 1; i < strokes.length; i++) {
        const dt = strokes[i].t - strokes[i - 1].t;
        if (dt <= 0 || dt > 3.2) { current = null; continue; }
        const label = dt <= 0.7 ? 'fast segment' : dt <= 1.5 ? 'moderate segment' : 'slow segment';
        const at = Math.max(0, strokes[i - 1].t - session.startT);
        const until = Math.max(at, strokes[i].t - session.startT);
        if (current && current.label === label && at - current.end < 1) {
            current.n++;
            current.end = until;
        } else {
            current = { label, n: 1, start: at, end: until };
            phases.push(current);
        }
    }
    // Suppress micro-fragmentation. Only useful sustained movement periods.
    return phases.filter(p => p.n >= 3).slice(0, 8).map(p => ({
        label: p.label, n: p.n + 1,
        rate: +((p.n) / Math.max(0.1, p.end - p.start)).toFixed(2),
        at: Math.round(p.start), until: Math.round(p.end),
    }));
}

// cfg: { receiverName, bloodEnabled, view, actionPreamble, defaultPreamble,
//        phrases (optional override map) }
export function buildSummary(session, state, cfg) {
    const P = cfg.phrases ? { ...DEFAULT_PHRASES, ...cfg.phrases } : DEFAULT_PHRASES;
    const T = (key, vars) => fill(P[key] ?? DEFAULT_PHRASES[key], vars);
    const who = (cfg.receiverName || '').trim() || '{{char}}';
    const dur = Math.max(1, Math.round(session.lastActivityT - session.startT));
    const n = session.strokes.length;
    const bits = [];

    // First entry is a SCENE milestone, not the first insert event of every recording.
    if (session.firstEntry && !session.sceneAlreadyContacted) {
        const v = Math.abs(session.firstEntry.speed);
        const key = v < 10 ? 'entry_slow' : v < 25 ? 'entry_gentle' : v < 45 ? 'entry_firm' : 'entry_slam';
        bits.push(T(key, { who }));
        // This is the point initial contact happened in the recording, NOT a
        // claimed total duration of entry (which the engine does not track yet).
        if (Number.isFinite(session.firstEntry.atSec) && session.firstEntry.atSec >= 1) {
            bits.push(T('first_contact_at', { sec: Math.round(session.firstEntry.atSec) }));
        }
    } else if (session.firstEntry && session.sceneAlreadyContacted) {
        bits.push(T('entry_reentry', { who }));
    } else if (n > 0 || session.lastDepth > 0) {
        bits.push(T('entry_already', { who }));
    } else {
        bits.push(T('entry_tease', { who }));
    }
    if (session.entryPopStrain != null && session.entryPopStrain > 1.2) {
        bits.push(T('entry_pop', { who, sec: Math.round(session.entryPopStrain) }));
    }
    if (session.entryAttempts > 0) {
        bits.push(T(session.entryAttempts > 1 ? 'entry_attempts_many' : 'entry_attempts_one', { who, n: session.entryAttempts }));
    }
    if (session.hymenStretches > 0 && !session.hymenBreak) {
        bits.push(T(session.hymenStretches > 1 ? 'hymen_stretch_many' : 'hymen_stretch_one', { who, n: session.hymenStretches }));
    }
    if (session.hymenBreak) {
        const how = T(session.hymenBreak.method === 'thrust' ? 'hymen_break_thrust'
            : session.hymenBreak.method === 'overstretch' ? 'hymen_break_overstretch'
                : 'hymen_break_pressure', { who });
        const blood = cfg.bloodEnabled ? T('hymen_break_blood', { who }) : '';
        bits.push(T('hymen_break', { who, how, blood }));
    }

    bits.push(T(cfg.protection ? 'protected_state' : 'raw_state', { who }));

    if (n > 0) {
        bits.push(T(n > 1 ? 'strokes_many' : 'strokes_one', { n, sec: dur }));
        // stroke character breakdown (deep thrusts / tip-teasing / tiny grinds)
        // Make classifications mutually exclusive. Previously the same stroke could
        // be counted as both 'short' and 'long', yielding totals larger than n.
        const tipStrokes = session.strokes.filter(x => x.peak < 0.28).length;
        const deepStrokes = session.strokes.filter(x => x.peak >= 0.28 && x.travel >= 0.30).length;
        const teases = session.strokes.filter(x => x.peak >= 0.28 && x.travel < 0.12).length;
        if (deepStrokes > 0) bits.push(T(deepStrokes === 1 ? 'strokes_deep_one' : 'strokes_deep', { who, n: deepStrokes }));
        const cervixTip = session.strokes.filter(x => x.zone === 'cervix').length;
        if (cervixTip > 0) bits.push(T('strokes_cervixtip', { who, n: cervixTip }));
        if (tipStrokes > 0) bits.push(T(tipStrokes === 1 ? 'strokes_tip_one' : 'strokes_tip', { who, n: tipStrokes }));
        if (teases > 0) bits.push(T(teases === 1 ? 'strokes_grind_one' : 'strokes_grind', { who, n: teases }));
        // Timing is measured from the recorded stroke timestamps, not shaft speed.
        // Report the rate and chronological changes without inventing a sensation.
        const rate = +(n / Math.max(1, dur)).toFixed(2);
        bits.push(T('pace_avg', { rate }));
        const timeline = timedStrokePhases(session);
        for (const phase of timeline) {
            bits.push(T('pace_phase', {
                label: phase.label, n: phase.n, rate: phase.rate,
                at: phase.at, until: phase.until,
            }));
        }
        const peaks = session.strokes.map(s => s.peak);
        // Do not cap the average at 100% when the model permits 150%.
        // The final live position can be ahead of the latest completed stroke.
        // Include it in the maximum to avoid a claimed 0% peak after positive contact.
        const avgPeak = Math.round(100 * peaks.reduce((a, b) => a + b, 0) / n);
        const maxPeak = Math.round(100 * Math.max(...peaks, Math.max(0, session.lastDepth || 0)));
        const peak = `${maxPeak}% of reference depth`;
        bits.push(T('depth_summary', { who, avg: avgPeak, peak }));
        const wombDeep = session.strokes.filter(x => x.zone === 'womb').length;
        const wombTipN = session.strokes.filter(x => x.zone === 'wombTip').length;
        if (wombDeep > 0) bits.push(T('strokes_womb', { who, n: wombDeep }));
        if (wombTipN > 0) bits.push(T('strokes_wombtip', { who, n: wombTipN }));
    }
    // Notable pull-backs: slow drags, long pulls, or retreats to the entrance.
    // (The ordinary return half of a rhythm stroke stays implicit.)
    const notableOuts = session.outStrokes.filter(o => o.travel >= 0.35 || o.speed < 8 || o.to < 0.18);
    if (notableOuts.length > 0) {
        const detail = [];
        if (notableOuts.some(o => o.speed < 8)) detail.push(T('outs_slow', { who }));
        if (notableOuts.some(o => o.to < 0.18)) detail.push(T('outs_tip', { who }));
        bits.push(T(notableOuts.length > 1 ? 'outs_many' : 'outs_one',
            { who, n: notableOuts.length, detail: detail.length ? ' — ' + detail.join('; ') : '' }));
    }
    if (session.deepHits > 0) {
        bits.push(T(session.deepHits > 1 ? 'deep_hits_many' : 'deep_hits_one', { who, n: session.deepHits }));
    }
    if (session.ballSlaps >= 2) {
        bits.push(T('ball_slaps', { who, n: session.ballSlaps }));
    }
    for (const p of session.pauses) {
        const seconds = typeof p === 'number' ? p : p?.sec;
        if (seconds >= 2) {
            const sec = Math.round(seconds);
            if (typeof p === 'object' && Number.isFinite(p?.atSec)) {
                bits.push(T('pause_positioned', { sec, at: Math.round(p.atSec) }));
            } else bits.push(T('pause_hold', { who, sec }));
        }
    }
    if (session.fullWithdrawals > 0) {
        bits.push(T(session.fullWithdrawals > 1 ? 'withdrawals_many' : 'withdrawals_one', { who, n: session.fullWithdrawals }));
    }
    if (session.cervixStretches > 0 && !session.cervixBreached) {
        bits.push(T(session.cervixStretches > 1 ? 'cervix_stretch_many' : 'cervix_stretch_one', { who, n: session.cervixStretches }));
    }
    if (session.wombStretches > 0 && !session.wombBreached) {
        bits.push(T(session.wombStretches > 1 ? 'womb_stretch_many' : 'womb_stretch_one', { who, n: session.wombStretches }));
    }
    // One event can emit both a breach and an opening notification.
    // Avoid describing the same transition twice.
    if (session.cervixBreached) bits.push(T('cervix_breached', { who }));
    else if (session.cervixPierced) bits.push(T('cervix_pierced', { who }));
    if (session.wombBreached) bits.push(T('womb_breached', { who }));
    if (session.cumVag > 0) {
        const times = session.cumVag > 1 ? ' ' + session.cumVag + ' times' : '';
        bits.push(T(state?.hymen.present ? 'cum_vag_hymen' : 'cum_vag', { who, times }));
    }
    if (session.cumWomb > 0) {
        const loads = session.cumWomb > 1 ? T('cum_womb_loads_many', { n: session.cumWomb }) : T('cum_womb_loads_one', {});
        bits.push(T('cum_womb', { who, loads }));
    }
    if (session.cumProtected > 0) {
        bits.push(T(session.cumProtected > 1 ? 'cum_protected_many' : 'cum_protected_one', { who, n: session.cumProtected }));
    }

    // Persistent scene state: cumulative load counts + current womb condition.
    // (The scene's fluids persist across turns until Discard, so this reports
    // the running total, not just this session.)
    const fluids = state?.cum;
    if (fluids) {
        const totV = fluids.vagCount, totW = fluids.wombCount, totP = fluids.condomCount || 0;
        if (totV + totW + totP > 0) {
            const parts = [];
            if (totV > 0) parts.push(T(totV > 1 ? 'totals_vag_many' : 'totals_vag_one', { n: totV }));
            if (totW > 0) parts.push(T(totW > 1 ? 'totals_womb_many' : 'totals_womb_one', { n: totW }));
            if (totP > 0) parts.push(T(totP > 1 ? 'totals_protected_many' : 'totals_protected_one', { n: totP }));
            bits.push(T(totV + totW + totP > 1 ? 'totals_many' : 'totals_one', { who, n: totV + totW + totP, parts: parts.join(', ') }));
        }
        const fill_ = fluids.womb;
        if (fill_ > 0.05) {
            const stateKey = fill_ < 0.3 ? 'womb_state_trace'
                : fill_ < 0.8 ? 'womb_state_partial'
                    : fill_ < 1.15 ? 'womb_state_full'
                        : fill_ < 1.9 ? 'womb_state_overfilled'
                            : fill_ < 3.5 ? 'womb_state_distended'
                                : fill_ < 6.5 ? 'womb_state_pregnant'
                                    : 'womb_state_absurd';
            bits.push(T('womb_fill', { who, pct: Math.round(fill_ * 100), state: T(stateKey, { who }) }));
        }
        if (fluids.vag > 0.4) {
            bits.push(T('vag_flooded', { who, leaking: fluids.leak > 0.3 ? T('vag_leaking', { who }) : '' }));
        }
    }

    // Resistance / stretching state (also scene-persistent)
    if (state) {
        const reachNow = state.maxReach;
        if (session.frontierStart != null && reachNow - session.frontierStart > 1.5) {
            const fromPct = Math.round(100 * session.frontierStart / state.MAX_NORMAL);
            const toPct = Math.round(100 * reachNow / state.MAX_NORMAL);
            bits.push(T('frontier', { who, from: fromPct, to: toPct }));
        }
        if (state.strainAcc > 3) {
            bits.push(T('strain_time', { who, sec: Math.round(state.strainAcc) }));
        }
        state.strainAcc = 0;
        if (state.entrancePopped || reachNow > 1) {
            // Neutral scene-specific maximum; never claim a character's lifetime record
            // or infer enjoyment/comfort from the simulator's physics state.
            const reachPct = Math.round(100 * reachNow / state.MAX_NORMAL);
            if (reachPct > 5) bits.push(T('scene_max', { who, pct: reachPct }));
        }
        // The scene metadata already describes the enabled barrier and current state.
        // Only record the transition in the recording where it happened; don't repeat
        // a past milestone or infer sexual history from anatomy on subsequent turns.
        if (!state.pierce && (state.cervixHits > 0 || state.cervixOver > 0)) {
            const wear = state.cervixOver > 0
                ? T(state.cervixOver > 1 ? 'cervix_wear_weak_many' : 'cervix_wear_weak_one', { n: state.cervixOver })
                : T('cervix_wear_held', {});
            bits.push(T(state.cervixHits === 1 ? 'cervix_knocks_one' : 'cervix_knocks_many', { who, n: state.cervixHits, wear }));
        } else if (state.pierce && !(session.cervixBreached || session.cervixPierced || session.wombBreached)) {
            // Persistent state is useful on later recordings, but don't restate it
            // immediately after the current recording already describes the event.
            if (state.wombBroken) {
                bits.push(T('cervix_open_womb_claimed', { who }));
            } else {
                const weak = state.wombOver > 0
                    ? T(state.wombOver > 1 ? 'womb_weak_many' : 'womb_weak_one', { n: state.wombOver })
                    : '';
                bits.push(T('cervix_open_tip', { who, weak }));
            }
        }
    }

    const maxPeakEnd = session.strokes.length ? Math.max(...session.strokes.map(x => x.peak)) : 0;
    bits.push(!session.endedInside
        ? T('end_out', { who })
        : (maxPeakEnd > 0.7 && session.lastDepth < 0.35)
            ? T('end_shallow', { who, pct: Math.round(session.lastDepth * 100) })
            : T('end_inside', { who, pct: Math.round(session.lastDepth * 100) }));

    const posDesc = T(cfg.view === 'side' ? 'pos_side' : 'pos_pov', { who });

    const preamble = ((cfg.actionPreamble || '').trim() || cfg.defaultPreamble)
        .replaceAll('{{receiver}}', who)
        .replaceAll('{{position}}', posDesc);
    return `${preamble} ${bits.join('; ')}.]`;
}
