Done: Sparky keeps listening while hidden (root cause: an already-handled counter carried over when ASR sent no final, so the next command was swallowed; fixed) and auto-shows the display for card commands; aliases (show/open library/options/job/report/camera); S1 up/down by voice; pause/resume of ASR around clips is logged; mwnp-sparky-hidden passes.
In progress: user's live test (hide -> show, S1 up/down at the retest).
Next step: read the [SPARKY-VOICE] lines if any command is still missed; add the heard phrase as an alias.
