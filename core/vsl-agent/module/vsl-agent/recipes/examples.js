"use strict";

const path = require("node:path");
const { create } = require("../src/index");

async function runRecipe() {
  const brief = require(path.join(__dirname, "..", "examples", "sample-brief.json"));
  const result = create(brief);
  return {
    status: "ok",
    reply: ["A worked example built from the invented brief that ships with this module:", "", result.script].join("\n"),
    metadata: { taskClass: "content", synthetic: true, planStatus: result.status },
  };
}

module.exports = { runRecipe };
