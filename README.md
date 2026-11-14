# v0.1.35.1 — Remove replacement entrance gap covers (based on v0.1.35)

This is a narrow cleanup of the exact **Greyhaven Motion v0.1.35 NoRectangle-OpaqueOutlines (1)** upload.

- The **v0.1.11 upper bridge/gap-cover** is no longer present in v0.1.35; it had already been removed in earlier rebuilds.
- The remaining two skin-colored replacement covers (`drawEntranceSkinCovers`) were removed entirely, including their invocation in the non-X-ray draw pass.
- The separate **depth-based shaft clip**, torso skin cover, **under-rim/depth drawing**, **opaque Y/fold outlines**, original thighs, X-ray internals and simulation systems were left unchanged.

**Important:** This removes the replacement gap-cover artwork, but it does not remove the shaft itself or the rim. Any remaining tan, dark-outlined rectangular shape may come from the shaft geometry and requires a separate identified fix. This patch intentionally does not alter that geometry.

## Testing
Run `node tests/v0351-gap-cover-removal.mjs` and the existing tests under `tests/`.

---

# v0.1.35 — Torso bottom shadow and opaque Y-line micro-fix

This update intentionally changes only two rendering details.

1. The flat pale rectangular band at the bottom of the torso was not part of the rim or entrance depth. It came from the bottom closing edge of `torsoPath()` when the inner-shadow stroke was applied to the entire closed torso path. The new shadow uses two *open side paths* with no bottom edge, retaining the body's fill and side shadows.
2. The central Y and its lower branches now share one **opaque** color (`#d08d9c`) instead of translucent `rgba(...)` values. Their shape and line widths remain unchanged.

All movement, event, simulation, thigh geometry, X-ray, shaft and protection code is retained unchanged.

---

# Greyhaven Motion v0.1.34 — Fold Cover Reveal Pass

**Built on v0.1.31 and focused on the new surface entrance behavior.** This pass restructures the local entrance artwork so the closed Y-shape remains the resting pose while the opening is revealed by two body-connected fold covers, instead of the old fade between separate drawings.

## Updated in this release
- Replaced the one-piece entrance skin cover with **two fold-cover layers** that stay closed at rest and part on contact.
- Kept the **central Y detail** as the resting-state core, then extended/split its lower branches into the opening-side contours during contact.
- Rebuilt the **surface opening underlayer** so the revealed oval, the opaque rim, and the connected depth opening are drawn as one stack beneath the fold covers.
- Removed the former **transparent upside-down triangle** behavior and the visible **skin-colored rectangle block** at the entrance.
- Reworked the fixed body-attached inner borders to stay slightly curved and detached from shaft motion.

## Intended visual result
- At 0 thrusts, the entrance should stay in the **contracted Y state**.
- The folds should **not begin moving before first contact**.
- When contact begins, the fold covers should open apart and reveal the underlying oval/rim rather than swapping by fade.
- The depth opening should sit **directly beneath the rim** and remain visually tucked under the folds.
- The thigh/body contours should not draw on top of the shaft or the revealed depth.

## Notes
- X-ray internals and the general simulator logic are preserved.
- Final visual review is still needed inside SillyTavern on the phone, because this environment cannot provide a trustworthy on-device screenshot review.

---

# Greyhaven Motion v0.1.29 — Clean Entrance Baseline

**Based directly on the user-supplied, working v0.1.23 ZIP.** This is deliberately a removal-only staging release; **the new fold illustration is not installed yet**.

## Removed from the renderer
- All old external fold shapes and their inner outlines, including the duplicate skin-colored oval/side occluder shapes.
- The small pointed central fold insert and its old opening-dependent decoration.
- The old visible rim stroke, entrance bridge decoration, and separate X-ray entrance rim/bridge overlay.
- The previous dark external depth-shadow ellipse.

## Preserved deliberately
- **Approved body and thigh paths, including their off-screen continuation, exactly as supplied.** The thigh outline source segment has the same SHA-256 as the locked baseline.
- **Existing penetration/shaft occlusion:** the moving-shaft edge clip and opaque skin cover still use the exact same edge geometry. These are not the decorative rim and must remain until the new fold system is integrated.
- The X-ray belly window and its internal canal/womb illustration (only the redundant *external* rim was removed).
- Shaft/protection/tear rendering, response waves, squirt droplets, wetness, blood, pre-fluid, event counters/summaries, automatic motion, and the 60/120 Hz physics setting.
- `sim.js`, `index.js`, `style.css`, `skins.js`, `eventManager.js`, and `responseWave.js` were verified byte-for-byte unchanged from the uploaded v0.1.23 ZIP.

## Expected appearance and future work
The entrance area will **look intentionally plain/unfinished** until the replacement illustrations are added. The existing seam and triangular gap formed by the original thigh outlines can still be visible because those outlines are preserved; this patch does not redraw the thighs or introduce a new mask.

In the next release, insert the new fold/rim/depth artwork at the `clean entrance canvas area` marker in `renderMissionary.js`, carefully placing the under-shaft depth layer before the moving-shaft layer and the surface contours after it. The shaft occlusion path should remain independent of the decorative entrance shapes.

## Tests and installation
- All **11 Node regression suites** passed, including `tests/v029-clean-entrance.mjs`, which exercises both X-ray and external rendering with movement and an active squirt effect.
- The ZIP was integrity-checked. A true phone-browser visual screenshot was not available in this environment, so final visual appearance still needs checking in SillyTavern.

Back up your current extension, replace its files with the ZIP contents (files at ZIP root), reload SillyTavern, then press Reset for a clean test scene.

---

# Greyhaven Motion v0.1.23 — Fold Refinement, X-ray Cover & Visible Response Waves

## Repairs in this release
- **Preserved approved thigh illustration:** the entire existing thigh outline path from v0.1.22 is unchanged, including the off-screen lower continuation. No new giver body art was introduced.
- **Visible thigh response waves:** the response button now drives the same already-present thigh motion transforms as ordinary movement, even when the scene is near 0% depth. The second oscillation that could suppress movement at the response peak has been removed; both the quick waves and final hold now have a coherent smooth effect.
- **Refined small folds:** replaced the separate floating oval overlays with two small continuous skin-colored folds, with no outlined top cap. Their inner contours gently deform with opening/contraction; the outer curves remain anchored by the shared pelvis transform. A subtle pointed darker insert sits underneath, and the left fold is drawn last so its outline is preserved.
- **X-ray rim/depth at rest:** the existing entrance skin bridge and rim are now drawn in X-ray mode even before contact, rather than disappearing until insertion. The main oval cutaway retains its dimensions and position.
- **Preserved:** protection effects, previous release animations, scene-level event manager, summary/count improvements, giver auto mode, persistent wetness and 60/120 Hz physics setting.

## Verification
- All ten automated Node tests passed, including `tests/v023-fold-wave-xray.mjs`, which verifies the rim at 0% depth in X-ray, visible response-induced leg rotation without contact, and the exact approved thigh path via a stable hash.
- Final artistic appearance and animation smoothness should be checked inside SillyTavern on the intended phone. The headless-browser screenshot attempt stalled and is not counted as a successful visual review.

**Installation:** Keep a backup of v0.1.22, replace the extension files using this ZIP (at root), reload SillyTavern, and use Reset for a fresh visual test. Saved settings remain in SillyTavern.

---

# Greyhaven Motion v0.1.22 — Visual Recovery Repair

## What's new
- **Visual recovery from v0.1.21:** the taker body/thigh illustration has been restored to the stable **v0.1.20** visual base. The failed fold redesign and the experimental giver lower-body extension have both been removed.
- **Off-screen lower continuation only:** the lower thigh continuation is now pushed farther below the frame so motion should no longer reveal a hard cut at the render-box edge. The visible thigh/body silhouette is otherwise unchanged.
- **Squirt summary clarification:** squirt events now read as an intense orgasm with a squirting response, **spraying fluids outward**, which should help the chat distinguish them from a regular finish.
- **Squirt also counts as orgasm:** pressing **Squirt** increments both the squirt counter and the orgasm counter while still logging a distinct squirt event.
- **Response-wave thigh motion retained:** the existing thigh motion system now also reacts to orgasm/squirt contractions, without changing the base drawing style.
- **Preserved v0.1.20 features:** auto motion controls, rim/X-ray bridge treatment, wetness buildup, contraction resistance, and the 60/120 Hz physics selector are all retained.

## Notes and testing
- `node tests/v020-auto-residue.mjs` checks the new persistent squirt residue, auto-motion wiring and the updated renderer hooks.
- Run **all** `tests/*.mjs` to check regressions from previous releases; all nine suites passed during packaging.
- `tests/visual-smoke-v019.html` is still available for an optional manual browser smoke check. Final appearance should still be reviewed in SillyTavern on the target device.
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

## v0.1.30
- rebuilt the external entrance artwork from the user sketch set instead of reusing the removed fold block
- added fixed thigh-border cover lines that mask the older V outline locally without moving the whole body
- added a separate depth opening under-layer plus separate rim/fold over-layers so the shaft can still disappear at depth
- lip/fold motion now morphs locally from closed -> slightly open -> active open using real-time depth/contact instead of one bouncing block
- mirrored the new entrance look in both non-X-ray and X-ray modes while preserving the approved body and shaft occlusion logic

## v0.1.31 — Entrance contour and layering hotfix
- **Body contour redraw** is now a short, gently curved, stationary path rather than a linear foreground overlay. The older inner V outline is excluded from the thigh *stroke* only; the original thigh fill, shape, and off-screen extension remain untouched.
- **Foreground order corrected:** the replacement body contour draws after the original entrance skin cover but clips out the moving object, so its line no longer crosses over that object.
- **Extra animated diagonals and tilted inner crease strokes removed.** The remaining local fold contour is short and independently responsive.
- **Y detail realigned:** its two arms join the same upper point as the stem rather than forming a lower, detached V.
- **Upper opening made more visible:** filled rounded upper oval, larger curved rim and separate small central peak.
- **Real-time input and old physics preserved.** The standalone rendering checks sampled initial closed, shallow, medium, deep, withdrawn, and X-ray states. These checks do not guarantee the appearance on every phone; visually inspect before treating as a final design.
