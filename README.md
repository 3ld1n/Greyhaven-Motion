Greyhaven Motion v0.1.6 – action/render stability + anatomy pass

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
