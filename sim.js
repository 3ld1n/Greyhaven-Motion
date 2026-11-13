// Renderer-agnostic soft-body simulation for the X-ray scene.
// All coordinates are in "scene units": a 100 x 60 viewport, y grows downward.
// Composition: missionary, she is on her back — hips/legs left, shaft enters
// from the lower right angled up-left; womb sits past the canal end.
// The renderer (render2d.js or a future three.js one) only reads state.

const SCENE_W = 100;
const SCENE_H = 60;

// Default canal centerline (side view): from entrance (lower right) up-left.
// Each view supplies its own centerline; the rest of the sim is view-agnostic.
export const CENTERLINES = {
    // standing from behind: entrance at the BASE OF THE BUTT (penetrated from
    // behind), canal runs forward/up into the belly
    side: { P0: { x: 26, y: 45.5 }, P1: { x: 37, y: 42.5 }, P2: { x: 50, y: 34 } },
    pov: { P0: { x: 50, y: 47 }, P1: { x: 49.2, y: 36 }, P2: { x: 48.5, y: 25 } },
};

export function createSim(userOpts = {}) {
    const opts = Object.assign({
        centerline: null,       // {P0,P1,P2} quadratic bezier, entrance -> inner end
        wallStiffness: 90,      // spring pulling walls back to rest
        wallDamping: 7,         // lower = more jelly overshoot
        neighborStiffness: 150, // wave propagation along the canal
        shaftStiffness: 220,    // how hard the shaft chases the pointer
        shaftDamping: 16,       // slightly underdamped = feels weighty
        jiggleScale: 1.0,       // global body-wobble multiplier
        tightness: 1.0,         // global resistance multiplier (0.5 loose .. 2 vice)
        canalTightness: 1.0,    // rest-closure only: how slowly the shut canal works open (2+ = may never fully gape)
        virgin: false,          // hymen barrier + extra tightness until broken
        blood: true,            // show blood on hymen break
        wombCapacity: 3.0,      // max womb fill (1.0 = 100% .. 10.0 = 1000%)
        penisInches: 10,        // 10in reaches 150% of the DEFAULT depth; shorter can't go as deep
        maxDepthPct: 150,       // pierced depth ceiling, 100..150 (% of her natural depth)
        canalLength: 1.0,       // vaginal length multiplier (0.7 shallow .. 1.2 deep); scales
                                // her anatomy about the entrance, penis inches stay absolute
        protection: false,      // if on, ejaculation is visually contained instead of filling the canal
    }, userOpts);

    const cl = opts.centerline || CENTERLINES.side;
    // Scale the canal about its entrance: shorter/longer girl, same world.
    const CLEN = Math.max(0.5, Math.min(1.3, opts.canalLength));
    const scalePt = p => ({ x: cl.P0.x + (p.x - cl.P0.x) * CLEN, y: cl.P0.y + (p.y - cl.P0.y) * CLEN });
    const P0 = cl.P0, P1 = scalePt(cl.P1), P2 = scalePt(cl.P2);
    // Station count scales with length so rugae keep their SPACING: a short
    // canal has fewer folds, not shrunken ones.
    const N_STATIONS = Math.max(14, Math.min(34, Math.round(26 * CLEN)));
    function bezier(t) {
        const u = 1 - t;
        return {
            x: u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x,
            y: u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y,
        };
    }

    // --- Build stations along the centerline (even arc-length spacing) ---
    const SAMPLES = 120;
    const pts = [];
    let arc = 0;
    for (let i = 0; i <= SAMPLES; i++) {
        const p = bezier(i / SAMPLES);
        if (i > 0) arc += Math.hypot(p.x - pts[i - 1].p.x, p.y - pts[i - 1].p.y);
        pts.push({ p, s: arc });
    }
    const L = arc; // total canal length

    const stations = [];
    for (let i = 0; i < N_STATIONS; i++) {
        const target = (i / (N_STATIONS - 1)) * L;
        let k = pts.findIndex(e => e.s >= target);
        if (k < 1) k = 1;
        const a = pts[k - 1], b = pts[k];
        const f = (target - a.s) / Math.max(1e-6, b.s - a.s);
        const pos = { x: a.p.x + (b.p.x - a.p.x) * f, y: a.p.y + (b.p.y - a.p.y) * f };
        let tx = b.p.x - a.p.x, ty = b.p.y - a.p.y;
        const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl; // tangent points inward (up-left)
        let n = { x: -ty, y: tx };                          // normal: "front" side (mons/belly)
        if (n.y > 0) { n.x = -n.x; n.y = -n.y; }
        const t = target / L;
        // Rest half-width: nearly-closed slit, flared at the entrance.
        const rest = 0.55 + 0.3 * Math.sin(Math.PI * Math.min(1, t)) + 1.6 * Math.exp(-t * 9);
        stations.push({
            s: target, t, pos, tan: { x: tx, y: ty }, n,
            rest,
            wt: 0, wb: 0,   // extra displacement beyond rest (front / back)
            vt: 0, vb: 0,   // velocities
            gapT: rest, gapB: rest, // resolved absolute half-widths (renderer reads these)
        });
    }

    const entranceTan = { x: -stations[0].tan.x, y: -stations[0].tan.y }; // points outward (down-right)
    const endTan = stations[stations.length - 1].tan;

    // --- Shaft ---
    const CERVIX_GIVE = 1.2;
    const MAX_NORMAL = L + CERVIX_GIVE;   // normal limit: tip shoving the cervix (100%)
    // Scale: a 10-inch shaft reaches 150% of the DEFAULT-length canal exactly.
    // Anchored to the unscaled length so canalLength changes her, not him:
    // a shallow girl makes the same cock reach relatively deeper.
    const MAX_NORMAL_BASE = L / CLEN + CERVIX_GIVE;
    const UNITS_PER_INCH = (MAX_NORMAL_BASE * 1.5 + 2) / 10;
    const VISIBLE_LEN = Math.max(6, opts.penisInches * UNITS_PER_INCH);
    const POLY_LEN = VISIBLE_LEN + 3.5;   // polygon runs a bit further, hidden behind the balls
    const BALLS_AT = VISIBLE_LEN + 2.0;   // tip-distance of the balls' center
    const BALLS_R = 5.2;
    const REACH_LIMIT = VISIBLE_LEN - 1.5;                 // he physically can't go deeper than he is long
    const MAX_N_EFF = Math.min(MAX_NORMAL, REACH_LIMIT);   // unpierced ceiling
    const MAX_PIERCED = Math.min(MAX_NORMAL * (Math.max(100, Math.min(150, opts.maxDepthPct)) / 100), REACH_LIMIT);
    const WOMB_TIP_LIMIT = Math.min(L + 4.0, MAX_PIERCED); // cervix open, womb unbroken: just the tip fits in
    const HY_MAX = MAX_NORMAL * 0.25;                       // hymen overstretch limit: 25% depth
    const HY_RANGE = Math.max(0.5, HY_MAX - 2.4);           // stretch span past the membrane's rest position
    const CV_MAX = Math.min(MAX_NORMAL * 1.08, REACH_LIMIT);       // closed cervix flexes inward to 108%
    const WT_MAX = Math.min(WOMB_TIP_LIMIT + 2.5, MAX_PIERCED);    // womb far wall stretches a little further
    const OVER_BREAKS = 10;                                  // overstretches to break any barrier
    const MIN_DEPTH = -13;

    function shaftRadius(u) { // u = distance from tip
        if (u < 0) return 0;
        if (u < 2.6) {                       // glans: circular dome cap to the corona
            const f = u / 2.6;
            return 3.05 * Math.sqrt(Math.max(0.04, 1 - (1 - f) * (1 - f)));
        }
        if (u < 3.8) return 3.05 - 0.5 * ((u - 2.6) / 1.2); // corona dip
        return 2.55 + 0.15 * Math.sin(u * 0.85) + Math.min(0.3, (u - 3.8) * 0.015); // shaft
    }

    // Point on the shaft spine at canal-arc position a (a<0 = outside the body).
    function spinePoint(a) {
        if (a >= 0) {
            const clamped = Math.min(a, L);
            let k = pts.findIndex(e => e.s >= clamped);
            if (k < 0) k = pts.length - 1;
            if (k < 1) k = 1;
            const p0 = pts[k - 1], p1 = pts[k];
            const f = (clamped - p0.s) / Math.max(1e-6, p1.s - p0.s);
            const p = { x: p0.p.x + (p1.p.x - p0.p.x) * f, y: p0.p.y + (p1.p.y - p0.p.y) * f };
            if (a <= L) return p;
            // past the canal end: continue along the end tangent (through the cervix)
            return { x: p.x + endTan.x * (a - L), y: p.y + endTan.y * (a - L) };
        }
        return { x: P0.x + entranceTan.x * -a, y: P0.y + entranceTan.y * -a };
    }

    // --- Dynamic state ---
    const st = {
        d: MIN_DEPTH, dVel: 0, dTarget: MIN_DEPTH,
        cervixOff: 0, cervixVel: 0,          // how far the cervix/womb is shoved inward
        jig: { x: 0, y: 0, vx: 0, vy: 0 },   // whole-body wobble
        womb: { x: 0, y: 0, vx: 0, vy: 0 },  // womb's own jiggle offset
        pierce: false,                        // cervix penetration enabled
        maxDepth: MAX_N_EFF,
        cum: { vag: 0, womb: 0, leak: 0, spurting: 0, spawnAcc: 0, particles: [], vagCount: 0, wombCount: 0, condom: 0, condomCount: 0, preFluid: { active: false, deep: false, atDepth: 0, animation: 0, transferred: false }, releaseQueue: null },
        // --- resistance model (scene-persistent until resetScene) ---
        maxReach: 0,          // frontier: deepest point ever stretched this scene
        loose: 0,             // 0 untouched-tight .. 1 worked loose (cum = lube)
        entrancePopped: false, // the lips' breakaway gate, broken once per scene
        gate: { strain: 0, strainSec: 0, wasActive: false },
        hymen: { present: false, broken: false, strain: 0, strainSec: 0, stretch: 0 },
        hymenOver: 0,         // overstretch counters: 10 trips to the limit breaks the barrier,
        cervixOver: 0,        // and cumming resets all three to zero
        wombOver: 0,
        blood: 0,             // 0..1, fades after a hymen break
        strainAcc: 0,         // seconds spent straining at the frontier (index reads+clears)
        forcing: false,       // womb-slam override: resistance yields to a full-weight thrust
        forcingT: 0,
        cervixHits: 0,        // hard knocks this scene (the cervix itself never gives on its own)
        breakArmed: false,    // one-shot: the next barrier (cervix, then womb) breaks on the next stroke
        wombBroken: false,    // womb depths unlocked (else only the tip fits past the cervix)
        time: 0,
        depthNorm: 0,                         // d / MAX_NORMAL — exceeds 1 inside the womb
        stations, L, MAX_NORMAL, MIN_DEPTH, CANAL_SCALE: CLEN,
        VISIBLE_LEN, POLY_LEN, BALLS_AT, BALLS_R,
        entrance: P0, entranceTan, endTan,
        shaftRadius, spinePoint,
        spine: [],       // sampled {pos, r, u} tip -> base, rebuilt each frame
        ballsCenter: { x: 0, y: 0 },
        ballsArc: MIN_DEPTH - BALLS_AT, // balls' own arc position (floppy, lags the shaft)
        ballsVel: 0,
        ballsPerp: 0,    // perpendicular swing offset
        ballsPerpVel: 0,
        ballsSquash: 0,  // 0..1 squash against the vulva (the lips are a hard wall)
        inside: false,
    };

    // --- Events ---
    const listeners = {};
    function on(type, cb) { (listeners[type] ??= []).push(cb); }
    function emit(type, payload) { (listeners[type] || []).forEach(cb => cb(payload)); }

    // Stroke detection
    let dir = 0, lastReversalD = st.d, travel = 0, strokeStartTime = 0;
    let poppedThrough = false;
    let lastSlapT = -1;
    let hymenAtLimit = false, cervixAtLimit = false, wombAtLimit = false;
    // perpendicular swing direction for the balls (world-down-ish)
    let ballsPerpDir = { x: -entranceTan.y, y: entranceTan.x };
    if (ballsPerpDir.y < 0) ballsPerpDir = { x: -ballsPerpDir.x, y: -ballsPerpDir.y };

    function setTarget(sceneDepth) {
        st.dTarget = Math.max(MIN_DEPTH, Math.min(st.maxDepth, sceneDepth));
    }
    function nudgeTarget(delta) { setTarget(st.dTarget + delta); }

    function updateMaxDepth() {
        st.maxDepth = !st.pierce ? CV_MAX : (st.wombBroken ? MAX_PIERCED : WT_MAX);
    }

    function setPierce(onOff) {
        st.pierce = !!onOff;
        updateMaxDepth();
        if (!st.pierce) {
            st.dTarget = Math.min(st.dTarget, MAX_N_EFF);
            poppedThrough = false;
        }
    }

    function setVirgin(onOff) {
        opts.virgin = !!onOff;
        // enabling mid-scene while already past the membrane is too late
        if (opts.virgin && !st.hymen.broken && st.d > 2.0) st.hymen.broken = true;
        if (!opts.virgin) st.hymen.present = false;
    }

    function resetScene() {
        resetFluids();
        st.maxReach = 0;
        st.loose = 0;
        st.entrancePopped = false;
        st.gate = { strain: 0, strainSec: 0, wasActive: false };
        st.hymen = { present: opts.virgin, broken: false, strain: 0, strainSec: 0, stretch: 0 };
        st.hymenOver = 0;
        st.cervixOver = 0;
        st.wombOver = 0;
        hymenAtLimit = cervixAtLimit = wombAtLimit = false;
        st.blood = 0;
        st.strainAcc = 0;
        st.cervixHits = 0;
        st.breakArmed = false;
        st.wombBroken = false;
        updateMaxDepth();
    }

    // Slam all the way through into the womb and cum on arrival — a scripted
    // full-weight thrust that resistance yields to (unlike pointer dragging).
    function armBreak() {
        // Arm the next barrier. Give the shaft a gentle nudge toward that depth so
        // the button reliably works even if the user presses it while hovering near the limit.
        st.breakArmed = true;
        if (!st.pierce) {
            st.dTarget = Math.max(st.dTarget, Math.min(CV_MAX, L + 0.2));
            st.dVel = Math.max(st.dVel, 8.5);
            if (st.d > L - 1.6) {
                st.breakArmed = false;
                setPierce(true);
                emit('cervix_breach', { hits: st.cervixHits });
                st.jig.vx += stations[0].tan.x * 10 * opts.jiggleScale;
                st.jig.vy += stations[0].tan.y * 10 * opts.jiggleScale;
                st.womb.vx += endTan.x * 6 * opts.jiggleScale;
                st.womb.vy += endTan.y * 6 * opts.jiggleScale;
            }
        } else if (!st.wombBroken) {
            st.dTarget = Math.max(st.dTarget, Math.min(WT_MAX, WOMB_TIP_LIMIT + 0.3));
            st.dVel = Math.max(st.dVel, 7.2);
            if (st.d > WOMB_TIP_LIMIT - 0.8) {
                st.breakArmed = false;
                st.wombBroken = true;
                updateMaxDepth();
                emit('womb_breach', {});
                st.jig.vx += stations[0].tan.x * 10 * opts.jiggleScale;
                st.jig.vy += stations[0].tan.y * 10 * opts.jiggleScale;
                st.womb.vx += endTan.x * 7 * opts.jiggleScale;
                st.womb.vy += endTan.y * 7 * opts.jiggleScale;
            }
        }
    }

    function slamToWomb() {
        st.wombBroken = true; // a full-weight slam claims everything
        setPierce(true);
        st.dTarget = Math.min(L + 6.0, MAX_PIERCED - 0.1);
        st.forcing = true;
        st.forcingT = 0;
        st.jig.vx += stations[0].tan.x * 10 * opts.jiggleScale;
        st.jig.vy += stations[0].tan.y * 10 * opts.jiggleScale;
        st.womb.vx += endTan.x * 7 * opts.jiggleScale;
        st.womb.vy += endTan.y * 7 * opts.jiggleScale;
    }

    function ejaculate() {
        // allow repeated presses to intensify the effect instead of doing nothing
        st.cum.spurting = Math.min(5.4, Math.max(st.cum.spurting, 0) + (st.cum.spurting > 0 ? 1.35 : 2.2));
        st.cum.spawnAcc = 0;
        st.hymenOver = 0; // release resets all overstretch progress
        st.cervixOver = 0;
        st.wombOver = 0;
        const where = opts.protection ? 'protected' : ((st.pierce && st.d > L + 1.5) ? 'womb' : 'vagina');
        if (where === 'womb') {
            st.cum.wombCount++;
            st.cum.womb = Math.min(opts.wombCapacity, (st.cum.womb || 0) + 0.26 + Math.max(0, st.cum.wombCount - 1) * 0.05);
        } else if (where === 'vagina') {
            st.cum.vagCount++;
            st.cum.vag = Math.min(1.8, (st.cum.vag || 0) + 0.20 + Math.max(0, st.cum.vagCount - 1) * 0.04);
        } else {
            st.cum.condomCount++;
            st.cum.condom = Math.min(4.5, (st.cum.condom || 0) + 0.06 + Math.max(0, st.cum.condomCount - 1) * 0.02);
        }
        // a couple of body shudders
        st.jig.vx += stations[0].tan.x * 8 * opts.jiggleScale;
        st.jig.vy += stations[0].tan.y * 8 * opts.jiggleScale;
        emit('cum', { where });
    }

    // The one and only transition from an intact, retained load to open flow.
    // This is called when scene-persistent event tracking reports a break, not
    // when the user presses the release button again. Reuse the SAME counters,
    // pool, spurting particles, and leak target as ordinary unprotected releases.
    function ruptureProtection() {
        opts.protection = false;
        const fluid = st.cum;
        const loads = Math.max(0, fluid.condomCount || 0);
        const stored = Math.max(0, fluid.condom || 0);
        if (loads === 0 && stored <= 0) return { loads: 0, where: null };
        const where = st.pierce && st.d > L + 1.5 ? 'womb' : 'vagina';
        const totalSteps = Math.max(1, loads || 0);
        const storedShare = stored / totalSteps;
        fluid.condom = 0;
        fluid.condomCount = 0;
        fluid.leak = 0;
        fluid.spawnAcc = 0;
        fluid.particles = [];
        fluid.releaseQueue = {
            where,
            totalSteps,
            remainingSteps: totalSteps,
            countedLoads: loads,
            storedShare,
            burstInterval: 0.16,
            burstClock: 0.16,
        };
        // Re-arm the ordinary finish animation from its beginning. The queued
        // transfer below feeds the normal reservoirs over a few short bursts
        // instead of teleporting to the final pooled state immediately.
        fluid.spurting = Math.max(0.2, Math.min(5.4, 1.85 + 0.30 * Math.max(0, totalSteps - 1)));
        st.jig.vx += stations[0].tan.x * 3 * opts.jiggleScale;
        st.jig.vy += stations[0].tan.y * 3 * opts.jiggleScale;
        emit('protection-fluid-released', { loads, where, stored });
        return { loads, where, stored };
    }

    // Intentionally tiny, independent from the full-release volume and count.
    // Threshold crossing is an abstract game mechanic, not a medical model.
    function registerPreFluid(depth = 0, reachedDepth = false) {
        const fluid = st.cum;
        if (fluid.preFluid?.active) return false;
        fluid.preFluid = {
            active: true, deep: !!reachedDepth, atDepth: depth,
            animation: 1.5, transferred: false,
        };
        if (reachedDepth) {
            fluid.preFluid.atDepth = depth;
        } else {
            fluid.vag = Math.min(1.8, fluid.vag + 0.018);
        }
        emit('pre-fluid-visual', { depth, deep: !!reachedDepth });
        return true;
    }
    function advancePreFluid(depth = 0) {
        const fluid = st.cum;
        if (!fluid.preFluid?.active || fluid.preFluid.deep) return false;
        fluid.preFluid.deep = true;
        fluid.preFluid.atDepth = depth;
        fluid.preFluid.animation = 1.5;
        fluid.preFluid.transferred = false;
        fluid.vag = Math.max(0, fluid.vag - 0.018);
        emit('pre-fluid-visual-depth', { depth });
        return true;
    }

    function resetFluids() {
        st.cum = { vag: 0, womb: 0, leak: 0, spurting: 0, spawnAcc: 0, particles: [], vagCount: 0, wombCount: 0, condom: 0, condomCount: 0, preFluid: { active: false, deep: false, atDepth: 0, animation: 0, transferred: false }, releaseQueue: null };
    }

    function step(dt) {
        st.time += dt;

        // Shaft depth spring (gives the pointer motion weight)
        const k = opts.shaftStiffness, c = opts.shaftDamping;

        // ================= resistance model =================
        st.hymen.present = opts.virgin && !st.hymen.broken;
        const virginMul = st.hymen.present ? 1.6 : 1;
        const tight = opts.tightness * (1 - st.loose * 0.75) * virginMul;

        // Grip: every rib of wall in contact drags on the shaft — the deeper
        // you are, the more wall is gripping, the harder every motion gets.
        // A womb-slam (forcing) is his full weight: resistance mostly yields.
        const resistMul = st.forcing ? 0.06 : 1;
        const contactFrac = Math.max(0, Math.min(1, st.d / L));
        const grip = contactFrac * tight * resistMul;
        let pull = k * (st.dTarget - st.d);
        if (pull > 0) pull /= (1 + 1.6 * grip); // pushing deeper takes real effort
        let force = pull;
        let extraDrag = 0; // barrier-overstretch molasses (hymen/cervix/womb)
        if (st.forcing && st.dTarget > st.d) force += 500;

        // 1) Entry gate: the lips resist the first push of the scene.
        //    A breakaway: pushing builds strain, strain weakens the gate, pop.
        //    (A slip/squeeze "teasing stage" variant was tried and parked;
        //    it is not part of this build.)
        if (!st.entrancePopped) {
            const inZone = st.d > -0.8 && st.d < 1.6;
            const pushing = st.dTarget > st.d + 0.3;
            if (inZone && pushing) {
                const push = k * (st.dTarget - st.d);
                const gateHold = Math.max(0, 240 * opts.tightness * virginMul * (1 - st.gate.strain)) * resistMul;
                force -= gateHold;
                st.gate.strain = Math.min(1, st.gate.strain + push * dt / (900 * opts.tightness * virginMul));
                st.gate.strainSec += dt;
                st.gate.wasActive = true;
            } else if (st.gate.wasActive && st.dTarget < st.d - 1) {
                st.gate.wasActive = false;
                st.gate.strain *= 0.5;
                emit('gate_retreat', {});
            }
            if (st.d >= 1.6) {
                st.entrancePopped = true;
                emit('gate_pop', { strainSec: st.gate.strainSec });
                st.jig.vx += stations[0].tan.x * 4 * opts.jiggleScale;
                st.jig.vy += stations[0].tan.y * 4 * opts.jiggleScale;
            }
        }

        // 2) Hymen (virgin mode): a membrane just inside the entrance. It
        //    overstretches to 25% depth — deliciously draggy the deeper it
        //    stretches — and tears after 10 trips to its limit (the counter
        //    resets when he cums). Armed break / womb slam still go through.
        if (st.hymen.present) {
            const HX = 2.4;
            if (st.d > HX) {
                const over = st.d - HX;
                // live stretch follows the tip (springs back when he retreats)
                st.hymen.stretch += (Math.min(HY_RANGE, over) - st.hymen.stretch) * Math.min(1, dt * 14);
                force -= 450 * opts.tightness * over * resistMul;
                extraDrag += 150 * Math.min(1, over / HY_RANGE) * opts.tightness * resistMul;
                st.hymen.strainSec += dt;
                // overstretch counting: reaching the limit counts once per push
                if (st.d >= HY_MAX - 0.15) {
                    if (!hymenAtLimit && st.dVel > 1) {
                        hymenAtLimit = true;
                        st.hymenOver++;
                        emit('hymen_strain', { count: st.hymenOver });
                    }
                } else if (st.d < HY_MAX - 1.2) {
                    hymenAtLimit = false;
                }
                const overworn = st.hymenOver >= 10;
                if (st.breakArmed || st.forcing || overworn) {
                    if (st.breakArmed) st.breakArmed = false;
                    st.hymen.broken = true;
                    st.hymen.present = false;
                    emit('hymen_break', {
                        method: st.forcing ? 'thrust'
                            : overworn ? 'overstretch'
                                : st.dVel > 30 ? 'thrust' : 'pressure',
                        strainSec: st.hymen.strainSec,
                    });
                    if (opts.blood) st.blood = 1;
                    st.jig.vx += stations[0].tan.x * 10 * opts.jiggleScale;
                    st.jig.vy += stations[0].tan.y * 10 * opts.jiggleScale;
                    st.womb.vx += endTan.x * 3 * opts.jiggleScale;
                    st.womb.vy += endTan.y * 3 * opts.jiggleScale;
                } else if (st.d > HY_MAX) {
                    // hard cap: stretched to its absolute limit, it holds
                    st.d = HY_MAX;
                    if (st.dVel > 0) st.dVel *= -0.2;
                }
            } else {
                st.hymen.stretch *= Math.max(0, 1 - 3 * dt);
            }
        }

        // 3) Frontier: heavy resistance past the deepest-ever point; sustained
        //    pressure creeps it forward, wiggling near it works much faster.
        if (st.d > st.maxReach && st.d > 1.0) {
            const depthFactor = 0.35 + 0.65 * (st.maxReach / L);
            force -= 260 * tight * depthFactor * Math.min(1, (st.d - st.maxReach) / 1.5) * resistMul;
            if (st.dTarget > st.d) {
                const wiggle = (st.time - strokeStartTime < 1.2) ? 2.2 : 1;
                st.maxReach = Math.min(st.d + 0.01,
                    st.maxReach + dt * 1.1 * wiggle / (depthFactor * Math.max(0.4, tight)));
                st.strainAcc += dt;
            }
            // a truly overpowering push registers the ground it took
            st.maxReach = Math.max(st.maxReach, st.d - 1.8);
        }

        // 4) Slow warm-up: time spent inside gradually loosens her
        if (st.inside) st.loose = Math.min(1, st.loose + dt * 0.0012);

        // --- Balls: floppy, and the vulva is a hard wall they can't pass ---
        const ballsAnchor = st.d - BALLS_AT;          // where rigid attachment wants them
        const ballsLimit = -BALLS_R * 0.85;           // lips plane: balls-deep = pressed + squashed
        const ballsTarget = Math.min(ballsAnchor, ballsLimit);
        const bAcc = 90 * (ballsTarget - st.ballsArc) - 7 * st.ballsVel;
        st.ballsVel += bAcc * dt;
        st.ballsArc += st.ballsVel * dt;
        if (st.ballsArc > ballsLimit) {
            if (st.ballsVel > 9 && st.time - lastSlapT > 0.15) {
                lastSlapT = st.time;
                emit('slap', { speed: st.ballsVel });
                st.jig.vx += stations[0].tan.x * 2.5 * opts.jiggleScale;
                st.jig.vy += stations[0].tan.y * 2.5 * opts.jiggleScale;
            }
            st.ballsArc = ballsLimit;
            st.ballsVel *= -0.25;
        }
        // squash against the lips when the shaft drives past what they can follow
        const press = Math.max(0, ballsAnchor - ballsLimit);
        const squashTarget = Math.min(1, press / 4);
        st.ballsSquash += (squashTarget - st.ballsSquash) * Math.min(1, dt * 12);
        // perpendicular flop: swings against shaft motion, settles back
        const pAcc = -55 * st.ballsPerp - 6 * st.ballsPerpVel - st.dVel * 0.5;
        st.ballsPerpVel += pAcc * dt;
        st.ballsPerp = Math.max(-2.2, Math.min(2.2, st.ballsPerp + st.ballsPerpVel * dt));

        // blood fades
        if (st.blood > 0) st.blood = Math.max(0, st.blood - dt * 0.012);

        // womb-slam: claim the ground taken, cum the moment we arrive
        if (st.forcing) {
            st.forcingT += dt;
            st.maxReach = Math.max(st.maxReach, st.d);
            if (st.d >= Math.min(L + 4.5, MAX_PIERCED - 0.6) || st.forcingT > 6) {
                st.forcing = false;
                st.forcingT = 0;
                ejaculate();
            }
        }
        // ====================================================

        if (!st.pierce) {
            // cervix: firm wall that can be forced to flex/overstretch inward
            const ov = st.d - (L - 1.0);
            if (ov > 0 && st.dTarget > st.d) force -= ov * 240 * resistMul;
            const oster = st.d - MAX_NORMAL;
            if (oster > 0) {
                force -= 420 * opts.tightness * oster * resistMul;
                extraDrag += 130 * Math.min(1, oster / Math.max(0.5, CV_MAX - MAX_NORMAL)) * opts.tightness * resistMul;
            }
            if (st.d >= CV_MAX - 0.15) {
                if (!cervixAtLimit && st.dVel > 1) {
                    cervixAtLimit = true;
                    st.cervixOver++;
                    emit('cervix_strain', { count: st.cervixOver });
                    if (st.cervixOver >= OVER_BREAKS) {
                        setPierce(true);
                        emit('cervix_breach', { hits: st.cervixHits });
                        st.jig.vx += stations[0].tan.x * 10 * opts.jiggleScale;
                        st.jig.vy += stations[0].tan.y * 10 * opts.jiggleScale;
                        st.womb.vx += endTan.x * 6 * opts.jiggleScale;
                        st.womb.vy += endTan.y * 6 * opts.jiggleScale;
                    }
                }
            } else if (st.d < CV_MAX - 1.2) {
                cervixAtLimit = false;
            }
        } else if (st.pierce && !st.wombBroken) {
            // womb far wall: stretches past the tip-limit, counts trips
            const ov = st.d - WOMB_TIP_LIMIT;
            if (ov > 0) {
                force -= 420 * opts.tightness * ov * resistMul;
                extraDrag += 130 * Math.min(1, ov / Math.max(0.5, WT_MAX - WOMB_TIP_LIMIT)) * opts.tightness * resistMul;
            }
            if (st.d >= WT_MAX - 0.15) {
                if (!wombAtLimit && st.dVel > 1) {
                    wombAtLimit = true;
                    st.wombOver++;
                    emit('womb_strain', { count: st.wombOver });
                    if (st.wombOver >= OVER_BREAKS) {
                        st.wombBroken = true;
                        updateMaxDepth();
                        emit('womb_breach', {});
                        st.jig.vx += stations[0].tan.x * 10 * opts.jiggleScale;
                        st.jig.vy += stations[0].tan.y * 10 * opts.jiggleScale;
                        st.womb.vx += endTan.x * 7 * opts.jiggleScale;
                        st.womb.vy += endTan.y * 7 * opts.jiggleScale;
                    }
                }
            } else if (st.d < WT_MAX - 1.2) {
                wombAtLimit = false;
            }
        }
        if (st.pierce && !poppedThrough && st.d > L - 1.0 && st.d < L + 1.2 && st.dTarget > st.d) {
            // pushing through the cervix: strong resistance until it gives.
            // An armed break is a determined stroke — the mouth mostly yields
            // (otherwise high tightness can make the armed break unreachable).
            force -= (st.d - (L - 1.0)) * 300 * resistMul * (st.breakArmed ? 0.35 : 1);
        }
        st.dVel += force * dt;
        // rib-by-rib drag (+ hymen molasses): implicit, stays stable
        st.dVel /= (1 + (c + 90 * grip + extraDrag) * dt);
        const prevD = st.d;
        st.d += st.dVel * dt;
        if (st.d > st.maxDepth) { st.d = st.maxDepth; if (st.dVel > 0) st.dVel *= -0.25; }
        if (st.d < MIN_DEPTH) { st.d = MIN_DEPTH; st.dVel = 0; }
        st.depthNorm = Math.max(0, Math.min(1.6, st.d / MAX_NORMAL));

        // Insert / withdraw / deep / cervix-pop events
        const wasInside = st.inside;
        st.inside = st.d > 0.5;
        if (st.inside && !wasInside) emit('insert', { speed: st.dVel });
        if (!st.inside && wasInside) emit('withdraw', {});
        if (!st.pierce && st.d > L - 1.0 && prevD <= L - 1.0) {
            if (st.dVel > 14) {
                st.cervixHits++;
                emit('deep', { speed: st.dVel, count: st.cervixHits });
                st.womb.vx += endTan.x * st.dVel * 0.14 * opts.jiggleScale;
                st.womb.vy += endTan.y * st.dVel * 0.14 * opts.jiggleScale;
            }
            // the cervix is unbreakable — unless a break was armed for this stroke
            if (st.breakArmed) {
                st.breakArmed = false;
                setPierce(true);
                emit('cervix_breach', { hits: st.cervixHits });
                st.jig.vx += stations[0].tan.x * 10 * opts.jiggleScale;
                st.jig.vy += stations[0].tan.y * 10 * opts.jiggleScale;
                st.womb.vx += endTan.x * 6 * opts.jiggleScale;
                st.womb.vy += endTan.y * 6 * opts.jiggleScale;
            }
        }
        // womb depths: unbreakable too — the tip presses its far wall until armed
        if (st.pierce && !st.wombBroken && st.d > WOMB_TIP_LIMIT - 0.5 && prevD <= WOMB_TIP_LIMIT - 0.5) {
            st.womb.vx += endTan.x * Math.max(0, st.dVel) * 0.1 * opts.jiggleScale;
            st.womb.vy += endTan.y * Math.max(0, st.dVel) * 0.1 * opts.jiggleScale;
            if (st.breakArmed) {
                st.breakArmed = false;
                st.wombBroken = true;
                updateMaxDepth();
                emit('womb_breach', {});
                st.jig.vx += stations[0].tan.x * 10 * opts.jiggleScale;
                st.jig.vy += stations[0].tan.y * 10 * opts.jiggleScale;
                st.womb.vx += endTan.x * 7 * opts.jiggleScale;
                st.womb.vy += endTan.y * 7 * opts.jiggleScale;
            }
        }
        if (st.pierce && !poppedThrough && st.d > L + 1.2) {
            poppedThrough = true;
            emit('cervix_pop', {});
            st.womb.vx += endTan.x * 5 * opts.jiggleScale;
            st.womb.vy += endTan.y * 5 * opts.jiggleScale;
        }
        if (st.pierce && poppedThrough && st.d < L - 1.5) poppedThrough = false;

        // Cervix/womb pushed by deep contact
        const cForced = Math.max(0, st.d - (L - 1.2)) * (st.pierce ? 0.55 : 1.1);
        const cAcc = 130 * (cForced - st.cervixOff) - 9 * st.cervixVel;
        st.cervixVel += cAcc * dt; st.cervixOff += st.cervixVel * dt;

        // Stroke detection (reversals with hysteresis)
        const v = st.dVel;
        const newDir = v > 1.5 ? 1 : v < -1.5 ? -1 : dir; // lower threshold: gripped strokes are slow
        if (newDir !== dir && dir !== 0) {
            travel = Math.abs(st.d - lastReversalD);
            // low threshold: tiny wiggles/tip-teasing count as strokes too
            // (kept just above the spring's own settling overshoot)
            if (travel > 1.2) {
                if (dir === 1) { // was moving inward, now out: one stroke completed
                    const dur = Math.max(0.05, st.time - strokeStartTime);
                    emit('stroke', {
                        peak: Math.max(0, Math.min(1.6, st.d / MAX_NORMAL)),
                        travel: travel / MAX_NORMAL,
                        speed: travel / dur,
                        zone: !st.pierce
                            ? (st.d > MAX_NORMAL - 0.3 ? 'cervix' : 'canal')
                            : (st.d > L + 1.5 ? (st.wombBroken ? 'womb' : 'wombTip') : 'canal'),
                    });
                    st.loose = Math.min(1, st.loose + travel * 0.0045); // strokes work her open
                } else if (dir === -1) { // was pulling out, now pushing back: one pull-back completed
                    const dur = Math.max(0.05, st.time - strokeStartTime);
                    emit('outstroke', {
                        from: Math.max(0, Math.min(1.6, lastReversalD / MAX_NORMAL)),
                        to: Math.max(0, Math.min(1.6, st.d / MAX_NORMAL)),
                        travel: travel / MAX_NORMAL,
                        speed: travel / dur,
                    });
                }
                lastReversalD = st.d;
                strokeStartTime = st.time;
                const imp = Math.min(1.4, Math.abs(v) * 0.02) * opts.jiggleScale;
                st.jig.vx += stations[0].tan.x * imp * 8;
                st.jig.vy += stations[0].tan.y * imp * 8;
            }
        }
        if (dir === 0 && newDir !== 0) { lastReversalD = st.d; strokeStartTime = st.time; }
        dir = newDir;

        // Body jiggle spring
        st.jig.vx += (-30 * st.jig.x - 4 * st.jig.vx) * dt;
        st.jig.vy += (-30 * st.jig.y - 4 * st.jig.vy) * dt;
        st.jig.x += st.jig.vx * dt; st.jig.y += st.jig.vy * dt;

        // Womb jiggle spring (softer, slower than the body)
        st.womb.vx += (-45 * st.womb.x - 4.5 * st.womb.vx) * dt;
        st.womb.vy += (-45 * st.womb.y - 4.5 * st.womb.vy) * dt;
        st.womb.x += st.womb.vx * dt; st.womb.y += st.womb.vy * dt;

        // --- Fluids ---
        const cum = st.cum;
        if (cum.preFluid?.animation > 0) cum.preFluid.animation = Math.max(0, cum.preFluid.animation - dt);
        if (cum.preFluid?.deep && !cum.preFluid.transferred && cum.preFluid.animation <= 0) {
            cum.preFluid.transferred = true;
            cum.womb = Math.min(opts.wombCapacity, cum.womb + 0.018);
        }
        if (cum.releaseQueue) {
            const rq = cum.releaseQueue;
            rq.burstClock += dt;
            while (rq.remainingSteps > 0 && rq.burstClock >= rq.burstInterval) {
                rq.burstClock -= rq.burstInterval;
                const performed = rq.totalSteps - rq.remainingSteps;
                const countAsLoad = performed < rq.countedLoads;
                if (rq.where === 'womb') {
                    if (countAsLoad) {
                        cum.wombCount++;
                        cum.womb = Math.min(opts.wombCapacity, cum.womb + 0.26 + Math.max(0, cum.wombCount - 1) * 0.05);
                    }
                    cum.womb = Math.min(opts.wombCapacity, cum.womb + rq.storedShare * 0.65);
                } else {
                    if (countAsLoad) {
                        cum.vagCount++;
                        cum.vag = Math.min(1.8, cum.vag + 0.20 + Math.max(0, cum.vagCount - 1) * 0.04);
                    }
                    cum.vag = Math.min(1.8, cum.vag + rq.storedShare * 0.90);
                }
                cum.spurting = Math.min(5.4, Math.max(cum.spurting, 2.2 + 0.20 * Math.max(0, rq.totalSteps - rq.remainingSteps - 1)));
                rq.remainingSteps--;
            }
            if (rq.remainingSteps <= 0) cum.releaseQueue = null;
        }
        if (cum.spurting > 0) {
            cum.spurting -= dt;
            cum.spawnAcc += dt;
            while (cum.spawnAcc > 0.05) {
                cum.spawnAcc -= 0.05;
                cum.particles.push({
                    a: Math.max(0.5, st.d - 0.8),
                    v: 24 + Math.random() * 12,
                    r: 0.45 + Math.random() * 0.4,
                    womb: st.pierce && st.d > L + 1.5,
                });
            }
        }
        for (let i = cum.particles.length - 1; i >= 0; i--) {
            const p = cum.particles[i];
            p.a += p.v * dt;
            p.v *= (1 - 2.2 * dt);
            let done = false;
            if (opts.protection) {
                if (p.a > 1.1 || p.v < 3) {
                    cum.condom = Math.min(4.5, (cum.condom || 0) + 0.015);
                    done = true;
                }
            } else {
                // a sealed hymen blocks fluid too: cum pools in the small
                // vestibule before the membrane and can't go further
                if (st.hymen.present && p.a > 2.4 + st.hymen.stretch) {
                    cum.vag = Math.min(0.35, cum.vag + 0.03);
                    cum.particles.splice(i, 1);
                    continue;
                }
                if (p.womb) {
                    // ~0.75 per load; the cap is configurable up to 10x capacity
                    if (p.a > L + 3.5) { cum.womb = Math.min(opts.wombCapacity, cum.womb + 0.018); done = true; }
                } else if (p.a > L - 0.6 || p.v < 3) {
                    // ~0.9 per load, cap 1.8
                    cum.vag = Math.min(1.8, cum.vag + 0.022); done = true;
                    st.loose = Math.min(1, st.loose + 0.0035); // cum is lube
                }
            }
            if (done) cum.particles.splice(i, 1);
        }
        // a full vagina seeps a little through the cervix — and even an
        // intact hymen lets a thin trickle past (~3% womb per load, slowly)
        if (!opts.protection) {
            if (st.hymen.present) {
                const seepCap = Math.min(0.12, 0.03 * cum.vagCount);
                if (cum.vag > 0.15 && cum.womb < seepCap) cum.womb = Math.min(seepCap, cum.womb + dt * 0.004);
            } else if (cum.vag > 0.55 && cum.womb < 0.3) {
                cum.womb = Math.min(0.3, cum.womb + dt * 0.012);
            }
            // ...an overfilled womb backflows out through the cervix...
            if (cum.womb > 1.15) cum.vag = Math.min(1.8, cum.vag + dt * 0.06);
        }
        // ...and an overfilled vagina leaks out of the entrance
        const leakTarget = opts.protection
            ? 0
            : (st.hymen.present
                ? Math.max(0, Math.min(1, (cum.vag - 0.12) * 3.5)) // tiny vestibule overflows readily
                : Math.max(0, Math.min(1, (cum.vag - 0.6) * 1.6)));
        cum.leak += (leakTarget - cum.leak) * Math.min(1, dt * 2);
        if (cum.leak > 0.3) cum.vag = Math.max(0, cum.vag - dt * 0.012); // slow drain while leaking

        // Walls: springs + neighbor coupling + shaft collision.
        // Rest closure: an unworked canal is a shut slit — the walls press
        // together (and hug the shaft where it is) until she's gradually
        // worked open. Tightness and virginity slow the opening; pooled cum
        // wedges the walls apart a little.
        const open = Math.min(1, (st.loose * 1.5 + st.cum.vag * 0.2) / (opts.canalTightness * virginMul));
        const closeMul = 0.08 + 0.92 * open;
        const breathe = 1 + 0.03 * Math.sin(st.time * 1.2);
        for (let i = 0; i < stations.length; i++) {
            const s = stations[i];
            const wl = stations[i - 1], wr = stations[i + 1];
            const effRest = s.rest * closeMul;
            for (const side of ['t', 'b']) {
                const w = side === 't' ? s.wt : s.wb;
                const wv = side === 't' ? s.vt : s.vb;
                let acc = -opts.wallStiffness * w - opts.wallDamping * wv;
                const lw = wl ? (side === 't' ? wl.wt : wl.wb) : w;
                const rw = wr ? (side === 't' ? wr.wt : wr.wb) : w;
                acc += opts.neighborStiffness * (lw + rw - 2 * w);
                let nv = wv + acc * dt;
                let nw = w + nv * dt;
                // Collision with shaft
                if (s.s <= st.d) {
                    const need = shaftRadius(st.d - s.s) + 0.12 - effRest;
                    if (nw < need) {
                        nv += (need - nw) * 26;            // push impulse -> bulge wave
                        nv += Math.abs(st.dVel) * 0.06;    // drag from shaft motion
                        nw = need;                          // hard no-interpenetration clamp
                    }
                }
                if (side === 't') { s.wt = nw; s.vt = nv; } else { s.wb = nw; s.vb = nv; }
            }
            s.gapT = Math.max(0.12, effRest * breathe + s.wt);
            s.gapB = Math.max(0.12, effRest * breathe + s.wb);
        }

        emit('move', { depthNorm: st.depthNorm, vel: st.dVel / MAX_NORMAL, inside: st.inside });
    }

    // Renderer and summaries may need direct access to the current centerline projection.
    // Keep a stable reference on state so render branches triggered by actions like Cum/Womb
    // can sample particles without crashing the whole canvas.
    st.spinePoint = spinePoint;

    updateMaxDepth(); // fresh scene: ceiling includes the overstretch zone

    let acc = 0;
    function update(dt) {
        dt = Math.min(dt, 1 / 30);
        acc += dt;
        const h = 1 / 120;
        while (acc >= h) { step(h); acc -= h; }

        // Rebuild spine samples for the renderer (tip -> base)
        const throb = st.cum.spurting > 0;
        const hyPress = st.hymen.present ? Math.min(1, st.hymen.stretch / HY_RANGE) : 0;
        st.spine.length = 0;
        for (let u = 0; u <= POLY_LEN; u += 1.0) {
            let r = shaftRadius(u);
            if (throb) r *= 1 + 0.05 * Math.sin(st.time * 30) * Math.max(0, 1 - u * 0.12);
            if (hyPress > 0) r *= 1 - 0.13 * hyPress * Math.max(0, 1 - u * 0.25); // membrane squeezing the glans
            st.spine.push({ pos: spinePoint(st.d - u), r, u });
        }
        const bc = spinePoint(st.ballsArc);
        st.ballsCenter = {
            x: bc.x + ballsPerpDir.x * st.ballsPerp,
            y: bc.y + ballsPerpDir.y * st.ballsPerp,
        };
    }

    function setOptions(patch) { Object.assign(opts, patch); }

    return {
        state: st, update, setTarget, nudgeTarget, on, setOptions,
        setPierce, ejaculate, ruptureProtection, registerPreFluid, advancePreFluid,
        slamToWomb, armBreak, resetFluids, resetScene, setVirgin,
        SCENE_W, SCENE_H,
    };
}

export { SCENE_W, SCENE_H };
