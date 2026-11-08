@AGENTS.md

## Layout rules (do not break)

- Never move, resize or re-anchor any UI element (chips, cards, buttons, tags, the cabinet) unless the prompt explicitly asks for that element to move.
- If a fix seems to require moving something, stop and ask first. Don't move it to make a test pass.
- Layout tests that fail because of a position must be reported, not "fixed" by relocating things.
- The approved layout is the card-alignment layout: the Library chip with the mic indicator next to it sits just above the cabinet's top-left corner, left-aligned with the enclosure edge. The Show/Hide toggle sits just above the cabinet's top-right corner, right-aligned with the enclosure edge.
