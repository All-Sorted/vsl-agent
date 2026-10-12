"use strict";

const { create } = require("../src/index");

async function runRecipe(input = {}) {
  const result = create(input);
  const header = result.status === "needs_input"
    ? "Plan drafted, but some beats are blocked on brief material that was not supplied."
    : "Plan drafted. Every beat has what it needs.";
  const gaps = result.plan.blockedBeats.map((entry) => `- ${entry.beat}: needs ${entry.needs.join(", ")}`);
  const terms = result.terms.missing.length ? [`Material terms still missing: ${result.terms.missing.join(", ")}.`] : [];
  const claims = result.claims.flags.length ? [`Claim flags raised on the plan text: ${result.claims.flags.map((flag) => flag.code).join(", ")}.`] : [];
  return {
    status: "ok",
    reply: [header, "", result.script, "", ...gaps, ...terms, ...claims, "", result.note].filter((line) => line !== undefined).join("\n"),
    metadata: { taskClass: "content", planStatus: result.status, blockedBeats: result.plan.blockedBeats, missingTerms: result.terms.missing, claims: result.claims },
  };
}

module.exports = { runRecipe };
