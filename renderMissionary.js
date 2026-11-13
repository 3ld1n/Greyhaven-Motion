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
    let leakAcc = 0, puddle = 0;
    const disp = { contact: 0, pelvisX: 0, pelvisY: 0, thighL: 0, thighR: 0, open: 0 };

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
        if (!protectionBroken || spine.length < 4) return null;
        const tip = spine[1].pos;
        const a = spine[0].pos, b = spine[3].pos;
        const dx = b.x - a.x, dy = b.y - a.y;
        const norm = Math.hypot(dx, dy) || 1;
        const t = { x: dx / norm, y: dy / norm };
        const n = { x: -t.y, y: t.x };
        const ms = tearStartedAt === null ? 999 : Math.max(0, now - tearStartedAt);
        // Closed -> two quick opposite sideways pulls; stays visibly open.
        const phase = Math.min(1, ms / 240);
        const opened = 1 - Math.pow(1 - phase, 3);
        const width = 0.07 + 0.91 * opened;
        const pt = (along, side) => ({
            x: tip.x + t.x * along + n.x * side,
            y: tip.y + t.y * along + n.y * side,
        });
        return {
            leftTop: pt(-0.54, width), rightTop: pt(-0.54, -width),
            leftMid: pt(0.27, width * 0.83), rightMid: pt(0.27, -width * 0.83),
            leftBottom: pt(0.91, width * 0.37), rightBottom: pt(0.91, -width * 0.37),
            leftFlap: pt(0.40, width + 0.18 + 0.22 * opened),
            rightFlap: pt(0.40, -(width + 0.18 + 0.22 * opened)),
            opened,
        };
    }

    function traceProtectionCutout(g) {
        // A genuine hole in the translucent film; Canvas even-odd filling
        // leaves the original skin tone showing through instead of painting a
        // fake darker patch over the shaft.
        ctx.moveTo(g.leftTop.x, g.leftTop.y);
        ctx.quadraticCurveTo(g.leftMid.x, g.leftMid.y, g.leftBottom.x, g.leftBottom.y);
        ctx.quadraticCurveTo((g.leftBottom.x + g.rightBottom.x)/2,
            (g.leftBottom.y + g.rightBottom.y)/2 + 0.02,
            g.rightBottom.x, g.rightBottom.y);
        ctx.quadraticCurveTo(g.rightMid.x, g.rightMid.y, g.rightTop.x, g.rightTop.y);
        ctx.closePath();
    }

    function drawProtectionTear(g) {
        // Light blue lips pull away sideways from the central gap, exactly
        // following the same glans coordinates as the protection film.
        ctx.beginPath();
        ctx.moveTo(g.leftTop.x, g.leftTop.y);
        ctx.quadraticCurveTo(g.leftFlap.x, g.leftFlap.y, g.leftBottom.x, g.leftBottom.y);
        ctx.moveTo(g.rightTop.x, g.rightTop.y);
        ctx.quadraticCurveTo(g.rightFlap.x, g.rightFlap.y, g.rightBottom.x, g.rightBottom.y);
        ctx.lineWidth = 0.76;
        ctx.strokeStyle = 'rgba(100,183,243,0.94)';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(g.leftTop.x, g.leftTop.y);
        ctx.quadraticCurveTo(g.leftMid.x, g.leftMid.y, g.leftBottom.x, g.leftBottom.y);
        ctx.moveTo(g.rightTop.x, g.rightTop.y);
        ctx.quadraticCurveTo(g.rightMid.x, g.rightMid.y, g.rightBottom.x, g.rightBottom.y);
        ctx.lineWidth = 0.28;
        ctx.strokeStyle = 'rgba(34,99,157,0.93)';
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
        const targetThighPulse = Math.max(-1.0, Math.min(1.0, motionContact * (s.dVel * 0.015)));
        const targetThighLag = Math.max(-0.68, Math.min(0.68, motionContact * (s.jig.x * 0.10 - s.dVel * 0.0038)));
        disp.thighL = ease(disp.thighL, targetThighPulse + targetThighLag * 0.55, 9);
        disp.thighR = ease(disp.thighR, targetThighPulse - targetThighLag * 0.55, 9);
        const thighPulse = (disp.thighL + disp.thighR) * 0.5;
        const thighLag = (disp.thighL - disp.thighR) * 0.5;
        const bellyWave = Math.max(0, Math.min(0.85, motionContact * (Math.abs(s.dVel) * 0.004 + Math.max(0, (s.depthNorm || 0) - 0.2) * 0.16)));
        const targetOpeningSpread = Math.max(0, Math.min(1, (((st0.gapT + st0.gapB) * 0.5) - 1.3) / 2.1 + (s.inside ? 0.2 : 0)));
        disp.open = ease(disp.open, targetOpeningSpread, 11);
        const openingSpread = disp.open;

        // One shared edge for the non-X-ray cover, the moving-layer clip and the final outline.
        // All three must use the same points or subpixel seams will keep reappearing.
        const occlusionOpen = Math.max(0, Math.min(1, motionContact * 1.15));
        const hasMadeContact = (s.maxReach || 0) > 0.06 || s.inside || occlusionOpen > 0.05;
        const edgeW = 2.10 + openingSpread * 2.05;
        const edgeH = 0.92 + openingSpread * 0.96;
        const edgeY = E.y + 2.00;
        const edgePoints = [];
        for (let i = 0; i <= 36; i++) {
            const t = -1 + 2 * i / 36;
            edgePoints.push({ x: E.x + edgeW * t, y: edgeY - edgeH * Math.sqrt(Math.max(0, 1 - t * t)) });
        }
        function traceEdge() {
            ctx.moveTo(edgePoints[0].x, edgePoints[0].y);
            for (let i = 1; i < edgePoints.length; i++) ctx.lineTo(edgePoints[i].x, edgePoints[i].y);
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

        // Inner flesh shadow along the torso edges
        ctx.save();
        torsoPath(belly);
        ctx.clip();
        torsoPath(belly);
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
            const legLift = motionContact * (0.08 + Math.max(0, -thighPulse) * 0.18 + (m === 1 ? 0.04 : 0));
            const legRot = motionContact * (m * (0.035 + Math.max(-0.04, Math.min(0.04, thighLag * 0.045))) + thighPulse * 0.018);
            const legScaleX = 1 + motionContact * (0.015 + Math.abs(thighLag) * 0.018 + (m === 1 ? 0.008 : 0));
            const legScaleY = 1 - motionContact * (0.012 + Math.abs(thighPulse) * 0.012) + Math.max(0, thighPulse) * 0.015;
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
            ctx.stroke();
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
            const contactOpen = Math.max(0, Math.min(1, motionContact * 1.15));
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

            // Opening underlay: hidden before first contact, then it stays visible.
            // Keep only the darker depth shape so no pale/tan line appears under the rim.
            const openW = 2.10 + openingSpread * 2.05;
            const openH = 0.92 + openingSpread * 0.96;
            const openY = E.y + 2.02;
            const shownOpen = hasMadeContact ? Math.max(contactOpen, 0.18) : 0;
            if (shownOpen > 0.06) {
                ctx.beginPath();
                ctx.ellipse(E.x, openY + 0.08, Math.max(0.96, openW * 0.82), Math.max(0.66, openH * 0.88), 0, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(78, 36, 48, ${0.22 + shownOpen * 0.30})`;
                ctx.fill();
            }
            ctx.restore();
        }
        ctx.restore(); // end body/jiggle layer

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
                ctx.fillStyle = PAL.glans;
                ctx.fill();
                ctx.strokeStyle = PAL.glansLine;
                ctx.lineWidth = 0.5;
                ctx.stroke();
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
                // Trace only the film's outside border. The opening is drawn
                // separately, not as a second overlaid symbol.
                ctx.beginPath();
                smoothPath(ctx, topEdge);
                smoothPath(ctx, [...botEdge].reverse(), true);
                ctx.closePath();
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

            if (hasMadeContact) {
                // Fully opaque, edge-aligned cover drawn OVER the moving layer.
                // Its lower boundary is precisely the rim line, with no separate tan strip below.
                ctx.beginPath();
                ctx.moveTo(edgePoints[0].x - 0.7, edgeY - edgeH - 5.2);
                ctx.lineTo(edgePoints[edgePoints.length - 1].x + 0.7, edgeY - edgeH - 5.2);
                ctx.lineTo(edgePoints[edgePoints.length - 1].x, edgePoints[edgePoints.length - 1].y);
                for (let i = edgePoints.length - 2; i >= 0; i--) {
                    ctx.lineTo(edgePoints[i].x, edgePoints[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = PAL.skin;
                ctx.fill();

                // Extra upper bridge of skin above the rim to cover the gap and hide the shaft
                // immediately after it passes the rim. This sits above the shaft but under the rim line.
                const bridgeTopY = edgeY - edgeH - 0.98;
                const bridgeBottomY = edgeY - edgeH + 0.10;
                const bridgeOuterY = edgeY - 0.08;
                ctx.beginPath();
                ctx.moveTo(E.x - edgeW - 0.28, bridgeOuterY);
                ctx.quadraticCurveTo(E.x - edgeW * 0.82, bridgeTopY + 0.16, E.x, bridgeTopY - 0.16);
                ctx.quadraticCurveTo(E.x + edgeW * 0.82, bridgeTopY + 0.16, E.x + edgeW + 0.28, bridgeOuterY);
                ctx.lineTo(E.x + edgeW * 0.70, bridgeBottomY);
                ctx.quadraticCurveTo(E.x, bridgeBottomY - 0.10, E.x - edgeW * 0.70, bridgeBottomY);
                ctx.closePath();
                ctx.fillStyle = PAL.skin;
                ctx.fill();

                // Exactly one rim line, drawn LAST. No second underlining shape.
                ctx.beginPath();
                traceEdge();
                ctx.strokeStyle = 'rgba(176, 124, 114, 0.98)';
                ctx.lineWidth = 1.24;
                ctx.stroke();
            }

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
                ctx.beginPath();
                ctx.ellipse(
                    w.pos.x + m * w.n.x * (gap + 0.75) + s.jig.x * 0.35,
                    w.pos.y + m * w.n.y * (gap + 0.75) + s.jig.y * 0.35,
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

        }

        // ==================== labia overlay ====================
        ctx.save();
        ctx.translate(pelvisSway * 0.8, pelvisBounce * 0.85);
        for (const sign of [1, -1]) {
            const gap = sign === 1 ? st0.gapT : st0.gapB;
            const nn = { x: n0.x * sign, y: n0.y * sign };
            const cx = E.x + nn.x * (gap + 0.7) + out.x * 0.4;
            const cy = E.y + nn.y * (gap + 0.7) + out.y * 0.4;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 1.7, 3.1, sign * 0.22, 0, Math.PI * 2);
            ctx.fillStyle = PAL.skin;
            ctx.fill();
            ctx.strokeStyle = PAL.skinLine;
            ctx.lineWidth = 0.55;
            ctx.stroke();
        }
        ctx.restore();

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
