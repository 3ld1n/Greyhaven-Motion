// Deterministic transcription: session stats + scene state -> explicit text.
// Pure module (no ST, no DOM) so it can be golden-tested in node.
// NOTE: buildSummary clears state.strainAcc after reading it, same as the
// original inline version did.

import { DEFAULT_PHRASES, fill } from './phrases.js';

// cfg: { receiverName, bloodEnabled, view, actionPreamble, defaultPreamble,
//        phrases (optional override map) }
export function buildSummary(session, state, cfg) {
    const P = cfg.phrases ? { ...DEFAULT_PHRASES, ...cfg.phrases } : DEFAULT_PHRASES;
    const T = (key, vars) => fill(P[key] ?? DEFAULT_PHRASES[key], vars);
    const who = (cfg.receiverName || '').trim() || '{{char}}';
    const dur = Math.max(1, Math.round(session.lastActivityT - session.startT));
    const n = session.strokes.length;
    const bits = [];

    // First entry: how the cock first went in matters
    if (session.firstEntry) {
        const v = Math.abs(session.firstEntry.speed);
        const key = v < 10 ? 'entry_slow' : v < 25 ? 'entry_gentle' : v < 45 ? 'entry_firm' : 'entry_slam';
        bits.push(T(key, { who }));
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

    if (n > 0) {
        bits.push(T(n > 1 ? 'strokes_many' : 'strokes_one', { n, sec: dur }));
        // stroke character breakdown (deep thrusts / tip-teasing / tiny grinds)
        const deepStrokes = session.strokes.filter(x => x.travel >= 0.3).length;
        const tipStrokes = session.strokes.filter(x => x.peak < 0.28).length;
        const teases = session.strokes.filter(x => x.travel < 0.12 && x.peak >= 0.28).length;
        if (deepStrokes > 0) bits.push(T('strokes_deep', { who, n: deepStrokes }));
        const cervixTip = session.strokes.filter(x => x.zone === 'cervix').length;
        if (cervixTip > 0) bits.push(T('strokes_cervixtip', { who, n: cervixTip }));
        if (tipStrokes > 0) bits.push(T('strokes_tip', { who, n: tipStrokes }));
        if (teases > 0) bits.push(T('strokes_grind', { who, n: teases }));
        // pace trend: first third vs last third
        const third = Math.max(1, Math.floor(n / 3));
        const early = session.strokes.slice(0, third);
        const late = session.strokes.slice(-third);
        const avgSpeed = arr => arr.reduce((a, s) => a + s.speed, 0) / arr.length;
        const e = avgSpeed(early), l = avgSpeed(late);
        const paceKey = l > e * 1.5 ? 'pace_building'
            : e > l * 1.5 ? 'pace_gentling'
                : l > 25 ? 'pace_hard' : l > 12 ? 'pace_steady' : 'pace_slow';
        bits.push(T(paceKey, { who }));
        const peaks = session.strokes.map(s => s.peak);
        const avgPeak = Math.min(100, Math.round(100 * peaks.reduce((a, b) => a + b, 0) / n));
        const maxPeak = Math.round(100 * Math.max(...peaks));
        const peak = maxPeak > 102 ? T('depth_peak_beyond', { who }) : `${maxPeak}%`;
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
        if (p > 1.5) bits.push(T('pause_hold', { who, sec: Math.round(p) }));
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
    if (session.cervixBreached) bits.push(T('cervix_breached', { who }));
    if (session.wombBreached) bits.push(T('womb_breached', { who }));
    if (session.cervixPierced) bits.push(T('cervix_pierced', { who }));
    if (session.cumVag > 0) {
        const times = session.cumVag > 1 ? ' ' + session.cumVag + ' times' : '';
        bits.push(T(state?.hymen.present ? 'cum_vag_hymen' : 'cum_vag', { who, times }));
    }
    if (session.cumWomb > 0) {
        const loads = session.cumWomb > 1 ? T('cum_womb_loads_many', { n: session.cumWomb }) : T('cum_womb_loads_one', {});
        bits.push(T('cum_womb', { who, loads }));
    }

    // Persistent scene state: cumulative load counts + current womb condition.
    // (The scene's fluids persist across turns until Discard, so this reports
    // the running total, not just this session.)
    const fluids = state?.cum;
    if (fluids) {
        const totV = fluids.vagCount, totW = fluids.wombCount;
        if (totV + totW > 0) {
            const parts = [];
            if (totV > 0) parts.push(T(totV > 1 ? 'totals_vag_many' : 'totals_vag_one', { n: totV }));
            if (totW > 0) parts.push(T(totW > 1 ? 'totals_womb_many' : 'totals_womb_one', { n: totW }));
            bits.push(T(totV + totW > 1 ? 'totals_many' : 'totals_one', { who, n: totV + totW, parts: parts.join(', ') }));
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
        const loose = state.loose;
        if (state.entrancePopped || reachNow > 1) {
            bits.push(T(loose < 0.25 ? 'loose_tight' : loose < 0.6 ? 'loose_mid' : 'loose_open', { who }));
            const reachPct = Math.round(100 * reachNow / state.MAX_NORMAL);
            if (reachPct > 5) bits.push(T('deepest_ever', { who, pct: Math.min(100, reachPct) }));
        }
        if (state.hymen.present) {
            const weak = state.hymenOver > 0
                ? T(state.hymenOver > 1 ? 'virgin_weak_many' : 'virgin_weak_one', { n: state.hymenOver })
                : '';
            bits.push(T('virgin_intact', { who, weak }));
        } else if (state.hymen.broken) {
            bits.push(T('virgin_taken', { who }));
        }
        if (!state.pierce && (state.cervixHits > 0 || state.cervixOver > 0)) {
            const wear = state.cervixOver > 0
                ? T(state.cervixOver > 1 ? 'cervix_wear_weak_many' : 'cervix_wear_weak_one', { n: state.cervixOver })
                : T('cervix_wear_held', {});
            bits.push(T(state.cervixHits === 1 ? 'cervix_knocks_one' : 'cervix_knocks_many', { who, n: state.cervixHits, wear }));
        } else if (state.pierce) {
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
