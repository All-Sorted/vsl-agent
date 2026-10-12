"use strict";

const { checkTerms } = require("../src/index");

async function runRecipe(input = {}) {
  const result = checkTerms(input);
  const disclosed = result.disclosed.map((entry) => `- ${entry.term}: ${entry.value}`);
  const missing = result.missing.map((term) => `- MISSING: ${term}`);
  const header = result.status === "complete"
    ? "All material terms are present. They belong on screen before the ask."
    : `${result.missing.length} material term(s) are missing. A buyer cannot make a decision without them.`;
  return {
    status: "ok",
    reply: [header, "", ...disclosed, ...missing, "", result.rule].join("\n"),
    metadata: { taskClass: "content", ...result },
  };
}

module.exports = { runRecipe };
