"use strict";

const fs = require("node:fs");
const path = require("node:path");

function explicitTarget(argv) {
  const index = argv.indexOf("--target");
  return index >= 0 && argv[index + 1] ? path.resolve(argv[index + 1]) : null;
}

function pruneEmptyParents(filePath, target) {
  for (let current = path.dirname(filePath); current !== target && current.startsWith(`${target}${path.sep}`); current = path.dirname(current)) {
    try {
      fs.rmdirSync(current);
    } catch {
      break;
    }
  }
}

function enableCreatedFilePruning(argv) {
  const target = explicitTarget(argv);
  if (!target || fs.rmSync.__allsortedPrunesCreatedFiles) return;
  const remove = fs.rmSync;
  function removeAndPrune(filePath, options) {
    const result = remove.call(fs, filePath, options);
    if (!options?.recursive && path.resolve(filePath).startsWith(`${target}${path.sep}`)) pruneEmptyParents(path.resolve(filePath), target);
    return result;
  }
  removeAndPrune.__allsortedPrunesCreatedFiles = true;
  fs.rmSync = removeAndPrune;
}

function rejectUnknownArgs(argv, supportedArgs) {
  enableCreatedFilePruning(argv);
  const supported = new Set(supportedArgs);
  for (const arg of argv) {
    if (!arg.startsWith("--") || supported.has(arg)) continue;
    console.error(`Unknown argument: ${arg}`);
    console.error(`Usage: node ${process.argv[1]} [options]`);
    process.exit(2);
  }
}

module.exports = { rejectUnknownArgs, pruneEmptyParents, enableCreatedFilePruning };
