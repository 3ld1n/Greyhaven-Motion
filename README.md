# Greyhaven Motion v0.1.0

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
