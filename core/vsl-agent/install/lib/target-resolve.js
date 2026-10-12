"use strict";

const fs = require("node:fs");
const path = require("node:path");

function pathExists(filePath) {
  try { fs.accessSync(filePath); return true; } catch { return false; }
}

function assertPathInsideTarget(targetRoot, candidate, purpose = "write") {
  const root = path.resolve(targetRoot);
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) return resolved;
  throw new Error(`Refusing ${purpose} outside resolved target root: ${resolved}`);
}

function validateTargetShape(targetDir, shape = {}) {
  if (!targetDir || !pathExists(targetDir)) return false;
  for (const relativePath of shape.requiredPaths || []) {
    if (!pathExists(path.join(targetDir, relativePath))) return false;
  }
  for (const group of shape.anyOf || []) {
    if (!group.some((relativePath) => pathExists(path.join(targetDir, relativePath)))) return false;
  }
  return true;
}

// Structural shape is NOT ownership. A customer's own Next.js app can match
// package.json + app/api + lib + app/app/layout.tsx exactly, and one did on a
// real customer machine: CRM discovery walked up five parents, adopted it, and
// would have overwritten it. The product promises it "never merges into a
// non-empty foreign directory"; this enforces that.
//
// Opt-in per module via targetResolution.requireOwnershipMarker so modules with
// different target semantics keep their current behaviour until each is checked.
const OWNERSHIP_MARKERS = [
  ".mission-control-core.json",
  ".allsorted-mc-core-manifest.json",
  ".allsorted-crm-install.json",
  ".allsorted-install.json",
];

function isAllSortedOwned(targetDir) {
  return OWNERSHIP_MARKERS.some((marker) => pathExists(path.join(targetDir, marker)));
}

function refuseUnowned(dirs) {
  const listed = dirs.map((dir) => `  ${dir}`).join("\n");
  const error = new Error(
    `Refusing to install into a directory All Sorted does not own.\n` +
    `These match the expected shape but carry no All Sorted marker, so they were left untouched:\n${listed}\n` +
    `Install mission-control-core there first, or pass --target to an All Sorted install.`
  );
  error.code = "ALLSORTED_TARGET_NOT_OWNED";
  return error;
}

function resolveTargetDir(explicitTarget, config = {}) {
  if (explicitTarget) {
    const resolved = path.resolve(explicitTarget);
    const acceptsAnyDirectory = !(config.shape?.requiredPaths || []).length && !(config.shape?.anyOf || []).length;
    if (acceptsAnyDirectory && !pathExists(resolved)) fs.mkdirSync(resolved, { recursive: true });
    if (validateTargetShape(resolved, config.shape)) {
      if (config.requireOwnershipMarker && !isAllSortedOwned(resolved)) throw refuseUnowned([resolved]);
      return resolved;
    }
    throw new Error(config.notFoundMessage || `Explicit target is not compatible: ${resolved}`);
  }
  const candidates = [];
  let cursor = process.cwd();
  const parentDepth = Number.isInteger(config.parentDepth) ? config.parentDepth : 5;
  for (let depth = 0; depth <= parentDepth; depth += 1) {
    candidates.push(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const roots = [...new Set(candidates)];
  for (const root of roots) {
    for (const hint of config.childHints || []) candidates.push(path.join(root, hint));
  }
  const unowned = [];
  for (const candidate of [...new Set(candidates)]) {
    if (!validateTargetShape(candidate, config.shape)) continue;
    if (!config.requireOwnershipMarker || isAllSortedOwned(candidate)) return candidate;
    unowned.push(candidate);
  }
  if (unowned.length) throw refuseUnowned(unowned);
  throw new Error(config.notFoundMessage || "Could not find a compatible target. Re-run with --target <path>.");
}

module.exports = { pathExists, validateTargetShape, resolveTargetDir, assertPathInsideTarget, isAllSortedOwned, OWNERSHIP_MARKERS };
