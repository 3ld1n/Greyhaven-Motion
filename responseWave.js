// Deterministic response envelope: three quick waves followed by a stronger
// final squeeze, a three-second hold, and a smooth return to the scene baseline.
// Standalone so 60 Hz and 120 Hz simulations sample the same time curve.
const clamp01 = x => Math.min(1, Math.max(0, x));
const ease = x => { const t = clamp01(x); return t*t*(3-2*t); };
export const RESPONSE_DURATION = 7.26;
export function sampleResponseWave(seconds) {
    const t = Math.max(0, Number(seconds) || 0);
    if (t >= RESPONSE_DURATION) return {strength:0, hold:false, active:false, spray:false};
    let strength = 0;
    let hold = false;
    const cycle = 0.84;
    if (t < 3 * cycle) {
        const u = t % cycle;
        if (u < 0.22) strength = ease(u / 0.22);
        else if (u < 0.36) strength = 1;
        else if (u < 0.68) strength = 1 - ease((u - 0.36) / 0.32);
        else strength = 0;
    } else if (t < 2.52 + 0.34) {
        strength = ease((t - 2.52) / 0.34);
    } else if (t < 5.86) {
        strength = 1;
        hold = true;
    } else {
        strength = 1 - ease((t - 5.86) / 1.40);
    }
    // The optional secondary visual is strongest during the first waves.
    return {strength:clamp01(strength), hold, active:true, spray:t < 3.2};
}
