// Top-down POV missionary renderer for the X-ray scene.
// Composition traced from reference: her torso vertical in the center (on her
// back on a sheet), narrow waist flaring to wide hips/butt, thighs spread to
// the bottom corners, shaft entering from the bottom edge (viewer's POV).
// The X-ray is a glowing-rimmed window on the lower belly showing a ribbed
// (rugae) canal tube and a hollow womb pouch with curled cervix lips.
// Fluids are liquid: pooling levels with sloshing surfaces, splash droplets
// inside the womb, drips running down the shaft and a growing puddle.
// Reads sim state (plus its own cosmetic droplet particles).

import { SCENE_W, SCENE_H } from './sim.js';

const PAL = {
    sheet: '#e4e5ee',
    sheetCrease: 'rgba(150, 152, 185, 0.45)',
    skin: '#f7cdd2',
    skinLine: '#b25a72',
    innerShadow: 'rgba(160, 70, 95, 0.14)',
    crease: 'rgba(178, 90, 114, 0.5)',
    windowBg: '#eba3b1',
    windowRim: 'rgba(255, 240, 244, 0.85)',
    band: '#e07d9d',
    cavity: '#7e2540',
    mucosa: '#d76a8d',
    rib: '#ec93ac',
    womb: '#f0a9b8',
    wombInterior: '#6d2038',
    cervix: '#c4577d',
    cervixLine: '#8e2f52',
    shaft: '#f3bfa9',
    shaftLine: '#b06550',
    glans: '#eb9f9d',
    glansLine: '#c96b62',
    highlight: 'rgba(255,255,255,0.45)',
    cum: 'rgba(252, 250, 255, 0.92)',
};

function smoothPath(ctx, points, cont = false) {
    if (points.length < 2) return;
    if (cont) ctx.lineTo(points[0].x, points[0].y);
    else ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
        const mx = (points[i].x + points[i + 1].x) / 2;
        const my = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
}

function mix(a, b, t) {
    return a + (b - a) * t;
}

export function createMissionaryRenderer(canvas) {
    let showXray = true;
    let protection = false;
    let protectionBroken = false;
    let tearStartedAt = null;
    const ctx = canvas.getContext('2d');
    let scale = 1, ox = 0, oy = 0;

    // renderer-local cosmetic fluid particles
    let lastT = performance.now();
    const wombDrops = []; // womb-local coords {x,y,vx,vy}
    const leakDrops = []; // scene coords {x,y,vy}
    const responseDrops = []; // short-lived decorative spray, separate from release fluid
    let responseSpawnAcc = 0;
    let leakAcc = 0, puddle = 0;
    const disp = { contact: 0, pelvisX: 0, pelvisY: 0, thighL: 0, thighR: 0, open: 0, entranceOpen: 0 };

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        scale = Math.min(canvas.width / SCENE_W, canvas.height / SCENE_H);
        ox = (canvas.width - SCENE_W * scale) / 2;
        oy = (canvas.height - SCENE_H * scale) / 2;
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    function screenToScene(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return {
            x: ((clientX - rect.left) * dpr - ox) / scale,
            y: ((clientY - rect.top) * dpr - oy) / scale,
        };
    }

    // X-ray window (belly cutout) — expands as the womb bloats so the
    // growth isn't clipped away
    const WIN = { x: 49, y: 27 };
    let winRx = 12, winRy = 16.5, winShift = 0;
    function windowPath() {
        ctx.beginPath();
        // winShift slides the window up toward a lengthened canal's womb,
        // keeping the entrance edge anchored
        ctx.ellipse(WIN.x, WIN.y - winShift, winRx, winRy, 0, 0, Math.PI * 2);
    }

    // Torso: a thin, nearly straight column that widens only slightly at the
    // navel/hip level, then runs straight down and disappears BEHIND the
    // thighs — it never closes into a rounded bottom (that closing curve is
    // what read as a floating fruit). `bulge` widens the belly region when
    // the womb is pumped overfull.
    function torsoPath(bulge = 0) {
        const b = bulge;
        ctx.beginPath();
        ctx.moveTo(36.7 - b * 0.45, -10);
        ctx.quadraticCurveTo(37.2 - b * 0.8, -1.5, 38.4 - b * 0.95, 10.5);
        ctx.quadraticCurveTo(36.7 - b, 18.5, 35.5 - b * 0.72, 25.5);
        ctx.quadraticCurveTo(35.0, 33.2, 35.6, 40.5);
        ctx.lineTo(36.0, 52.4);
        ctx.lineTo(63.4, 52.4);
        ctx.lineTo(64.0, 40.5);
        ctx.quadraticCurveTo(64.6, 33.2, 64 + b * 0.72, 25.5);
        ctx.quadraticCurveTo(62.8 + b, 18.5, 61.1 + b * 0.95, 10.5);
        ctx.quadraticCurveTo(62.1 + b * 0.75, -1.5, 63.0 + b * 0.45, -10);
        ctx.closePath();
    }

    // The tear geometry is always generated from the *real* moving tip.
    // Both the film cutout and its two opened edges share the same coordinates.
    // No separate overlay is ever drawn at the entrance in non-X-ray mode.
    function protectionTearGeometry(spine, now) {
        if (!protectionBroken || spine.length < 5) return null;
        const tip = spine[1].pos;
        const a = spine[0].pos, b = spine[3].pos;
        const dx = b.x - a.x, dy = b.y - a.y;
        const norm = Math.hypot(dx, dy) || 1;
        const t = { x: dx / norm, y: dy / norm };
        const n = { x: -t.y, y: t.x };
        const ms = tearStartedAt === null ? 999 : Math.max(0, now - tearStartedAt);
        // The two film edges separate OUTWARDS from the center; final opening
        // is a crisp V instead of the soft U-like notch of v0.1.18.
        const phase = Math.min(1, ms / 230);
        const opened = 1 - Math.pow(1 - phase, 3);
        const halfW = 0.025 + 1.23 * opened;
        const pt = (along, side) => ({
            x: tip.x + t.x * along + n.x * side,
            y: tip.y + t.y * along + n.y * side,
        });
        return {
            leftTop: pt(-0.72, halfW), rightTop: pt(-0.72, -halfW),
            leftBend: pt(0.12, halfW * 0.80), rightBend: pt(0.12, -halfW * 0.80),
            apex: pt(1.02, 0),
            leftFlap: pt(-0.32, halfW + 0.18 + 0.34 * opened),
            rightFlap: pt(-0.32, -(halfW + 0.18 + 0.34 * opened)),
            opened,
        };
    }

    function traceProtectionCutout(g) {
        // Strictly angular, open V-shaped cutout in the translucent film.
        // Even-odd filling leaves the actual shaft pigment showing beneath it.
        ctx.moveTo(g.leftTop.x, g.leftTop.y);
        ctx.lineTo(g.leftBend.x, g.leftBend.y);
        ctx.lineTo(g.apex.x, g.apex.y);
        ctx.lineTo(g.rightBend.x, g.rightBend.y);
        ctx.lineTo(g.rightTop.x, g.rightTop.y);
        ctx.closePath();
    }

    function drawProtectionTear(g) {
        // Straight edges meeting at a sharp apex; small hard bends at the two
        // shoulders make the separated film lips read as physically split.
        ctx.beginPath();
        ctx.moveTo(g.leftFlap.x, g.leftFlap.y);
        ctx.lineTo(g.leftTop.x, g.leftTop.y);
        ctx.lineTo(g.leftBend.x, g.leftBend.y);
        ctx.lineTo(g.apex.x, g.apex.y);
        ctx.moveTo(g.rightFlap.x, g.rightFlap.y);
        ctx.lineTo(g.rightTop.x, g.rightTop.y);
        ctx.lineTo(g.rightBend.x, g.rightBend.y);
        ctx.lineTo(g.apex.x, g.apex.y);
        ctx.lineWidth = 0.66;
        ctx.strokeStyle = 'rgba(99,185,246,0.95)';
        ctx.stroke();
        // A thin, slightly darker inner edge is confined to the V, not across
        // the exposed skin. No extra tip outline is painted over the hole.
        ctx.beginPath();
        ctx.moveTo(g.leftBend.x, g.leftBend.y);
        ctx.lineTo(g.apex.x, g.apex.y);
        ctx.lineTo(g.rightBend.x, g.rightBend.y);
        ctx.lineWidth = 0.22;
        ctx.strokeStyle = 'rgba(86,156,215,0.88)';
        ctx.stroke();
    }

    function render(sim) {
        const s = sim.state;
        if (!canvas.width) return;
        const sealed = protection && !protectionBroken;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
        lastT = now;
        const ease = (current, target, speed) => current + (target - current) * Math.min(1, dt * speed);

        // reset cosmetic state after a Discard
        if (s.cum.vagCount === 0 && s.cum.wombCount === 0 && s.cum.vag < 0.01) {
            wombDrops.length = 0;
            leakDrops.length = 0;
            puddle = 0;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = PAL.sheet;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(scale, 0, 0, scale, ox, oy);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Sheet creases
        ctx.strokeStyle = PAL.sheetCrease;
        ctx.lineWidth = 0.35;
        for (const [ax, ay, cx2, cy2, bx, by] of [
            [2, 14, 10, 18, 16, 26], [6, 44, 14, 47, 18, 54],
            [84, 20, 92, 24, 98, 22], [82, 50, 90, 46, 97, 52],
            [24, 4, 30, 8, 28, 14], [72, 2, 76, 8, 82, 12],
        ]) {
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.quadraticCurveTo(cx2, cy2, bx, by);
            ctx.stroke();
        }

        const stations = s.stations;
        const st0 = stations[0];
        const send = stations[stations.length - 1];
        const E = s.entrance, n0 = st0.n, out = s.entranceTan, endT = s.endTan;
        const L = s.L;

        // Womb/cervix anchors
        const shv = 0.8 * s.cervixOff;
        const CR = {
            x: send.pos.x + endT.x * (1.2 + shv) + s.womb.x * 0.5,
            y: send.pos.y + endT.y * (1.2 + shv) + s.womb.y * 0.5,
        };
        const W = {
            x: send.pos.x + endT.x * (6.6 + shv) + s.womb.x,
            y: send.pos.y + endT.y * (6.6 + shv) + s.womb.y,
        };
        const wombFill = s.cum.womb;
        const pierced = s.pierce && s.d > L + 0.5;
        const targetContact = (s.inside || (s.depthNorm || 0) > 0.06) ? 1 : 0;
        disp.contact = ease(disp.contact, targetContact, targetContact > disp.contact ? 9 : 5.5);
        const motionContact = disp.contact;
        const motionVel = motionContact ? Math.min(1, Math.abs(s.dVel) / 24) : 0;
        const targetPelvisSway = Math.max(-0.15, Math.min(0.15, motionContact * (s.jig.x * 0.06 + s.dVel * 0.0018)));
        const targetPelvisBounce = Math.max(-0.22, Math.min(0.22, motionContact * (s.jig.y * 0.06 + s.dVel * 0.0021)));
        disp.pelvisX = ease(disp.pelvisX, targetPelvisSway, 10);
        disp.pelvisY = ease(disp.pelvisY, targetPelvisBounce, 10);
        const pelvisSway = disp.pelvisX;
        const pelvisBounce = disp.pelvisY;
        const responseStrengthNow = Math.max(0, s.response?.strength || 0);
        // The response envelope already contains quick pulses. Do not add a
        // second sine wave: its negative phase cancelled visible leg motion.
        const responseWaveThigh = responseStrengthNow;
        // Reuse the existing thigh transforms during response waves, even when the
        // scene is at rest. In v0.1.22 the 0.26 gain and motionContact gating
        // made the visible movement effectively imperceptible at low depth.
        const responseLegMotion = Math.max(0, Math.min(1, responseWaveThigh));
        const legMotion = Math.max(motionContact, responseLegMotion);
        const targetThighPulse = Math.max(-1.0, Math.min(1.0,
            motionContact * (s.dVel * 0.015) + responseLegMotion * 0.92));
        const targetThighLag = Math.max(-0.68, Math.min(0.68,
            motionContact * (s.jig.x * 0.10 - s.dVel * 0.0038)));
        disp.thighL = ease(disp.thighL, targetThighPulse + targetThighLag * 0.55, 9);
        disp.thighR = ease(disp.thighR, targetThighPulse - targetThighLag * 0.55, 9);
        const thighPulse = (disp.thighL + disp.thighR) * 0.5;
        const thighLag = (disp.thighL - disp.thighR) * 0.5;
        const bellyWave = Math.max(0, Math.min(0.85, motionContact * (Math.abs(s.dVel) * 0.004 + Math.max(0, (s.depthNorm || 0) - 0.2) * 0.16)));
        const targetOpeningSpread = Math.max(0, Math.min(1, (((st0.gapT + st0.gapB) * 0.5) - 1.3) / 2.1 + (s.inside ? 0.2 : 0)));
        disp.open = ease(disp.open, targetOpeningSpread, 11);
        const openingSpread = disp.open;

        // Local entrance morph: stay fully contracted until the shaft actually
        // reaches the folds, then open in real time. After enough work, leave
        // a small lingering openness based on looseness instead of snapping shut.
        const occlusionOpen = Math.max(0, Math.min(1, motionContact * 1.15));
        const depthNorm = Math.max(0, Math.min(1, s.depthNorm || 0));
        const reachNorm = Math.max(0, Math.min(1.5, (s.maxReach || 0) / Math.max(1, s.MAX_NORMAL || 1)));
        const contactThreshold = (s.maxReach || 0) > 0.08 || s.inside || depthNorm > 0.008;
        const hasMadeContact = contactThreshold;
        const activeEntrance = hasMadeContact ? Math.max(0, Math.min(1,
            0.08 + (s.inside ? 0.16 : 0) + depthNorm * 1.05 + motionVel * 0.18 + Math.abs(s.dVel || 0) * 0.0036
        )) : 0;
        const lingerEntrance = hasMadeContact ? Math.max(0, Math.min(0.22,
            (s.loose || 0) * 0.18 + reachNorm * 0.05
        )) : 0;
        const entranceTarget = Math.max(activeEntrance, lingerEntrance);
        disp.entranceOpen = ease(disp.entranceOpen, entranceTarget, activeEntrance > disp.entranceOpen ? 14 : 7.0);
        const lipsOpen = Math.max(0, Math.min(1, disp.entranceOpen));
        // Ensure the visible-shaft clip spans its full width and follows a
        // rounded contact arc; the old narrow, shallow arc cut it almost
        // horizontally, giving the exposed section a box-shaped top.
        const entryShaftRadius = s.shaftRadius(Math.max(0, s.d));
        const edgeW = Math.max(3.20, entryShaftRadius + 0.25, 1.75 + lipsOpen * 2.75);
        const edgeH = 1.25 + lipsOpen * 1.00;
        const edgeY = E.y + 2.05;
        const edgePoints = [];
        for (let i = 0; i <= 36; i++) {
            const t = -1 + 2 * i / 36;
            edgePoints.push({ x: E.x + edgeW * t, y: edgeY - edgeH * Math.sqrt(Math.max(0, 1 - t * t)) });
        }

        const lineFade = Math.max(0, Math.min(1, 1 - lipsOpen * 2.0));
        const rimReveal = Math.max(0, Math.min(1, (lipsOpen - 0.04) / 0.36));

        function drawEntranceDepthUnder() {
            // Underlying opening anatomy. This sits beneath the fold covers and
            // the shaft. Keep the reveal connected under the rim, but avoid the
            // old transparent rectangle/triangle look.
            const reveal = hasMadeContact ? rimReveal : 0;
            if (reveal <= 0.01) return;

            const ovalHalf = 0.40 + reveal * 1.10;
            const ovalCy = E.y - 1.02;
            const ovalRy = 0.60 + reveal * 1.22;
            const rimHalf = 0.78 + reveal * 1.08;
            const rimY = E.y + 0.68;
            const slotHalf = 0.34 + reveal * 0.74;
            const slotY = E.y + 1.08;
            const depthHalf = 0.34 + reveal * 0.44;
            const depthBottomY = E.y + 2.65;

            // Revealed upper oval opening.
            ctx.beginPath();
            ctx.ellipse(E.x, ovalCy, ovalHalf, ovalRy, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(226,188,197,${0.16 + reveal * 0.14})`;
            ctx.fill();

            // Opaque rim directly above the depth opening.
            ctx.beginPath();
            ctx.moveTo(E.x - rimHalf, rimY);
            ctx.quadraticCurveTo(E.x - rimHalf * 0.34, E.y + 0.00, E.x, E.y - 0.22);
            ctx.quadraticCurveTo(E.x + rimHalf * 0.34, E.y + 0.00, E.x + rimHalf, rimY);
            ctx.quadraticCurveTo(E.x + rimHalf * 0.46, E.y + 0.94, E.x, E.y + 1.18);
            ctx.quadraticCurveTo(E.x - rimHalf * 0.46, E.y + 0.94, E.x - rimHalf, rimY);
            ctx.closePath();
            ctx.fillStyle = `rgba(145, 89, 110, ${0.44 + reveal * 0.22})`;
            ctx.fill();

            // Slot/dark opening connected immediately under the rim.
            ctx.beginPath();
            ctx.ellipse(E.x, slotY, slotHalf, 0.16 + reveal * 0.18, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(84, 34, 50, ${0.34 + reveal * 0.24})`;
            ctx.fill();

            // Keep only a tiny connected depth notch under the slot so the old
            // pale rectangle/block is gone.
            ctx.beginPath();
            ctx.moveTo(E.x - (0.10 + reveal * 0.08), slotY + 0.10);
            ctx.quadraticCurveTo(E.x, E.y + 1.56, E.x + (0.10 + reveal * 0.08), slotY + 0.10);
            ctx.quadraticCurveTo(E.x, E.y + 1.88, E.x - (0.10 + reveal * 0.08), slotY + 0.10);
            ctx.closePath();
            ctx.fillStyle = `rgba(107, 60, 74, ${0.08 + reveal * 0.08})`;
            ctx.fill();
        }

        function drawBodyAttachedBorders() {
            // Fixed body-attached contours. Slightly curved and tucked behind the
            // fold artwork; they never animate with the shaft.
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (const side of [-1, 1]) {
                const X = offset => E.x + side * offset;
                ctx.beginPath();
                ctx.moveTo(X(2.02), E.y + 4.42);
                ctx.bezierCurveTo(X(2.00), E.y + 2.34,
                    X(2.82), E.y + 0.40,
                    X(4.08), E.y - 1.88);
                ctx.bezierCurveTo(X(4.88), E.y - 3.18,
                    X(5.92), E.y - 4.36,
                    X(7.02), E.y - 5.10);
                ctx.strokeStyle = PAL.skinLine;
                ctx.lineWidth = 0.74;
                ctx.stroke();
            }
            ctx.restore();
        }

        function drawEntranceSkinCovers() {
            // Two narrow body-connected fold covers that stay closed at rest,
            // then part open on contact. No rectangular skin mask.
            const reveal = hasMadeContact ? rimReveal : 0;
            const shoulderY = E.y - 3.86;
            const baseY = E.y + 1.12;
            const innerGap = 0.05 + reveal * 1.10;
            const innerMid = 0.34 + reveal * 0.34;
            const outerMid = 0.74 + reveal * 0.74;
            const outerBase = 1.16 + reveal * 0.94;
            const shoulderWidth = 0.64 + reveal * 0.24;
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(E.x + side * 0.03, shoulderY + 0.04);
                ctx.quadraticCurveTo(E.x + side * 0.14, E.y - 2.12,
                    E.x + side * innerMid, E.y - 0.76);
                ctx.quadraticCurveTo(E.x + side * outerMid, E.y + 0.08,
                    E.x + side * innerGap, baseY);
                ctx.quadraticCurveTo(E.x + side * outerBase, E.y + 0.98,
                    E.x + side * (shoulderWidth + outerMid * 0.32), shoulderY + 0.54);
                ctx.quadraticCurveTo(E.x + side * shoulderWidth, shoulderY - 0.06,
                    E.x + side * 0.03, shoulderY + 0.04);
                ctx.closePath();
                ctx.fillStyle = PAL.skin;
                ctx.fill();
            }
        }

        function drawEntranceOverlay() {
            const reveal = hasMadeContact ? Math.max(0, Math.min(1, (lipsOpen - 0.02) / 0.80)) : 0;
            const yJunction = E.y - 3.94;
            const stemBottom = E.y + 0.92;
            const forkHalf = 0.46;
            const foldOutline = '#d08d9c'; // opaque match to the former resting Y/V color

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Central Y remains the core outline.
            ctx.beginPath();
            ctx.moveTo(E.x, yJunction - 0.02);
            ctx.lineTo(E.x, stemBottom);
            ctx.moveTo(E.x - forkHalf, yJunction - 0.54);
            ctx.quadraticCurveTo(E.x - 0.14, yJunction - 0.18, E.x, yJunction);
            ctx.moveTo(E.x + forkHalf, yJunction - 0.54);
            ctx.quadraticCurveTo(E.x + 0.14, yJunction - 0.18, E.x, yJunction);
            ctx.strokeStyle = foldOutline;
            ctx.lineWidth = 0.56;
            ctx.stroke();

            // The Y branches continue into the fold bottoms and meet the fixed
            // thigh borders. Use the same lighter, thinner Y-style outline.
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(E.x + side * 0.10, yJunction + 0.08);
                ctx.bezierCurveTo(
                    E.x + side * (0.22 + reveal * 0.10), E.y - 1.92,
                    E.x + side * (0.46 + reveal * 0.48), E.y - 0.40,
                    E.x + side * (0.92 + reveal * 0.82), E.y + 0.88
                );
                ctx.quadraticCurveTo(
                    E.x + side * (1.28 + reveal * 0.48), E.y + 1.06,
                    E.x + side * (1.88 + reveal * 0.14), E.y + 1.08
                );
                ctx.strokeStyle = foldOutline;
                ctx.lineWidth = 0.54;
                ctx.stroke();
            }
            ctx.restore();
        }

        // ==================== body layer (gets the jiggle wobble) ====================
        ctx.save();
        ctx.translate(pelvisSway, pelvisBounce);

        // belly swells when the womb is pumped overfull
        // soft-knee bloat curve: linear to 300%, compressed growth beyond,
        // so a 1000% womb balloons hugely without breaking the geometry
        const wombEff = s.cum.womb <= 3 ? s.cum.womb : 3 + (s.cum.womb - 3) * 0.55;
        const belly = Math.min(1 + wombEff, Math.max(0, s.cum.womb - 0.9) * 1.6) + bellyWave * 0.12;
        // a lengthened canal pushes the womb farther up: extend the window's
        // far end to keep it in frame (entrance edge stays anchored)
        const lenExtra = Math.max(0, (s.L / (s.CANAL_SCALE || 1)) * ((s.CANAL_SCALE || 1) - 1));
        winRx = 12 + wombEff * 0.7;
        winRy = 16.5 + wombEff * 0.9 + Math.min(4, s.cervixOff * 0.5) + lenExtra / 2; // grows when the womb is shoved deep
        winShift = lenExtra / 2;

        // Torso column (drawn first — the thighs overlap it from the front)
        torsoPath(belly);
        ctx.fillStyle = PAL.skin;
        ctx.fill();
        ctx.strokeStyle = PAL.skinLine;
        ctx.lineWidth = 0.9;
        ctx.stroke();

        // Torso side shadows only. IMPORTANT: do not stroke torsoPath() here:
        // its closing bottom edge at y=52.4 created the pale rectangular band
        // visible between the thighs. The original torso/body fill and outline
        // above are unchanged; these are just the two open side shadow strokes.
        ctx.save();
        torsoPath(belly);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(36.7 - belly * 0.45, -10);
        ctx.quadraticCurveTo(37.2 - belly * 0.8, -1.5, 38.4 - belly * 0.95, 10.5);
        ctx.quadraticCurveTo(36.7 - belly, 18.5, 35.5 - belly * 0.72, 25.5);
        ctx.quadraticCurveTo(35.0, 33.2, 35.6, 40.5);
        ctx.lineTo(36.0, 52.4);
        ctx.moveTo(63.0 + belly * 0.45, -10);
        ctx.quadraticCurveTo(62.1 + belly * 0.75, -1.5, 61.1 + belly * 0.95, 10.5);
        ctx.quadraticCurveTo(62.8 + belly, 18.5, 64.0 + belly * 0.72, 25.5);
        ctx.quadraticCurveTo(64.6, 33.2, 64.0, 40.5);
        ctx.lineTo(63.4, 52.4);
        ctx.strokeStyle = PAL.innerShadow;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();

        // Navel (above the x-ray window)
        ctx.beginPath();
        ctx.ellipse(49, 12.4, 0.72, 1.08, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(178, 90, 114, 0.55)';
        ctx.fill();

        // Thighs IN FRONT of the torso: restore the more human, softer v0.1.3 leg silhouettes,
        // while keeping eased motion so contact does not pop or teleport.
        for (const m of [1, -1]) {
            const X = v => 49.5 + m * (v - 49.5);
            const hipX = X(38.2);
            const hipY = 35.6;
            const legLift = legMotion * (0.08 + Math.max(0, -thighPulse) * 0.18 + (m === 1 ? 0.04 : 0));
            const legRot = legMotion * (m * (0.035 + Math.max(-0.04, Math.min(0.04, thighLag * 0.045))) + thighPulse * 0.018);
            const legScaleX = 1 + legMotion * (0.015 + Math.abs(thighLag) * 0.018 + (m === 1 ? 0.008 : 0));
            const legScaleY = 1 - legMotion * (0.012 + Math.abs(thighPulse) * 0.012) + Math.max(0, thighPulse) * 0.015;
            const innerPinch = openingSpread * 0.55 + motionVel * 0.18;
            ctx.save();
            ctx.translate(hipX, hipY);
            ctx.rotate(legRot);
            ctx.scale(legScaleX, legScaleY);
            ctx.translate(-hipX, -hipY + legLift);

            ctx.beginPath();
            ctx.moveTo(X(37), 35.0);
            ctx.quadraticCurveTo(X(24), 38.2, X(10), 47.0 + Math.abs(thighPulse) * 0.20 + Math.max(0, thighLag * m) * 0.18);
            ctx.quadraticCurveTo(X(0), 53.2 + Math.abs(thighPulse) * 0.10, X(-2), 63);
            // Extend the lower continuation well below the visible frame so movement
            // does not reveal a hard cut at the render-box edge, while keeping the
            // visible thigh/body silhouette identical to the previous good version.
            ctx.lineTo(X(-4), 73.5);
            ctx.lineTo(X(31.5), 73.5);
            ctx.lineTo(X(30), 63);
            ctx.quadraticCurveTo(X(42), 58.0 - thighPulse * 0.14, X(47.6), 52.0 - thighPulse * 0.15 - thighLag * m * 0.10);
            ctx.quadraticCurveTo(X(49.25), 50.1 - thighPulse * 0.14 - thighLag * m * 0.12, X(49.15), 48.9 - innerPinch);
            ctx.quadraticCurveTo(X(46.2), 43.7 - thighPulse * 0.07, X(41.6), 39.6 - thighPulse * 0.05);
            ctx.quadraticCurveTo(X(39.2), 36.6, X(37), 35.0);
            ctx.closePath();
            ctx.fillStyle = PAL.skin;
            ctx.fill();
            ctx.strokeStyle = PAL.skinLine;
            ctx.lineWidth = 0.8;
            // Suppress ONLY the former inner V border in the local entrance zone.
            // Keep the exact thigh fill/path and all other outlines untouched.
            ctx.save();
            ctx.beginPath();
            ctx.rect(-20, -20, 140, 120);
            ctx.moveTo(X(39.8), 38.3);
            ctx.lineTo(X(50.8), 38.3);
            ctx.lineTo(X(50.8), 51.8);
            ctx.lineTo(X(45.0), 51.8);
            ctx.closePath();
            ctx.clip('evenodd');
            ctx.beginPath();
            ctx.moveTo(X(37), 35.0);
            ctx.quadraticCurveTo(X(24), 38.2, X(10), 47.0 + Math.abs(thighPulse) * 0.20 + Math.max(0, thighLag * m) * 0.18);
            ctx.quadraticCurveTo(X(0), 53.2 + Math.abs(thighPulse) * 0.10, X(-2), 63);
            ctx.lineTo(X(-4), 73.5);
            ctx.lineTo(X(31.5), 73.5);
            ctx.lineTo(X(30), 63);
            ctx.quadraticCurveTo(X(42), 58.0 - thighPulse * 0.14, X(47.6), 52.0 - thighPulse * 0.15 - thighLag * m * 0.10);
            ctx.quadraticCurveTo(X(49.25), 50.1 - thighPulse * 0.14 - thighLag * m * 0.12, X(49.15), 48.9 - innerPinch);
            ctx.quadraticCurveTo(X(46.2), 43.7 - thighPulse * 0.07, X(41.6), 39.6 - thighPulse * 0.05);
            ctx.quadraticCurveTo(X(39.2), 36.6, X(37), 35.0);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            ctx.restore();
        }




        const leftWall = stations.map(w => ({ x: w.pos.x - w.n.x * w.gapB, y: w.pos.y - w.n.y * w.gapB }));
        const rightWall = stations.map(w => ({ x: w.pos.x + w.n.x * w.gapT, y: w.pos.y + w.n.y * w.gapT }));
        const cavityPath = () => {
            ctx.beginPath();
            smoothPath(ctx, rightWall);
            ctx.quadraticCurveTo(CR.x, CR.y, leftWall[leftWall.length - 1].x, leftWall[leftWall.length - 1].y);
            smoothPath(ctx, [...leftWall].reverse(), true);
            ctx.closePath();
        };

        // ==================== X-ray window ====================
        if (showXray) {
        windowPath();
        ctx.strokeStyle = PAL.windowRim;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.save();
        windowPath();
        ctx.clip();

        windowPath();
        ctx.fillStyle = PAL.windowBg;
        ctx.fill();

        // --- canal tube: outer band, then dark cavity ---
        const leftBand = stations.map(w => ({ x: w.pos.x - w.n.x * (w.gapB + 1.6), y: w.pos.y - w.n.y * (w.gapB + 1.6) }));
        const rightBand = stations.map(w => ({ x: w.pos.x + w.n.x * (w.gapT + 1.6), y: w.pos.y + w.n.y * (w.gapT + 1.6) }));
        ctx.beginPath();
        smoothPath(ctx, rightBand);
        ctx.quadraticCurveTo(CR.x + endT.x * 2.6, CR.y + endT.y * 2.6, leftBand[leftBand.length - 1].x, leftBand[leftBand.length - 1].y);
        smoothPath(ctx, [...leftBand].reverse(), true);
        ctx.closePath();
        ctx.fillStyle = PAL.band;
        ctx.fill();
        ctx.strokeStyle = PAL.mucosa;
        ctx.lineWidth = 0.6;
        ctx.stroke();

        cavityPath();
        ctx.fillStyle = PAL.cavity;
        ctx.fill();

        // Cum pooling in the canal: rises from the entrance with a wavy surface
        if (s.cum.vag > 0.01) {
            let f = Math.min(1, s.cum.vag);
            if (s.hymen.present) f = Math.min(f, 0.12); // pool stays below the membrane
            const topY = E.y - (E.y - (CR.y + 1.2)) * f;
            ctx.save();
            cavityPath();
            ctx.clip();
            ctx.beginPath();
            ctx.moveTo(WIN.x - 15, topY + Math.sin(s.time * 3.1) * 0.4);
            for (let x = -15; x <= 15; x += 2.5) {
                ctx.lineTo(WIN.x + x, topY + Math.sin(s.time * 3.3 + x * 0.7) * 0.42);
            }
            ctx.lineTo(WIN.x + 15, 60);
            ctx.lineTo(WIN.x - 15, 60);
            ctx.closePath();
            ctx.fillStyle = PAL.cum;
            ctx.fill();
            // overpressure: past full, a milky film covers the whole canal
            if (s.cum.vag > 1.0) {
                cavityPath();
                ctx.fillStyle = `rgba(252,250,255,${Math.min(0.65, (s.cum.vag - 1) * 0.9)})`;
                ctx.fill();
            }
            ctx.restore();
        }

        // --- womb pouch (hollow, seen from the front; bloats as it overfills) ---
        ctx.save();
        ctx.translate(W.x, W.y);
        const bloat = wombFill <= 3 ? wombFill : 3 + (wombFill - 3) * 0.55;
        const brx = 7.6 * (1 + 0.16 * bloat), bry = 5.6 * (1 + 0.24 * bloat);
        ctx.beginPath();
        ctx.ellipse(0, 0, brx, bry, 0, 0, Math.PI * 2);
        ctx.fillStyle = PAL.womb;
        ctx.fill();
        ctx.strokeStyle = PAL.skinLine;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        const irx = 5.5 * (1 + 0.15 * bloat), iry = 3.9 * (1 + 0.26 * bloat);
        ctx.beginPath();
        ctx.ellipse(0, -0.2, irx, iry, 0, 0, Math.PI * 2);
        ctx.fillStyle = PAL.wombInterior;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, -1.3, irx * 0.7, iry * 0.55, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fill();

        // liquid pool inside the womb: level + slosh tilt + surface waves
        const lvl = Math.min(1, wombFill);
        if (lvl > 0.02) {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(0, -0.2, irx, iry, 0, 0, Math.PI * 2);
            ctx.clip();
            const surf = (iry - 0.2) - 2 * iry * lvl * 0.98;
            const tilt = Math.max(-0.5, Math.min(0.5, s.womb.vx * 0.05));
            ctx.beginPath();
            ctx.moveTo(-irx - 1, surf + tilt * -irx + Math.sin(s.time * 4.1) * 0.3);
            for (let x = -irx; x <= irx; x += 1.4) {
                ctx.lineTo(x, surf + tilt * x + Math.sin(s.time * 4.4 + x * 1.15) * 0.3);
            }
            ctx.lineTo(irx + 1, iry + 1);
            ctx.lineTo(-irx - 1, iry + 1);
            ctx.closePath();
            ctx.fillStyle = PAL.cum;
            ctx.fill();
            // glossy sheen on the surface
            ctx.beginPath();
            ctx.ellipse(-irx * 0.25, surf + 0.5, irx * 0.45, 0.35, tilt * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fill();
            ctx.restore();
        }

        // splash droplets while pumping into the womb
        if (s.cum.spurting > 0 && pierced && s.d > L + 1.5 && wombDrops.length < 70) {
            const tip = s.spinePoint(s.d);
            for (let k = 0; k < 2; k++) {
                wombDrops.push({
                    x: tip.x - W.x + (Math.random() - 0.5) * 1.2,
                    y: tip.y - W.y - 0.5,
                    vx: (Math.random() - 0.5) * 14,
                    vy: -6 - Math.random() * 9,
                });
            }
        }
        for (let i = wombDrops.length - 1; i >= 0; i--) {
            const p = wombDrops[i];
            p.vy += 26 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const q = (p.x * p.x) / (irx * irx) + (p.y * p.y) / (iry * iry);
            if (q > 1) { // bounce off the pouch wall
                const nx = p.x / (irx * irx), ny = p.y / (iry * iry);
                const nl = Math.hypot(nx, ny) || 1;
                const dot = (p.vx * nx + p.vy * ny) / nl;
                p.vx -= 1.6 * dot * (nx / nl);
                p.vy -= 1.6 * dot * (ny / nl);
                p.x *= 0.97; p.y *= 0.97;
            }
            const surfY = (iry - 0.2) - 2 * iry * lvl * 0.98;
            if ((p.y > surfY && p.vy > 0) || lvl > 0.97) { wombDrops.splice(i, 1); continue; }
            ctx.beginPath();
            ctx.arc(p.x, p.y, 0.42, 0, Math.PI * 2);
            ctx.fillStyle = PAL.cum;
            ctx.fill();
        }
        ctx.restore(); // womb transform

        // --- cervix: curled lips at the pouch mouth ---
        if (pierced) {
            const rNeed = Math.max(0.9, s.shaftRadius(s.d - (L + 1.2)) * 0.95);
            ctx.beginPath();
            ctx.arc(CR.x, CR.y, rNeed + 1.6, 0, Math.PI * 2);
            ctx.arc(CR.x, CR.y, Math.max(0.4, rNeed * 0.92), 0, Math.PI * 2, true);
            ctx.fillStyle = PAL.cervix;
            ctx.fill('evenodd');
            ctx.strokeStyle = PAL.cervixLine;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        } else {
            for (const m of [1, -1]) {
                ctx.beginPath();
                ctx.ellipse(CR.x + m * 2.1, CR.y + 0.2, 1.9, 1.25, m * -0.55, 0, Math.PI * 2);
                ctx.fillStyle = PAL.cervix;
                ctx.fill();
                ctx.strokeStyle = PAL.cervixLine;
                ctx.lineWidth = 0.45;
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.ellipse(CR.x, CR.y + 0.1, 0.75, 0.5, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#5e1a30';
            ctx.fill();
            if (s.cum.vag > 0.5) {
                ctx.beginPath();
                ctx.ellipse(CR.x, CR.y + 0.1, 0.6, 0.38, 0, 0, Math.PI * 2);
                ctx.fillStyle = PAL.cum;
                ctx.fill();
            }
        }

        // womb overflowing: white dribbles back out through the cervix
        if (s.cum.womb > 1.15) {
            const a = Math.min(0.9, (s.cum.womb - 1.15) * 1.4 + 0.35);
            ctx.fillStyle = `rgba(252,250,255,${a})`;
            ctx.beginPath();
            ctx.ellipse(CR.x - 0.3, CR.y + 2.2, 0.7, 1.7, 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(CR.x + 0.6, CR.y + 4.6, 0.5, 1.3, -0.1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Hymen membrane (virgin mode): a thin film across the canal that
        // stretches inward under pressure; torn flaps remain after the break
        if (s.hymen.present || s.hymen.broken) {
            const hw = stations.find(w => w.s >= 2.4) || stations[2];
            const hl = { x: hw.pos.x - hw.n.x * hw.gapB, y: hw.pos.y - hw.n.y * hw.gapB };
            const hr = { x: hw.pos.x + hw.n.x * hw.gapT, y: hw.pos.y + hw.n.y * hw.gapT };
            if (s.hymen.present) {
                // thins and whitens with tension as it overstretches
                const hyRange = Math.max(0.5, s.MAX_NORMAL * 0.25 - 2.4);
                const press = Math.min(1, s.hymen.stretch / hyRange);
                const bulge = 0.6 + s.hymen.stretch;
                const thick = Math.max(0.35, 0.9 - 0.5 * press);
                const bx = hw.tan.x * bulge, by = hw.tan.y * bulge;
                ctx.beginPath();
                ctx.moveTo(hl.x, hl.y);
                ctx.quadraticCurveTo(hw.pos.x + bx, hw.pos.y + by, hr.x, hr.y);
                ctx.quadraticCurveTo(hw.pos.x + bx + hw.tan.x * thick, hw.pos.y + by + hw.tan.y * thick, hl.x, hl.y);
                ctx.closePath();
                ctx.fillStyle = `rgba(252, ${Math.round(216 + 24 * press)}, ${Math.round(226 + 16 * press)}, ${0.92 - 0.3 * press})`;
                ctx.fill();
                ctx.strokeStyle = PAL.mucosa;
                ctx.lineWidth = Math.max(0.2, 0.35 - 0.12 * press);
                ctx.stroke();
            } else {
                ctx.fillStyle = 'rgba(250, 216, 226, 0.85)';
                for (const p of [hl, hr]) {
                    ctx.beginPath();
                    ctx.ellipse(p.x + hw.tan.x * 0.5, p.y + hw.tan.y * 0.5, 0.5, 1.0, Math.atan2(hw.tan.y, hw.tan.x), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        // Blood tinge after a hymen break (fades over ~80s)
        if (s.blood > 0.02) {
            ctx.save();
            cavityPath();
            ctx.clip();
            const bp = stations.find(w => w.s >= 3) || stations[3];
            ctx.beginPath();
            ctx.arc(bp.pos.x, bp.pos.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(178, 28, 52, ${0.35 * s.blood})`;
            ctx.fill();
            ctx.restore();
        }

        ctx.restore(); // end window clip
        } else {
            const press = Math.min(1, Math.max(0, s.depthNorm || 0));
            ctx.save();
            torsoPath(belly);
            ctx.clip();
            ctx.beginPath();
            ctx.ellipse(WIN.x, WIN.y + 2.4 - winShift, 12.9 + bellyWave * 0.8, 15.8 + bellyWave * 0.6, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + press * 0.04})`;
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(WIN.x, WIN.y + 11.2 - winShift, 7.9 + press * 2.0, 3.8 + press * 0.8, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(178, 90, 114, ${0.08 + press * 0.12})`;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(WIN.x, WIN.y - 6.2 - winShift);
            ctx.quadraticCurveTo(WIN.x + s.jig.x * 0.08, WIN.y + 4.1 - winShift, WIN.x, WIN.y + 13.6 - winShift);
            ctx.strokeStyle = `rgba(178, 90, 114, ${0.08 + press * 0.13})`;
            ctx.lineWidth = 0.55;
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(WIN.x, WIN.y + 8.8 - winShift, 6.0 + press * 1.5, 2.0 + press * 0.5, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${0.05 + press * 0.05})`;
            ctx.fill();

            // Entrance depth shadow removed for the upcoming redesign.
            // This torso shading block is otherwise unchanged.
            ctx.restore();
        }
        ctx.restore(); // end body/jiggle layer

        // Local entrance depth opening sits beneath the shaft in both views.
        ctx.save();
        ctx.translate(pelvisSway, pelvisBounce);
        drawEntranceDepthUnder();
        ctx.restore();

        // ==================== shaft layer (no jiggle) ====================
        // Puddle on the sheet below (grows with everything that has leaked out)
        if (puddle > 0.02) {
            ctx.beginPath();
            ctx.ellipse(50.5, 59, 5 + 9 * Math.min(1, puddle), 1.5 + 1.3 * Math.min(1, puddle), 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(252,250,255,0.8)';
            ctx.fill();
        }

        const spine = s.spine;
        // Clip the whole moving layer to the visible side of the exact same edge.
        // This prevents internal segments reappearing through the cover at extreme depth.
        ctx.save();
        if (!showXray && hasMadeContact) {
            // Match the transform later used by the overlying skin layer.
            ctx.translate(pelvisSway, pelvisBounce);
            ctx.beginPath();
            ctx.moveTo(-10, edgeY);
            ctx.lineTo(edgePoints[0].x, edgePoints[0].y);
            for (let i = 1; i < edgePoints.length; i++) ctx.lineTo(edgePoints[i].x, edgePoints[i].y);
            ctx.lineTo(110, edgeY);
            ctx.lineTo(110, SCENE_H + 20);
            ctx.lineTo(-10, SCENE_H + 20);
            ctx.closePath();
            ctx.clip();
            ctx.translate(-pelvisSway, -pelvisBounce);
        }
        if (spine.length > 2) {
            const topEdge = [], botEdge = [];
            for (let i = 0; i < spine.length; i++) {
                const a = spine[Math.max(0, i - 1)].pos, b = spine[Math.min(spine.length - 1, i + 1)].pos;
                let tx = b.x - a.x, ty = b.y - a.y;
                const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
                const r = spine[i].r;
                topEdge.push({ x: spine[i].pos.x - ty * r, y: spine[i].pos.y + tx * r });
                botEdge.push({ x: spine[i].pos.x + ty * r, y: spine[i].pos.y - tx * r });
            }
            ctx.beginPath();
            smoothPath(ctx, topEdge);
            // Round the existing shaft's far end rather than leaving the
            // old straight horizontal closing edge. Do not extend shaft length
            // through the scene or change the simulation's spine samples.
            const tailTop = topEdge[topEdge.length - 1];
            const tailBot = botEdge[botEdge.length - 1];
            const tailPrev = spine[Math.max(0, spine.length - 2)].pos;
            const tailLast = spine[spine.length - 1].pos;
            const tailDir = { x: tailLast.x - tailPrev.x, y: tailLast.y - tailPrev.y };
            const tailLen = Math.hypot(tailDir.x, tailDir.y) || 1;
            const roundDistance = Math.min(1.0, spine[spine.length - 1].r * 0.28);
            ctx.quadraticCurveTo(
                (tailTop.x + tailBot.x) / 2 + tailDir.x / tailLen * roundDistance * 2,
                (tailTop.y + tailBot.y) / 2 + tailDir.y / tailLen * roundDistance * 2,
                tailBot.x, tailBot.y
            );
            smoothPath(ctx, [...botEdge].reverse(), true);
            ctx.closePath();
            ctx.fillStyle = PAL.shaft;
            ctx.fill();
            ctx.strokeStyle = PAL.shaftLine;
            ctx.lineWidth = 0.7;
            ctx.stroke();

            const gTop = topEdge.filter((_, i) => spine[i].u <= 4.0);
            const gBot = botEdge.filter((_, i) => spine[i].u <= 4.0);
            if (gTop.length > 1 && (showXray || !s.inside)) {
                ctx.beginPath();
                smoothPath(ctx, gTop);
                smoothPath(ctx, [...gBot].reverse(), true);
                ctx.closePath();
                // A second solid, closed tip polygon with an outlined, flat
                // rear edge looked like an independent rectangle on the shaft.
                // Keep the tip tint, but blend it into the already rounded
                // shaft silhouette, without a second boxed outline.
                const tipColor = ctx.createLinearGradient(
                    spine[0].pos.x, spine[0].pos.y,
                    spine[Math.min(5, spine.length - 1)].pos.x,
                    spine[Math.min(5, spine.length - 1)].pos.y
                );
                if (tipColor && typeof tipColor.addColorStop === 'function') {
                    tipColor.addColorStop(0, PAL.glans);
                    tipColor.addColorStop(0.66, PAL.shaft);
                    tipColor.addColorStop(1, PAL.shaft);
                }
                ctx.fillStyle = tipColor || PAL.shaft;
                ctx.fill();
            }

            ctx.beginPath();
            smoothPath(ctx, topEdge.map(p => ({ x: p.x - 0.45, y: p.y + 0.1 })));
            ctx.strokeStyle = PAL.highlight;
            ctx.lineWidth = 0.4;
            ctx.stroke();

            if (protection) {
                const tear = protectionTearGeometry(spine, now);
                ctx.beginPath();
                smoothPath(ctx, topEdge);
                smoothPath(ctx, [...botEdge].reverse(), true);
                ctx.closePath();
                if (tear) traceProtectionCutout(tear);
                ctx.fillStyle = 'rgba(120, 190, 255, 0.18)';
                ctx.fill('evenodd');
                // Do not trace the film outline across its torn tip. An
                // intact rounded cap here would visibly cover the exposed
                // skin even when the film fill has a proper hole.
                ctx.beginPath();
                if (tear) {
                    smoothPath(ctx, topEdge.slice(3));
                    smoothPath(ctx, botEdge.slice(3));
                } else {
                    smoothPath(ctx, topEdge);
                    smoothPath(ctx, [...botEdge].reverse(), true);
                    ctx.closePath();
                }
                ctx.strokeStyle = 'rgba(120, 190, 255, 0.45)';
                ctx.lineWidth = 0.45;
                ctx.stroke();
                if (gTop.length > 1) {
                    const ring = spine.findIndex(pt => pt.u > 4.1);
                    if (ring > 2 && ring < topEdge.length - 2) {
                        ctx.beginPath();
                        ctx.moveTo(topEdge[ring].x, topEdge[ring].y);
                        ctx.lineTo(botEdge[ring].x, botEdge[ring].y);
                        ctx.strokeStyle = 'rgba(120, 190, 255, 0.60)';
                        ctx.lineWidth = 0.55;
                        ctx.stroke();
                    }
                }
                if (sealed && ((s.cum.condom || 0) > 0.01 || (s.cum.condomCount || 0) > 0)) {
                    const tip = spine[0].pos;
                    const loadBoost = Math.max(0, (s.cum.condomCount || 0) - 1) * 0.16;
                    const fill = Math.min(4.5, (s.cum.condom || 0) + loadBoost);
                    // pooled fluid in the tip grows gradually across presses instead of jumping to max.
                    ctx.beginPath();
                    ctx.ellipse(tip.x, tip.y + 1.35, 1.10 + fill * 0.42, 1.65 + fill * 0.72, 0, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(252,250,255,${0.34 + Math.min(0.36, fill * 0.10)})`;
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(120, 190, 255, 0.50)';
                    ctx.lineWidth = 0.38;
                    ctx.stroke();
                    // a milky column down the sheathed shaft grows farther along the protection with each load.
                    const shaftFill = Math.min(1, fill / 4.2);
                    if (shaftFill > 0.03) {
                        ctx.beginPath();
                        const frac = Math.min(0.84, 0.18 + shaftFill * 0.62);
                        const colLen = Math.max(6, Math.floor(topEdge.length * frac));
                        const colTop = topEdge.slice(0, colLen);
                        const colBot = botEdge.slice(0, colLen);
                        smoothPath(ctx, colTop.map((p, i) => ({ x: p.x * 0.915 + botEdge[i].x * 0.085, y: p.y * 0.915 + botEdge[i].y * 0.085 })));
                        smoothPath(ctx, [...colBot].reverse().map((p, i) => ({ x: p.x * 0.915 + topEdge[colBot.length - 1 - i].x * 0.085, y: p.y * 0.915 + topEdge[colBot.length - 1 - i].y * 0.085 })), true);
                        ctx.closePath();
                        ctx.fillStyle = `rgba(252,250,255,${0.12 + shaftFill * 0.22})`;
                        ctx.fill();
                    }
                    if ((s.cum.condomCount || 0) > 1) {
                        ctx.beginPath();
                        ctx.ellipse(tip.x, tip.y + 2.15, 0.56 + fill * 0.18, 0.95 + fill * 0.28, 0, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(255,255,255,0.28)';
                        ctx.fill();
                    }
                }
                if (tear) drawProtectionTear(tear);
            }
        }
        ctx.restore(); // moving layer clip; the cover is drawn in unclipped scene coordinates

        if (!showXray) {
            // Cover any internal/overlapping shaft so the non-x-ray view reads as a normal external view.
            ctx.save();
            ctx.translate(pelvisSway, pelvisBounce);
            torsoPath(belly);
            ctx.clip();
            ctx.beginPath();
            ctx.ellipse(WIN.x, WIN.y + 1.4 - winShift, 13.4, 16.8, 0, 0, Math.PI * 2);
            ctx.fillStyle = PAL.skin;
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(WIN.x, WIN.y + 10.8 - winShift, 8.1 + Math.min(1, bellyWave) * 0.9, 3.15 + motionVel * 0.55, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(178, 90, 114, 0.10)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(WIN.x, WIN.y - 4.2 - winShift);
            ctx.quadraticCurveTo(WIN.x + pelvisSway * 0.25, WIN.y + 3.2 - winShift, WIN.x, WIN.y + 12.4 - winShift);
            ctx.strokeStyle = `rgba(178, 90, 114, ${0.09 + motionVel * 0.07})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Body-connected fold covers replace the former one-piece
            // skin rectangle. They stay closed at rest and part on contact.
            drawEntranceSkinCovers();

            // Redraw the navel above the non-xray cover so it never gets washed out.
            ctx.beginPath();
            ctx.ellipse(49, 12.4, 0.72, 1.08, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(178, 90, 114, 0.55)';
            ctx.fill();

            ctx.restore();
        }

        if (showXray) {
        // Rugae ribs wrapping the tube (drawn over the shaft, inside the window)
        ctx.save();
        ctx.save();
        ctx.translate(pelvisSway * 0.8, pelvisBounce * 0.85);
        windowPath();
        ctx.restore();
        ctx.clip();
        const ribSpacing = stations[1].s - stations[0].s;
        for (let i = 1; i < stations.length - 1; i++) {
            const w = stations[i];
            for (const m of [1, -1]) {
                const gap = m === 1 ? w.gapT : w.gapB;
                // A small axial phase offset makes a response pulse travel
                // down the fold pattern, rather than moving every rib at once.
                const wave = (s.response?.strength || 0) * (s.response?.hold ? 1 :
                    0.78 + 0.22 * Math.cos((s.response?.elapsed || 0) * 17 - i * 0.60));
                const inset = Math.max(0, wave) * 0.42;
                ctx.beginPath();
                ctx.ellipse(
                    w.pos.x + m * w.n.x * (gap + 0.75 - inset) + s.jig.x * 0.35,
                    w.pos.y + m * w.n.y * (gap + 0.75 - inset) + s.jig.y * 0.35,
                    1.05, ribSpacing * 0.42,
                    Math.atan2(w.tan.y, w.tan.x) + Math.PI / 2,
                    0, Math.PI * 2);
                ctx.fillStyle = PAL.rib;
                ctx.fill();
                ctx.strokeStyle = PAL.mucosa;
                ctx.lineWidth = 0.3;
                ctx.stroke();
            }
        }
        ctx.restore();

        // Milky wash over the submerged part of the shaft (so a flooded canal
        // reads as flooded even while the shaft fills it)
        if (s.cum.vag > 0.05) {
            let f = Math.min(1, s.cum.vag);
            if (s.hymen.present) f = Math.min(f, 0.12);
            const topY = E.y - (E.y - (CR.y + 1.2)) * f;
            ctx.save();
            ctx.translate(pelvisSway * 0.8, pelvisBounce * 0.85);
            windowPath();
            ctx.clip();
            cavityPath();
            ctx.clip();
            ctx.beginPath();
            ctx.moveTo(WIN.x - 15, topY + Math.sin(s.time * 3.1) * 0.4);
            for (let x = -15; x <= 15; x += 2.5) {
                ctx.lineTo(WIN.x + x, topY + Math.sin(s.time * 3.3 + x * 0.7) * 0.42);
            }
            ctx.lineTo(WIN.x + 15, 60);
            ctx.lineTo(WIN.x - 15, 60);
            ctx.closePath();
            ctx.fillStyle = `rgba(252,250,255,${0.3 + 0.3 * Math.min(1, s.cum.vag)})`;
            ctx.fill();
            ctx.restore();
        }

        // The single small particle rides the moving tip until the depth
        // threshold. Its travel phase starts at that *same* world coordinate
        // and ends exactly at the settled point in the lower womb.
        // No additional surface/folds particle is drawn in either view.
        if (s.cum.preFluid?.active) {
            const pf = s.cum.preFluid;
            const end = { x: W.x + 0.10, y: W.y + 1.55 };
            let pos;
            if (!pf.deep) {
                pos = spine.length ? spine[0].pos : s.spinePoint(s.d);
            } else if (pf.animation > 0) {
                const duration = pf.duration || 1.8;
                const t = Math.max(0, Math.min(1, 1 - pf.animation / duration));
                const eased = t * t * (3 - 2 * t);
                const start = pf.travelFrom || (spine.length ? spine[0].pos : end);
                pos = {
                    x: start.x + (end.x - start.x) * eased,
                    y: start.y + (end.y - start.y) * eased,
                };
            } else {
                pos = end;
            }
            ctx.beginPath();
            ctx.ellipse(pos.x + (pf.deep ? 0 : 0), pos.y, 0.43, 0.74, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(252,250,255,0.72)';
            ctx.fill();
        }

        // Cum spurt particles
        for (const p of s.cum.particles) {
            const pos = s.spinePoint(p.a);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = PAL.cum;
            ctx.fill();
        }

        // The old external entrance bridge/rim is intentionally omitted.
        // The X-ray oval, interior canal, and simulator remain unchanged.

        }

        // Static contour replacement. Draw after the entry skin cover, but
        // clip out the moving object's footprint: the contour cannot overlay it.
        ctx.save();
        ctx.translate(pelvisSway, pelvisBounce);
        {
            // Never let the fixed contour lines paint over the shaft corridor.
            const coverWidth = spine.length
                ? Math.max(1.7, ...spine.slice(0, Math.min(8, spine.length)).map(pt => Math.abs(pt.pos.x - E.x) + pt.r + 0.14))
                : 1.7;
            ctx.beginPath();
            ctx.rect(-10, -10, 120, 90);
            ctx.moveTo(E.x - coverWidth, E.y - 0.95);
            ctx.lineTo(E.x + coverWidth, E.y - 0.95);
            ctx.lineTo(E.x + coverWidth, SCENE_H + 8);
            ctx.lineTo(E.x - coverWidth, SCENE_H + 8);
            ctx.closePath();
            ctx.clip('evenodd');
        }
        drawBodyAttachedBorders();
        // Fold and rim contours remain independently animated in the foreground.
        drawEntranceOverlay();
        ctx.restore();

        // ==================== clean entrance canvas area ====================
        // Deliberately no fold, rim, depth opening, or added skin mask here.
        // Upcoming artwork will be built independently from the user's sketches.
        // The approved thighs and the shaft-occlusion geometry above are preserved.

        // Intentionally NO separate external tear overlay: the true tip tear
        // is already rendered in the shaft layer and occluded by the normal
        // skin cover when inside. Drawing again here created the floating copy.

        // Thin blood trickle at the lips after a hymen break
        if (s.blood > 0.05) {
            ctx.fillStyle = `rgba(178, 28, 52, ${0.5 * s.blood})`;
            ctx.beginPath();
            ctx.ellipse(E.x + 0.8, E.y + 2.2, 0.5, 1.4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // ==================== leaking (drawn over the lips — cum on top) ====================
        // Spawn rate scales with leak level AND how many loads have been pumped in.
        const totalLoads = s.cum.vagCount + s.cum.wombCount;
        const gush = s.cum.leak * (1 + 0.7 * Math.max(0, totalLoads - 1));
        if (!sealed && gush > 0.05) {
            puddle = Math.max(puddle, Math.min(1.3, 0.2 + 0.3 * Math.max(0, totalLoads - 1)));
            leakAcc += dt * (1.5 + 7 * gush);
            while (leakAcc > 1) {
                leakAcc -= 1;
                leakDrops.push({
                    x: E.x + (Math.random() - 0.5) * 9,
                    y: E.y + 0.8,
                    vy: 3 + Math.random() * 5,
                });
                puddle = Math.min(1.3, puddle + 0.012);
            }
        }
        ctx.fillStyle = PAL.cum;
        for (let i = leakDrops.length - 1; i >= 0; i--) {
            const p = leakDrops[i];
            p.vy += 18 * dt;
            p.y += p.vy * dt;
            p.x += (50 - p.x) * 0.25 * dt; // drift loosely toward the shaft
            if (p.y > 63) { leakDrops.splice(i, 1); continue; }
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 0.45, 1.1, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        // white squeezed out around the entrance, over the lips
        if (!sealed && s.cum.leak > 0.15) {
            const a = Math.min(0.9, s.cum.leak + 0.2);
            ctx.fillStyle = `rgba(252,250,255,${a})`;
            for (const m of [1, -1]) {
                ctx.beginPath();
                ctx.ellipse(E.x + m * 2.8, E.y + 1.4, 1.1, 2.0, m * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.beginPath();
            ctx.ellipse(E.x, E.y + 3.4, 1.6, 1.0, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        const residue = s.responseResidue || { thigh: 0, bed: 0 };
        if (residue.thigh > 0.02) {
            const wet = Math.min(1, residue.thigh);
            ctx.save();
            ctx.fillStyle = `rgba(219,244,253,${0.18 + wet * 0.22})`;
            for (const sign of [-1, 1]) {
                ctx.beginPath();
                ctx.ellipse(E.x + sign * (8.5 + wet * 1.8), E.y + 10.6, 2.2 + wet * 1.3, 5.6 + wet * 1.9, sign * 0.28, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(E.x + sign * (4.5 + wet * 1.1), E.y + 7.3, 1.0 + wet * 0.55, 2.4 + wet * 1.2, sign * 0.20, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        if (residue.bed > 0.02) {
            const wet = Math.min(1, residue.bed);
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(E.x, 58.1, 5.6 + wet * 4.2, 1.25 + wet * 0.85, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(219,244,253,${0.12 + wet * 0.16})`;
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(E.x + 0.55, 57.95, 3.6 + wet * 2.1, 0.72 + wet * 0.38, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(252,250,255,${0.10 + wet * 0.10})`;
            ctx.fill();
            ctx.restore();
        }

        // Decorative spray for the optional stronger response. It originates
        // directly under the rim, opens slightly upward/outward, then falls.
        const sprayActive = !!s.response?.spray;
        // Keep the response intensity for the existing spray effect independently
        // of the removed fold renderer (which used to define this value).
        const responseStrength = Math.max(0, s.response?.strength || 0);
        const spraySourceX = E.x + pelvisSway * 0.8;
        const spraySourceY = edgeY - edgeH + 0.62 + pelvisBounce * 0.85;
        if (sprayActive) {
            responseSpawnAcc += dt * (28 + responseStrength * 40);
            while (responseSpawnAcc >= 1 && responseDrops.length < 140) {
                responseSpawnAcc--;
                responseDrops.push({
                    x: spraySourceX + (Math.random()-0.5) * 0.9,
                    y: spraySourceY + (Math.random()-0.5) * 0.25,
                    vx: (Math.random()-0.5) * 28,
                    vy: -6 + Math.random() * 11,
                    age: 0,
                    life: 0.74 + Math.random() * 0.70,
                    r: 0.28 + Math.random() * 0.20,
                });
            }
        } else responseSpawnAcc = 0;
        for (let i = responseDrops.length - 1; i >= 0; --i) {
            const p = responseDrops[i];
            p.age += dt;
            if (p.age >= p.life || p.y > SCENE_H + 4) {
                responseDrops.splice(i,1);
                continue;
            }
            p.vy += 24 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const fade = Math.min(1, 1 - p.age / p.life);
            const grow = 1 + 0.30 * (p.age / p.life);
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.r * grow, p.r * 1.75 * grow, p.vx * 0.012, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(219,244,253,${0.84 * fade})`;
            ctx.fill();
        }
    }

    function destroy() { ro.disconnect(); }

    function setSkin(her, him) {
        Object.assign(PAL, her, him); // keys: skin/skinLine, shaft/shaftLine/glans/glansLine
    }

    function setXray(on) { showXray = !!on; }
    function setProtection(on, broken = false) {
        const nextProtection = !!on;
        const nextBroken = nextProtection && !!broken;
        if (nextBroken && !protectionBroken) tearStartedAt = performance.now();
        if (!nextBroken) tearStartedAt = null;
        protection = nextProtection;
        protectionBroken = nextBroken;
    }

    return { render, screenToScene, resize, destroy, setSkin, setXray, setProtection };
}
