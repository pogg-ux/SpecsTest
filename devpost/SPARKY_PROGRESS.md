Done: branch sparky-voice created from main b6af914; ASR spike results known (works in Preview; partials ~1 Hz, finals 0.6-2.0 s after the phrase is complete; camera frames keep flowing); read MWNPAgent.
In progress: designing the command layer (Agent stepForward/stepBack + snapshot/restore for undo, Main.voiceCommand dispatcher).
Next step: add the Agent methods, then Main.voiceCommand, then Assets/Scripts/SparkyVoice.ts (wake word, partial-first parsing, 2 s dedup, indicator, typed-text hook), then the LEAF scenario, README/Devpost text; clips stretch only after core commands pass.
