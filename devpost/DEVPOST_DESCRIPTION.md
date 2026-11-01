# MWNP No-Guess Field Assistant

## What it does
A hands-free troubleshooting assistant for industrial machine technicians. The tech reports a symptom ("EXTEND doesn't work") and the Lens answers **only from the machine's own job files**: it cites the schematic, outlines the parts in the circuit, traces the wire run on the machine, shows the expected voltage right at each test point, and walks the tech through the check order while they log real meter readings. It flags the fault ("F1 open"), gives the next action, supports a retest, keeps tech and agent notes, and builds a job report when the job is ended.

It's a **no-guess** system. Every pass/fail decision comes from tolerances stored in the job file, per test point and based on what that point feeds. If a reading doesn't match anything in the files, it turns amber and says so — it never invents a cause.

The demo machine is the MWNP 1.0, a 12 VDC bench trainer I designed with its own schematic, netlist and panel layout.

## Who it's for
Field service and maintenance techs working on industrial machines — especially older equipment with hybrid relay/PLC control, where the fix starts with tracing a wire on a printed schematic while holding meter leads.

## Why glasses
On a phone or laptop I look away from the cabinet to find the schematic, then find the wire, then find the expected value. Here the expected voltage is at the part, the trace is drawn on the panel, and both hands stay on the meter leads.

## How I built it
I'm a service technician with limited programming background. I planned the Lens with the Devpost Learn skill pack (plan-lens) and built it with CLAD in Lens Studio 5.23.2. The agent is rule-based by design: it reads `netlist.json` (components, wires, test points with nominal/min/max and tolerance source, reading rules, faults and check order). 11 LEAF test scenarios cover the done criteria, layout, retest controls, hide/show, camera and navigation.

## What I learned
- Designing for an additive display: black is invisible, so contrast comes from bright text and smoke-gray plates, not dark backgrounds.
- The field of view is narrow; real-size content and readable cards compete for space.
- "No-guess" has to be designed in: tolerances live in the data, and the UI needs an explicit "I don't know" state.
- Preview stand-ins: pinch-to-mark instead of live recognition, a button for every voice command.

## What's next
Reports are session-only in v1. Next they'll save on the glasses, send to the tech's phone as a PDF, and upload to a per-machine job history that can feed a maintenance system. Also: live component recognition and label reading → manual lookup (with permission), per-machine job history and printable reports, magnified view and camera filters, voice notes, AI-phrased answers grounded only in the job files, pneumatic and hydraulic schematics. v2 work in progress on the `v2-dev` branch.

## Safety
Reference aid only. Verify with a meter and follow lockout/tagout.
