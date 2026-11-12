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
