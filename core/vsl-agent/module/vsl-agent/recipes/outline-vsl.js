"use strict";

const { outline } = require("../src/index");

async function runRecipe(input = {}) {
  const result = outline(input);
  const lines = result.beats.map((beat, index) => `${index + 1}. ${beat.name}: ${beat.goal}${beat.needs.length ? ` [blocked on ${beat.needs.join(", ")}]` : ""}`);
  return {
    status: "ok",
    reply: [`Beat sheet (${result.readiness}):`, "", ...lines, "", result.note].join("\n"),
    metadata: { taskClass: "content", readiness: result.readiness, blockedBeats: result.blockedBeats },
  };
}

module.exports = { runRecipe };
