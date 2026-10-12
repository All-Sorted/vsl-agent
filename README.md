# All Sorted VSL agent, standalone 1.1

Use your own offer and buyer context to build a full spoken script, three hooks, timed storyboard and short ad version. The included workflow helps your chosen agent discover approved facts, compare six frameworks, check claims and terms, and revise the draft with you. The offline planner remains available for beat sheets and evidence checks. No separate API key or paid generation is required.

## Install

Use Node 24 LTS or newer on macOS or Linux. Windows is not supported by this installer. Choose an empty dedicated folder, or a clean existing All Sorted target. Existing edited files and symlink targets are refused before writes.

Run `node install.cjs --target "your dedicated folder"` from this extracted release. Repeat the same command to verify a clean installation. The package does not register itself globally, change accounts, install schedules or call paid services.

## Use and verify

Run `node core/vsl-agent/install/validate-vsl-agent.js --target "your dedicated folder"` and `node "your dedicated folder/vsl-agent/workflow/workflow.cjs" validate`.

Ask your chosen agent: Read vsl-agent/workflow/BRAIN.md, discover my relevant approved offer, voice and buyer context, then write and revise my full VSL. Recommend a primary framework and alternative. Include three hooks, timed storyboard, short ad cut, source-linked claims and terms. Ask only for material missing or conflicting facts. Save new dated versions and obtain my approval before recording or publishing.

For a ready-to-use workflow prompt, run `node "your dedicated folder/vsl-agent/workflow/workflow.cjs" script-prompt --input "your brief.json"`. The command emits instructions; your chosen agent writes the script. It does not certify claims or predict conversion performance. Paid rendering and publication remain separate decisions.

Run `node --test tests/install.test.cjs` in this extracted release to exercise install boundaries. The manifest lists exact file hashes. Preserve all included license files. Public download does not grant resale or bulk redistribution rights beyond those license terms.
