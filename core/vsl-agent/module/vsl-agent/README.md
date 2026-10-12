# Video Sales Letter Planner

The offline CLI plans a sales video and checks terms and claims. Your user-selected agent writes and revises the full script using the included AIOS-first workflow.

Four things it does, from the brief you give it rather than from a stock template:

1. **Outline** turns the brief into an ordered beat sheet: hook, stakes, mechanism, demonstration, proof, objections, offer and terms, call to action. Every beat carries your actual offer, audience, problem, mechanism and proof, and any beat missing the material to write it is marked blocked, naming what is absent.
2. **Create** produces the full plan plus a terms check and a claim scan of its own text.
3. **Claims** scans a draft for the categories of statement that need evidence, a qualification, or professional sign-off before publication: guarantees, absolutes, earnings, health, legal or tax, scarcity, effort and speed, asserted authority, comparisons, and results projected onto the reader. Each flag says why it fired and what to do about it.
4. **Terms** checks that price, billing frequency, what they get and when, guarantee terms, and who it is not for are all present before the ask.

The writing workflow produces a recordable script, three hooks, storyboard and short ad cut after discovering your approved offer and evidence. It runs offline, needs no account and no API key, and makes no outbound call.

It never invents a result, a testimonial, a deadline, a comparison, or a guarantee. Where your brief is silent it says so and stops. A person reviews everything before it is published.

```sh
node src/index.js demo
node src/index.js outline --input brief.json
node src/index.js create --input brief.json --output plan.json
node src/index.js terms --input brief.json
node src/index.js claims --input draft.json
```

Keep customer records, source documents, and unpublished creative outside this module.

## Full script workflow

Read workflow/BRAIN.md with your agent. Reuse your relevant accessible project, brand, voice and buyer context. The agent asks only when material facts are missing or conflicting, compares six frameworks, recommends a primary and alternative, and revises the actual words with you. It saves each revision without replacing prior work. Source-backed claims, disclosed terms and your approval are required before recording or publishing.

Run node workflow/workflow.cjs validate, then node workflow/workflow.cjs script-prompt --input examples/sample-brief.json to produce the prompt. An emitted prompt is not a finished script. This package makes no model calls and cannot certify claims or predict conversions.
