"use strict";

// Zero-network readiness report.
//
// This module needs no credential: no API key, no account, no outbound call.
// It plans and checks. It does not generate copy and it does not record video,
// so there is nothing to connect and nothing to authorise.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

module.exports.runRecipe = async function runRecipe() {
  const brainPresent = fs.existsSync(path.join(ROOT, "BRAIN.md"));
  const examplePresent = fs.existsSync(path.join(ROOT, "examples", "sample-brief.json"));
  const configPath = path.join(ROOT, "config.example.json");
  const configPresent = fs.existsSync(configPath);
  let configParses = false;
  if (configPresent) {
    try { JSON.parse(fs.readFileSync(configPath, "utf8")); configParses = true; } catch { configParses = false; }
  }

  const lines = [
    "Credentials: none required. No API key, no account, no outbound call.",
    `Craft brain: ${brainPresent ? "present" : "MISSING, reinstall the module"}.`,
    `Example brief: ${examplePresent ? "present" : "MISSING, reinstall the module"}. It is invented and exists to make the first run work.`,
    `Settings template: ${configPresent ? (configParses ? "present and valid" : "present but not valid JSON") : "MISSING"}.`,
    "Scope: this plans a video and checks a draft. It does not write finished copy, generate voice, or produce video.",
    "Every plan it returns is written by a person afterwards, and every claim flag needs a person to settle it.",
    brainPresent && examplePresent ? "Ready: yes. Hand it a brief and it works today, with no setup." : "Ready: partly. Reinstall to restore the file(s) marked above.",
  ];

  return {
    status: "ok",
    reply: lines.join("\n"),
    metadata: { credentialsRequired: false, configured: brainPresent && examplePresent, brainPresent, examplePresent, configPresent, configParses, network: false, generatesCopy: false },
  };
};
