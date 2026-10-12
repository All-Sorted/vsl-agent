"use strict";

// Critique is deliberately not the same check as claims-check. Claims-check
// asks "is any statement here going to get you in trouble". Critique asks
// "does this draft actually do the job a sales video has to do": does it cover
// the beats, in an order a viewer can follow, with the terms disclosed before
// the ask, and does it end with one reversible next step.

const { claimCheck } = require("../src/index");

const COVERAGE = [
  { beat: "Hook", test: /^[\s\S]{0,400}?\b(?:you|your|ever|if you|when you|most|every)\b/i, missing: "The opening does not address the viewer directly in the first few lines." },
  { beat: "Stakes", test: /\b(?:cost(?:s|ing)?|lose|losing|waste|wasted|missed|behind|stuck|slow)\b/i, missing: "Nothing here says what leaving the problem alone costs." },
  { beat: "Mechanism", test: /\b(?:because|the way it works|works by|how it works|the reason|so that)\b/i, missing: "The draft never explains why this works." },
  { beat: "Proof", test: /\b(?:for example|here is|here's|we measured|the data|screenshot|walkthrough|case|result(?:s)?)\b/i, missing: "No evidence is pointed at anywhere in the draft." },
  { beat: "Objections", test: /\b(?:but |you might|you may be|if you are (?:worried|thinking)|what if|sceptical|skeptical|not sure)\b/i, missing: "No objection is answered on camera." },
  { beat: "Terms", test: /\b(?:price|pricing|costs?|per month|per year|refund|guarantee|delivery|included|who (?:it|this) is (?:not )?for)\b/i, missing: "Material terms are never stated, so the viewer cannot decide." },
  { beat: "Call to action", test: /\b(?:click|book|reply|request|start|join|apply|download|get started|next step)\b/i, missing: "There is no clear ask at the end." },
];

function structure(draft) {
  const gaps = COVERAGE.filter((entry) => !entry.test.test(draft));
  const asks = (draft.match(/\b(?:click|book|reply|request|apply|join|download|sign up)\b/gi) || []).length;
  const notes = gaps.map((entry) => `- ${entry.beat}: ${entry.missing}`);
  if (asks > 3) notes.push(`- Call to action: the draft asks ${asks} times. Ask once, at the end, for one thing.`);
  return { covered: COVERAGE.length - gaps.length, total: COVERAGE.length, gaps: gaps.map((entry) => entry.beat), notes };
}

async function runRecipe(input = {}) {
  const draft = String(input.text || input.draft || "");
  if (!draft.trim()) return { status: "error", reply: "Pass the draft script to critique.", metadata: { taskClass: "content" } };
  const shape = structure(draft);
  const claims = claimCheck(draft);
  const claimLines = claims.flags.map((flag) => `- [${flag.severity === "block" ? "hold" : "review"}] ${flag.code}: "${flag.match}". ${flag.fix}`);
  const reply = [
    `Structure: ${shape.covered} of ${shape.total} beats are doing their job.`,
    ...(shape.notes.length ? ["", ...shape.notes] : []),
    "",
    claims.flags.length ? `Claims: ${claims.status}.` : "Claims: clear.",
    ...(claimLines.length ? claimLines : []),
    "",
    "Structure checks look for the shape of each beat in the wording. They are a prompt to look, not a grade.",
  ].join("\n");
  return {
    status: "ok",
    reply,
    metadata: { taskClass: "content", structure: shape, claims },
  };
}

module.exports = { runRecipe, structure };
