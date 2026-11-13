# Greyhaven Motion v0.1.19 — Response Waves, Scene Counts & Sharper Tear

## What's new
- **Sharp V protection opening:** removed the rounded tip-cap film outline across the torn region. The film cutout now uses a true angular V, with straight sides, a slight shoulder bend, and a 230 ms sideways-opening animation that remains at the moving tip. The cutout reveals the shaft pigment below the translucent film.
- **Orgasm action:** the Actions tab has a new **Orgasm** button. Three short smooth tightening pulses are followed by one final peak held for **3 seconds**, then a smooth relaxation. Tightness rises toward the user's configurable maximum (currently 2× by default) without changing the saved baseline; both outer folds and the X-ray folds react in time with the same wave.
- **Squirt action:** same timed response envelope with an additional brief decorative water-spray particle effect originating at the same entrance area in both views. The effect is independent of the existing fluid/release counters; particles have a bounded lifetime and a strict cap of 100.
- **Scene-wide counts:** the event manager separately counts Orgasm and Squirt button presses, recording each event at the scene stroke number. These counts survive individual Record/Stop windows, protection changes and view switches. Only **Reset** clears them. One-time event descriptions are included on the next hidden summary, and cumulative totals are appended to subsequent summaries.
- **60/120 Hz:** the existing physics-rate selector remains fully supported. The response envelope is driven by elapsed seconds, so switching physics rates does not change its timing.
- **Unchanged:** initial body silhouette, prior protection/fluid mechanics, prompt replay, default UI settings, motion and detection probabilities.

## Notes and testing
- `node tests/v019-response-waves.mjs` checks the wave envelope, last-peak hold, physics frame-rate independence, reset behavior, persistent counts, and the single sharp tear rendering path.
- Run **all** `tests/*.mjs` to check regressions from previous releases; all seven suites passed during packaging.
- `tests/visual-smoke-v019.html` is provided for an optional local browser smoke check. Headless Chromium could not complete a screenshot in the build environment; therefore final appearance must be reviewed in SillyTavern on the target device.
- This is a stylized fictional simulation. Timing and visual effects are design choices, not claims about real physiology.

**Install:** Back up the current extension folder, replace its files with this ZIP's root contents, then reload SillyTavern. Saved settings remain in SillyTavern and are not erased. Press Reset to start a clean test scene.

---

# Greyhaven Motion v0.1.18 — Tear, Particle Continuity & 60/120 Hz Physics

## v0.1.18 fixes
- **One tip-attached protection tear:** the tear is drawn exactly once from the moving shaft tip in both views. The duplicate external overlay is gone. With the tip occluded in the external view, the tear is correctly hidden behind the body cover rather than floating at the entrance.
- **Actual film cutout:** a small central opening is cut out of the blue protection film via the canvas even-odd fill rule so the already-rendered skin underneath is revealed. The two surrounding edges separate horizontally in a quick 240 ms animation, then remain open.
- **Pre-fluid particle:** removed the extra local surface/folds effect, keeping a single same-sized bead on the moving tip until it crosses the configured depth. Its 1.8-second trip starts at that exact tip coordinate and finishes at exactly the lower-compartment final point; no initial or final teleport.
- **Simulation physics rate setting:** choose **60 Hz (lower CPU)** or **120 Hz (original)** in SillyTavern Extensions > Greyhaven Motion > Motion update rate. Switching takes effect without resetting the scene; the selected rate is saved. Default remains 120 to preserve existing feel. The canvas continues to render at the browser/device's display frequency via `requestAnimationFrame`.
- **Unchanged:** the illustration proportions, risk/event tracking, release replay, AI prompt replay, and existing scene settings.

## Testing
Run `node tests/v018-render-rate.mjs` for focused rendering-path, particle-continuity and 60/120 Hz regression checks. Run the other tests in `tests/` for prior releases. The visual appearance still needs checking in the iPhone/SillyTavern browser; automated tests cannot prove aesthetic accuracy.

---

# Previous release: v0.1.17 — Protection Failure Visual Parity

Built directly on the working v0.1.15 package. All original controls, event percentages, ranges, prompt replay, and scene-level event tracking remain available.

## What changed
- **Same effects after failure:** a broken protective layer stays visible but is no longer considered *sealed* by the renderer. The existing unprotected entrance wash, dripping, pooled sheet effects, and multi-release scaling use their **original drawing pathways** instead of a second copy.
- **Retained-release transfer:** on manual, motion-triggered or release-triggered failure, all prior protected release counts and saved volume are transferred **once** to the normal simulator. It resumes the ordinary animated particles without pressing Release again, even after the earlier animations finished. Repeated presses contribute to the same volume and rate multipliers as unprotected presses.
- **V-shaped tear:** the broken layer has a persistent small V cut near its tip with a decaying flap animation. External view displays a matching small indicator near the visible surface when the tip is occluded.
- **Tiny pre-fluid visual:** a distinct, small bead appears on the pre-fluid scene event. If the event occurs beyond the configured depth threshold (65% by default), it is rendered as reaching the deep compartment. Otherwise, it stays local until a later movement crosses the threshold, and then progresses exactly once. It never counts as a full release.
- **Scene and reporting:** the pre-existing `eventManager.js` (introduced in v0.1.14) persists independently of Record/Stop; this update connects its states to the physics/rendering and aligns the hidden context with the broken/off distinction. Snapshots made during a size/depth rebuild also retain ongoing fluid animation state.

## Testing
Run these from the extension root with Node 22:

```
node tests/event-manager.mjs
node tests/v015-range-replay.mjs
node tests/v016-visual-transitions.mjs
node tests/stage-a-follow-up.mjs
node tests/summary-regressions.mjs
```

`tests/visual-smoke.html` is also included for a local browser smoke test. The automated tests verify the state and animation triggers; review the actual appearance in SillyTavern because the browser screenshot test was restricted in the build environment.

**Note:** The 65% transport threshold is a user-configured fictional simulation rule, not a medical representation of anatomy or fluid movement.

**Install:** Back up your current Greyhaven Motion folder. Replace its files with the ZIP contents (files are at ZIP root), reload SillyTavern, then start a fresh scene with Reset to evaluate the new effects. Extension settings remain unchanged.

---

# Greyhaven Motion v0.1.15 — Event Ranges and Same-Turn Replay

Based on the working v0.1.14 package. The **existing sim.js and renderMissionary.js are unchanged**.

## Changes
- In SillyTavern → Extensions → Greyhaven Motion → **Event timing (stroke ranges)**, adjust independent min/max ranges for motion-triggered protection failure, release-triggered protection failure, and the pre-fluid event. Defaults: 20–50, 0–10, and 1–100 respectively. The probability thresholds are adjustable in the existing Event probabilities panel.
- When protection breaks, the event manager switches the *simulation logic* to unprotected while retaining the existing protection illustration and a clear `Protection: broken` status. This is a status/logic update, **not** an anatomical break animation or physical transfer of previously retained fluids.
- The active hidden prompt clears after generation, but an in-memory copy is available only for a SillyTavern **swipe/regeneration of the same user turn**, including regeneration after deleting the previous assistant message. Sending another user message, switching chats, Reset, staging a new recording, or pressing Clear removes this replay copy.
- The compact status indicator stays in place.

## Scope/limitations
- No graphic fluid or genital animation changes were made. Events are reflected in the existing status display and hidden chronological event summaries.
- The extension stores replay data only in memory, not in the chat history. SillyTavern events `GENERATION_AFTER_COMMANDS`, `GENERATION_STARTED`, `MESSAGE_SENT`, `MESSAGE_DELETED`, `CHAT_CHANGED`, and `GENERATION_ENDED` are used to manage it.
- For a fresh event range, enable protection again (for the protection thresholds) or press Reset (for the pre-fluid threshold). Existing scheduled event deadlines are not re-rolled mid-scene.

## Regression tests
- `node tests/event-manager.mjs`
- `node tests/v015-range-replay.mjs`
- `node tests/stage-a-follow-up.mjs`
- `node tests/summary-regressions.mjs`

## Important
Make a backup of your working version before replacing the files. Use a normal ZIP where `manifest.json` and `index.js` are at the ZIP root. Existing extension storage is not deleted by the update.

---
# Greyhaven Motion — v0.1.13: Prompt Terminology + Configurable Limits

This is a narrowly scoped follow-up to v0.1.12.

- Maintains the position label on every summary.
- Replaces “recorded” and “recording” terminology in generated summary phrases with “pace” and “sequence”. UI Record/Stop remains unchanged.
- Virgin-mode summary explicitly identifies the receiver (not the giver), while retaining the simulated barrier's intact/broken status.
- The event in which the simulation's configured first-time barrier changes states can be described once, without repeating it on subsequent sequences.
- Fixes an edge case where the reported maximum per stroke was 0% despite the final contact depth exceeding zero.
- Adds editable min/max values in Extensions Settings > Greyhaven Motion > Scene control limits.
- Scene tab numeric fields honor configurable limits. Size minimum can be set down to 2 cm; other controls are bounded by the current engine's safe input ranges.
- Existing configured scene values migrate automatically, retaining their values if within the new selected limits.
- Simulation and rendering code are unchanged from v0.1.12.

The minimum-size experiment changes the simulated geometry within its existing engine's constraints. On very small settings the graphic may not be proportionally accurate; increase it again if it looks clipped. There are no new Stage B mechanics in this build.

# Greyhaven Motion — v0.1.12 Stage A: Summary Accuracy

Stage A prompt-only update. The simulation (`sim.js`), renderer (`renderMissionary.js`), and styling remain unchanged from v0.1.11.

- Position always present; visual mode and physics-only configuration omitted from AI prompt.
- Uses exact user-provided size label, protects simulator status from conflating virginity with barrier condition.
- Doesn't call re-entry in subsequent recordings a first entry.
- Corrected overlapping stroke categories and singular forms.
- Uses timestamped recording pace phases and timestamped pauses; pauses in progress are closed before staging.
- Replaced lifetime superlatives and automatic satisfaction language with recording and scene metrics.
- Doesn't clamp reported scene maximum to 100% when the simulation permits 150%.
- Running totals no longer say a protected finish happened inside the recipient.
- No new protection-break/pre-fluid/automatic mechanics: those belong to Stage B.

Greyhaven Motion v0.1.8 – x-ray cum fix + leg reset + rim fold correction

Greyhaven Motion v0.1.8 – action crash fix + protection-aware summaries + rim polish

Greyhaven Motion v0.1.8 – action/render stability + anatomy pass

# Greyhaven Motion v0.1.2

Missionary-only MVP for SillyTavern.

## Included
- Missionary scene
- X-ray / non-X-ray toggle
- Protection checkbox
- Virgin checkbox
- Size in centimeters
- Tightness / canal / length / depth controls
- Record -> hidden summary staging for the next send
- Editable hidden summary preview
- Automatic clear after the next generation
- Close/reopen without losing scene state

## Notes
- This MVP reuses the same motion engine approach as the inspected reference extension, but the panel flow is reworked for hidden staging instead of chatbox dumping.
- The summary is inserted as a hidden system prompt for one turn and is not written into the visible chat input.


## v0.1.2 fixes
- Mobile scrolling and safer iPhone top offset
- Tabs for Actions / Scene / Prompt
- Better styled controls on mobile
- Non-X-ray view now hides the oval cutout and uses normal body shading
- Added subtle receiver body motion / pelvic reaction
- Protection visual no longer leaks outside
- Lowered navel and cleaned torso top seam


## v0.1.2 fixes
- restored normal Cum behavior when protection is off
- repeated Cum presses add more effect, including with protection
- improved non-X-ray masking so the shaft is hidden properly at the folds
- toned down body motion and limited it to actual contact
- fixed virgin barrier meta text
- switched Finish label back to Cum
- break/cervix and womb actions made more robust


## v0.1.3
- refined leg motion with separate per-leg pose reactions
- improved non-X-ray depth shadow and masking near the folds
- restored stronger repeat Cum effect in protection mode
- break button reliability improved for cervix and womb depths
- added visible inner thigh crease lines in X-ray mode


## v0.1.4
- added Greyhaven Motion settings drawer in SillyTavern extension settings
- receiver/giver names are configurable
- eased leg motion to remove first-contact teleport feel
- improved X-ray thigh outline redraw on top of the belly window
- improved non-X-ray opening/depth rendering
- stronger repeated cum effect in protection mode, including fill along the condom
- immediate fluid response on cum button for protected and unprotected modes

## v0.1.5 rendering hotfix
- Restored the missing motion interpolation helper that caused the canvas to render only its background in v0.1.4.
- No behavior or settings changes in this hotfix.
- Renderer smoke-tested in Chromium (normal, motion, non-X-ray, and repeated-event views).


### v0.1.14 — Non-graphic event-state tracking
- New scene-persistent eventManager.js, independent of Record/Stop count and canvas rendering.
- A single risk draw per protection instance, speed-dependent thresholds, one scheduled break at a time.
- New manual Break protection button; checkbox cycling resets the protection state.
- Configurable simulated risk percentages in Extensions settings.
- Pre-ejaculate event is scheduled when protection is off and scene reset; if it happens, track whether a depth threshold was reached later.
- Compact status strip indicates protection and fluid event states. Summary appends concise chronological events.
- This release does not draw graphic anatomical fluid effects, and does not modify the established physics or renderMissionary.js.
