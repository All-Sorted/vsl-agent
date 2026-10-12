"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { assertPathInsideTarget } = require("./target-resolve");

function backupTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function uniqueBackupPath(filePath, date = new Date()) {
  const base = `${filePath}.bak-${backupTimestamp(date)}`;
  let candidate = base;
  let suffix = 0;
  while (fs.existsSync(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

function backupExisting(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return null;
  let backupPath = options.backupPath || uniqueBackupPath(filePath, options.date);
  if (options.backupPath && fs.existsSync(backupPath)) {
    let suffix = 1;
    while (fs.existsSync(`${options.backupPath}-${suffix}`)) suffix += 1;
    backupPath = `${options.backupPath}-${suffix}`;
  }
  const before = fs.lstatSync(filePath);
  if (!before.isFile()) throw new Error(`Backup source must be a regular file: ${filePath}`);
  const bytes = fs.readFileSync(filePath);
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backupPath, before.mode & 0o777);
  const after = fs.lstatSync(filePath);
  if (before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
      digest(bytes) !== digest(fs.readFileSync(filePath)) || digest(bytes) !== digest(fs.readFileSync(backupPath))) {
    throw new Error(`Backup verification failed; source or copy changed: ${filePath}`);
  }
  return backupPath;
}

function backupIntoTree(filePath, targetRoot, backupRoot) {
  assertPathInsideTarget(targetRoot, filePath, "backup source");
  assertPathInsideTarget(targetRoot, backupRoot, "backup destination");
  if (!fs.existsSync(filePath)) return null;
  const relativePath = path.relative(targetRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to back up path outside target: ${filePath}`);
  }
  const backupPath = assertPathInsideTarget(targetRoot, path.join(backupRoot, relativePath), "backup destination");
  return backupExisting(filePath, { backupPath });
}

module.exports = { backupTimestamp, uniqueBackupPath, backupExisting, backupIntoTree };
