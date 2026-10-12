"use strict";

const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathExists } = require("./target-resolve");

function detectPackageManager(targetDir) {
  if (pathExists(path.join(targetDir, "pnpm-lock.yaml"))) return { command: "pnpm", args: ["install"] };
  if (pathExists(path.join(targetDir, "yarn.lock"))) return { command: "yarn", args: ["install"] };
  return { command: "npm", args: ["install"] };
}

function installDependencies(targetDir, options = {}) {
  const manager = detectPackageManager(targetDir);
  if (options.dryRun) return manager;
  execFileSync(manager.command, manager.args, { cwd: targetDir, stdio: "inherit" });
  return manager;
}

function installPackages(targetDir, packages, options = {}) {
  if (!Array.isArray(packages) || packages.length === 0) throw new Error("Package installation requires at least one declared package");
  const manager = detectPackageManager(targetDir);
  const command = manager.command;
  const args = command === "npm" ? ["install", ...packages] : ["add", ...packages];
  if (options.dryRun) return { command, args };
  execFileSync(command, args, { cwd: targetDir, stdio: "inherit" });
  return { command, args };
}

module.exports = { detectPackageManager, installDependencies, installPackages };
