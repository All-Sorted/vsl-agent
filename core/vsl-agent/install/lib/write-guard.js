"use strict";

const fs = require("node:fs");
const path = require("node:path");

// path.resolve() normalises "..", but it does NOT resolve symlinks, and that gap
// silently broke every install run from a temp directory. macOS resolves /var to
// /private/var, so a declared root of /var/folders/X never prefix-matched a write
// to /private/var/folders/X even though the write was genuinely inside the
// module. The module was refused permission to write to its own directory.
//
// canonical() resolves symlinks across the deepest existing part of the path,
// then re-appends the part that does not exist yet (mkdirSync targets never
// exist at check time). Applying it to BOTH sides is what makes the comparison
// sound. Do not weaken this to a looser string match: this guard is the only
// thing stopping a module writing outside the paths it declared.
function canonical(input) {
  let current = path.resolve(String(input));
  const trailing = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...trailing);
    } catch {
      const parent = path.dirname(current);
      // Walked to the filesystem root without finding anything that exists.
      if (parent === current) return path.resolve(String(input));
      trailing.unshift(path.basename(current));
      current = parent;
    }
  }
}

const ROOTS = (() => {
  try {
    const parsed = JSON.parse(process.env.ALLSORTED_WRITE_GUARD_ROOTS || "[]");
    return Array.isArray(parsed) ? parsed.map((entry) => canonical(entry)) : [];
  } catch {
    return [];
  }
})();

function isAllowed(targetPath) {
  const resolved = canonical(targetPath);
  return ROOTS.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
}

function guard(targetPath, action) {
  if (!ROOTS.length || isAllowed(targetPath)) return;
  throw new Error(`[allsorted-write-guard] Refusing ${action} outside declared install roots: ${targetPath}`);
}

function patch(name, pathIndexes) {
  const original = fs[name];
  if (typeof original !== "function" || original.__allsortedWriteGuardPatched) return;
  function guarded(...args) {
    for (const index of pathIndexes) {
      if (typeof args[index] === "string") guard(args[index], name);
    }
    return original.apply(fs, args);
  }
  guarded.__allsortedWriteGuardPatched = true;
  fs[name] = guarded;
}

patch("appendFileSync", [0]);
patch("copyFileSync", [1]);
patch("cpSync", [1]);
patch("mkdirSync", [0]);
patch("renameSync", [0, 1]);
patch("rmSync", [0]);
patch("unlinkSync", [0]);
patch("writeFileSync", [0]);
