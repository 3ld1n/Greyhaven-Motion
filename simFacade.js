// Physics engine selector. Default: the JS sim. The WASM core is kept in
// the repo but dormant — opt in with `globalThis.SXR_FORCE_WASM = true`
// before import (test.html exposes this via ?engine=wasm).

import * as jsSim from './sim.js';
export { CENTERLINES, SCENE_W, SCENE_H } from './sim.js';

export let engineName = 'js';
let wasmMod = null;
if (globalThis.SXR_FORCE_WASM) {
    try {
        wasmMod = await import('./simWasm.js');
        engineName = 'wasm';
        console.log('[silly-xray] physics engine: WASM (forced)');
    } catch (err) {
        console.warn('[silly-xray] WASM engine unavailable, using JS physics', err);
    }
} else {
    console.log('[silly-xray] physics engine: JS');
}

export function createSim(opts) {
    if (wasmMod) {
        try {
            return wasmMod.createSim(opts);
        } catch (err) {
            console.warn('[silly-xray] WASM createSim failed, falling back to JS', err);
            wasmMod = null;
        }
    }
    return jsSim.createSim(opts);
}
