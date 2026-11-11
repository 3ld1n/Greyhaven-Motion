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

    function render(sim) {
        const s = sim.state;
        if (!canvas.width) return;
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

        // Thighs IN FRONT of the torso: each leg gets its own eased pose so
        // they move naturally instead of snapping upward as one slab.
        const thighPose = {
            1: { pulse: disp.thighR, lag: -thighLag },
            '-1': { pulse: disp.thighL, lag: thighLag },
        };
        for (const m of [1, -1]) {
            const X = v => 49.5 + m * (v - 49.5);
            const pose = thighPose[m];
            const hipX = X(38.4);
            const hipY = 35.8;
            const legLift = motionContact * Math.max(0, pose.pulse) * 0.32;
            const legRot = motionContact * (m * (0.018 + pose.lag * 0.045) + pose.pulse * 0.010);
            const legScaleX = 1 + motionContact * (0.012 + Math.abs(pose.lag) * 0.010);
            const legScaleY = 1 - motionContact * (0.006 + Math.abs(pose.pulse) * 0.010);
            const innerPinch = openingSpread * 0.72 + motionVel * 0.12;
            ctx.save();
            ctx.translate(hipX, hipY);
            ctx.rotate(legRot);
            ctx.scale(legScaleX, legScaleY);
            ctx.translate(-hipX, -hipY - legLift);

            ctx.beginPath();
            ctx.moveTo(X(37.2), 35.0);
            ctx.quadraticCurveTo(X(23.5), 38.2, X(8), 47.2 + Math.abs(pose.pulse) * 0.18 + Math.max(0, pose.lag * m) * 0.18);
            ctx.quadraticCurveTo(X(-6), 54.2 + Math.abs(pose.pulse) * 0.12, X(-9), 67.2);
            ctx.lineTo(X(33), 67.2);
            ctx.quadraticCurveTo(X(43), 59.0 - pose.pulse * 0.14, X(47.8), 52.2 - pose.pulse * 0.16 - pose.lag * m * 0.12);
            ctx.quadraticCurveTo(X(49.35), 50.0 - pose.pulse * 0.10 - pose.lag * m * 0.10, X(49.10), 48.9 - innerPinch);
            ctx.quadraticCurveTo(X(46.0), 43.7 - pose.pulse * 0.05, X(41.6), 39.7 - pose.pulse * 0.04);
            ctx.quadraticCurveTo(X(39.1), 36.7, X(37.2), 35.0);
            ctx.closePath();
            ctx.fillStyle = PAL.skin;
            ctx.fill();
            ctx.strokeStyle = PAL.skinLine;
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.restore();
        }

        // Soft thigh-to-groin seam lines help the body read as 3D.
        for (const m of [1, -1]) {
            ctx.beginPath();
            ctx.moveTo(49 + m * 6.7, 33.5 + bellyWave * 0.2);
            ctx.quadraticCurveTo(49 + m * 6.0, 37.8 + Math.abs(thighLag) * 0.10, 49 + m * 4.0, 43.6 + openingSpread * 0.5);
            ctx.strokeStyle = 'rgba(148, 88, 98, 0.32)';
            ctx.lineWidth = 0.55;
            ctx.stroke();
        }

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

        const leftWall = stations.map(w => ({ x: w.pos.x - w.n.x * w.gapB, y: w.pos.y - w.n.y * w.gapB }));
        const rightWall = stations.map(w => ({ x: w.pos.x + w.n.x * w.gapT, y: w.pos.y + w.n.y * w.gapT }));
        function cavityPath() {
            ctx.beginPath();
            smoothPath(ctx, rightWall);
            ctx.quadraticCurveTo(CR.x, CR.y, leftWall[leftWall.length - 1].x, leftWall[leftWall.length - 1].y);
            smoothPath(ctx, [...leftWall].reverse(), true);
            ctx.closePath();
        }
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
            ctx.ellipse(WIN.x, WIN.y + 2.4 - winShift, 12.5 + bellyWave * 0.7, 15.2 + bellyWave * 0.5, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + press * 0.04})`;
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(WIN.x, WIN.y + 11.2 - winShift, 7.6 + press * 1.8, 3.6 + press * 0.7, 0, 0, Math.PI * 2);
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
            if (gTop.length > 1) {
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
                ctx.beginPath();
                smoothPath(ctx, topEdge);
                smoothPath(ctx, [...botEdge].reverse(), true);
                ctx.closePath();
                ctx.fillStyle = 'rgba(120, 190, 255, 0.18)';
                ctx.fill();
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
                if ((s.cum.condom || 0) > 0.01 || (s.cum.condomCount || 0) > 0) {
                    const tip = spine[0].pos;
                    const loadBoost = Math.max(0, (s.cum.condomCount || 0) - 1) * 0.34;
                    const fill = Math.min(2.6, (s.cum.condom || 0) + loadBoost);
                    // pooled fluid in the tip
                    ctx.beginPath();
                    ctx.ellipse(tip.x, tip.y + 1.35, 1.18 + fill * 0.75, 1.8 + fill * 1.45, 0, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(252,250,255,${0.48 + Math.min(0.40, fill * 0.16)})`;
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(120, 190, 255, 0.52)';
                    ctx.lineWidth = 0.38;
                    ctx.stroke();
                    // a milky column down the sheathed shaft grows with repeated presses
                    const shaftFill = Math.min(1, fill / 2.2);
                    if (shaftFill > 0.05) {
                        ctx.beginPath();
                        const colTop = topEdge.slice(0, Math.max(6, Math.floor(topEdge.length * (0.18 + shaftFill * 0.22))));
                        const colBot = botEdge.slice(0, Math.max(6, Math.floor(botEdge.length * (0.18 + shaftFill * 0.22))));
                        smoothPath(ctx, colTop.map((p, i) => ({ x: p.x * 0.92 + botEdge[i].x * 0.08, y: p.y * 0.92 + botEdge[i].y * 0.08 })));
                        smoothPath(ctx, [...colBot].reverse().map((p, i) => ({ x: p.x * 0.92 + topEdge[colBot.length - 1 - i].x * 0.08, y: p.y * 0.92 + topEdge[colBot.length - 1 - i].y * 0.08 })), true);
                        ctx.closePath();
                        ctx.fillStyle = `rgba(252,250,255,${0.15 + shaftFill * 0.22})`;
                        ctx.fill();
                    }
                    if ((s.cum.condomCount || 0) > 1) {
                        ctx.beginPath();
                        ctx.ellipse(tip.x, tip.y + 2.35, 0.62 + fill * 0.30, 1.0 + fill * 0.58, 0, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(255,255,255,0.34)';
                        ctx.fill();
                    }
                }
            }
        }

        if (!showXray) {
            // Cover any internal/overlapping shaft so the non-x-ray view reads as a normal external view.
            ctx.save();
            ctx.translate(pelvisSway, pelvisBounce);
            torsoPath(belly);
            ctx.clip();
            ctx.beginPath();
            ctx.ellipse(WIN.x, WIN.y + 1.8 - winShift, 12.7, 15.9, 0, 0, Math.PI * 2);
            ctx.fillStyle = PAL.skin;
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(WIN.x, WIN.y + 10.9 - winShift, 7.9 + Math.min(1, bellyWave) * 0.8, 3.0 + motionVel * 0.45, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(178, 90, 114, 0.10)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(WIN.x, WIN.y - 4.2 - winShift);
            ctx.quadraticCurveTo(WIN.x + pelvisSway * 0.25, WIN.y + 3.2 - winShift, WIN.x, WIN.y + 12.4 - winShift);
            ctx.strokeStyle = `rgba(178, 90, 114, ${0.09 + motionVel * 0.07})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Opening / depth portal behind the visible shaft. Keep it centered under the folds.
            const openW = 2.3 + openingSpread * 2.25;
            const openH = 1.0 + openingSpread * 1.15;
            const openY = E.y + 2.2;
            // side depth walls
            ctx.beginPath();
            ctx.ellipse(E.x - openW * 0.48, openY + 0.05, openW * 0.68, openH * 0.88, 0.18, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(101, 49, 63, ${0.18 + openingSpread * 0.22})`;
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(E.x + openW * 0.48, openY + 0.05, openW * 0.68, openH * 0.88, -0.18, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(101, 49, 63, ${0.18 + openingSpread * 0.22})`;
            ctx.fill();
            // top rim above the shaft
            ctx.beginPath();
            ctx.ellipse(E.x, openY - 0.25, openW, openH, 0, Math.PI, 0);
            ctx.strokeStyle = 'rgba(203, 142, 165, 0.95)';
            ctx.lineWidth = 0.75;
            ctx.stroke();
            // dark center cavity under the shaft
            ctx.beginPath();
            ctx.ellipse(E.x, openY + 0.22, Math.max(0.85, openW * 0.54), Math.max(0.55, openH * 0.58), 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(84, 35, 52, ${0.22 + openingSpread * 0.28})`;
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

        // Cum spurt particles
        for (const p of s.cum.particles) {
            const pos = s.spinePoint(p.a);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = PAL.cum;
            ctx.fill();
        }

        }

        // In X-ray mode, redraw the groin/inner-thigh body outlines above the window
        // so the anatomy does not look cut away by the overlay.
        if (showXray) {
            for (const m of [1, -1]) {
                ctx.beginPath();
                ctx.moveTo(49 + m * 13.5, 36.0);
                ctx.quadraticCurveTo(49 + m * 9.7, 39.3 + Math.abs(thighLag) * 0.16, 49 + m * 5.0, 46.0 + openingSpread * 0.62);
                ctx.strokeStyle = PAL.skinLine;
                ctx.lineWidth = 0.9;
                ctx.stroke();
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
        if (!protection && gush > 0.05) {
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
        if (!protection && s.cum.leak > 0.15) {
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
    function setProtection(on) { protection = !!on; }

    return { render, screenToScene, resize, destroy, setSkin, setXray, setProtection };
}
