# All Sorted VSL workflow, 1.1

This workflow layer complements the official All Sorted VSL planner and workflow module 1.2. The core provides offline plans, terms and claim checks. Your chosen agent writes and revises the script using this workflow; no separate model API key or paid generation is required. It does not predict performance or publish anything.

## Outcome

Turn the user’s own approved offer into a recordable draft, a visual storyboard, three opening options and one short ad version. Begin with accessible AIOS context. Never assume All Sorted itself is the user’s offer.

## Context first

Read the active project’s context, second brain, brand brain, voice, website, customer research, sales notes and approved Meta plan. Keep a sources table with actual paths or URLs and distinguish facts, proposals and unknowns. Use only relevant accessible sources, never scan unrelated private folders or assume other chats are accessible. Prioritise current approved prices and terms. Ask a bundled focused question only when a material fact is missing or conflicting. Continue writing safe sections while a genuine human gate remains. Never silently select a different offer.

## Framework decision

Load frameworks.json and example-patterns.json. Compare the offer type, buyer awareness, traffic source, purchase/application event, complexity, available demonstrations and proof. Recommend one primary framework, one optional secondary and a concise reason. Show a second viable choice so the user can choose, then write the best justified default unless the user chooses differently. No framework guarantees conversion. Do not force a long VSL on a simple local appointment offer.

Study all E1 to E34 as structural references. Give the selected pattern IDs and what transfers. Do not copy reference scripts or use reference claims as user proof. EXAMPLES.md contains original fictional exercises and source limits.

## Draft and revise

1. Build a factual brief: one offer, buyer situation, mechanism in plain words, demonstrated benefits, real objections, price, billing, delivery, refund/guarantee terms, eligibility and one CTA. Use no invented root cause.
2. Choose placement and useful duration. Keep a landing-page VSL separate from a 30 to 60 second paid-ad cut. Adjust for the actual offer and reading pace, not a mandatory long duration.
3. Write three genuinely different hooks: situation, demonstration and question/story. Use the buyer’s words without asserting personal sensitive traits.
4. Write the full spoken script, not a beat-plan disguised as copy. Show a table with approximate time, spoken words, visual direction, on-screen text and source/proof dependency. Transitions must make sense aloud. Count words and estimate runtime at 130 to 160 words per minute, including pauses. Record the assumptions.
5. Keep claims in a register tied to an actual source. Mark unsupported facts NEEDS_EVIDENCE and exclude them from the recordable draft. Original invented dialogue in a fictional exercise is not a real testimonial. Use genuine permission for likenesses or customer material.
6. State material terms before the last CTA. Read-only core claims/terms checks flag wording for review, not certification. Run them on the actual draft/brief; manually review images, page match and context.
7. Critique the first draft for buyer fit, voice, clarity, causal logic, proof, objections, terms, pacing and one clear next step. Revise weak sections, remove filler, read it aloud and show the changes. Never invent performance data to justify a preferred draft.
8. Deliver vsl-brief.json, framework-decision.md, vsl-script.md, vsl-storyboard.md, short-ad-script.md and claims-register.md in a new dated output folder without replacing existing work. Status is DRAFT or READY_TO_RECORD only after all source/terms checks pass. Approval, paid rendering and publication are separate human decisions.

## Boundaries and recovery

No secrets in chat or output, no changes to Meta or websites, no paid media calls, external contact, schedules or global instructions. Never disable safety checks. Diagnose failures within this install/output folder, preserve work, make the smallest reversible repair and retry the exact check. After two failures without new evidence, report what was tried and the one next action, then continue independent work. Missing login, credentials or approval stays NEEDS_INPUT; ambiguity or unsafe repair stays NEEDS_REVIEW. Do not call a partial install or incomplete script finished.
