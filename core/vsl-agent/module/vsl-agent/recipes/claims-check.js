"use strict";

const { claimCheck } = require("../src/index");

const HEADERS = {
  clear: "Clear. Nothing in this draft needs evidence or a qualification before it goes out.",
  review: "Review. Nothing blocks publication, but the statements below need a decision.",
  hold: "Hold. The statements marked hold need evidence, a qualification, or sign-off first.",
};

async function runRecipe(input = {}) {
  const text = String(input.text || input.draft || "");
  if (!text.trim()) return { status: "error", reply: "Pass the draft text to scan.", metadata: { taskClass: "content" } };
  const result = claimCheck(text);
  const lines = result.flags.map((flag) => [`- [${flag.severity === "block" ? "hold" : "review"}] ${flag.code}: "${flag.match}"`, `  ${flag.why}`, `  Do this: ${flag.fix}`].join("\n"));
  return {
    status: "ok",
    reply: [HEADERS[result.status], ...(lines.length ? ["", ...lines] : []), "", result.note].join("\n"),
    metadata: { taskClass: "content", ...result },
  };
}

module.exports = { runRecipe };
