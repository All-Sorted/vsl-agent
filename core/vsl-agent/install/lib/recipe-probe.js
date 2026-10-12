#!/usr/bin/env node
"use strict";

// Sandboxed recipe-handler probe.
//
// This file is ALWAYS executed as a child process by recipe-contract.js, never
// required in-process. It loads one recipe handler from a shipped module and
// invokes it with synthetic inputs so the validator can tell a real handler
// apart from a canned stub.
//
// Everything that could reach a real service is disabled BEFORE the handler is
// loaded:
//   - global.fetch / Request / WebSocket           -> throw
//   - node:http, node:https  request/get           -> throw
//   - node:net, node:tls, node:dgram  connect      -> throw
//   - node:dns lookups                             -> throw
//   - node:child_process  exec/spawn/fork          -> throw
//   - node:fs mutations (unlink/rm/rename/write..) -> throw outside the scratch dir
//
// The parent additionally hands us a scrubbed environment with no credentials
// in it at all, so even a code path that evades a stub has nothing to
// authenticate with. Blocked calls raise a distinctive error the parent
// classifies as "handler is real but reached a gated boundary", which is a PASS
// signal, not a failure.

const SENTINEL = "__ALLSORTED_SANDBOX_BLOCKED__";

function blocked(operation) {
  const error = new Error(`${SENTINEL} ${operation}`);
  error.allsortedSandboxBlocked = operation;
  return error;
}

function blockAll(target, keys, label) {
  for (const key of keys) {
    if (typeof target[key] !== "function") continue;
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value: () => {
        throw blocked(`${label}.${key}`);
      },
    });
  }
}

function installSandbox(scratchDir) {
  // Node builds process.stdout/stderr LAZILY, and for a pipe it does so via
  // net.Socket. Touch them now, before net is locked down, or the very act of
  // reporting our result would trip our own sandbox.
  void process.stdout;
  void process.stderr;

  // ---- network: global surface ----------------------------------------
  for (const key of ["fetch", "WebSocket", "EventSource"]) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: () => {
        throw blocked(`global.${key}`);
      },
    });
  }
  globalThis.XMLHttpRequest = function XMLHttpRequest() {
    throw blocked("global.XMLHttpRequest");
  };

  // ---- network: node core modules -------------------------------------
  blockAll(require("node:http"), ["request", "get"], "http");
  blockAll(require("node:https"), ["request", "get"], "https");
  // net.Socket / tls.createSecureContext are NOT blocked: Node's own stdio and
  // module machinery construct them. Blocking `connect`/`createConnection` is
  // what actually stops a socket from reaching a remote host.
  blockAll(require("node:net"), ["connect", "createConnection"], "net");
  blockAll(require("node:tls"), ["connect"], "tls");
  blockAll(require("node:dgram"), ["createSocket"], "dgram");
  blockAll(require("node:dns"), ["lookup", "resolve", "resolve4", "resolve6"], "dns");
  try {
    blockAll(require("node:dns").promises, ["lookup", "resolve", "resolve4", "resolve6"], "dns.promises");
  } catch {
    /* dns.promises unavailable */
  }

  // ---- process execution ----------------------------------------------
  blockAll(
    require("node:child_process"),
    ["exec", "execFile", "execSync", "execFileSync", "spawn", "spawnSync", "fork"],
    "child_process"
  );

  // ---- filesystem mutation --------------------------------------------
  // Reads stay open (handlers legitimately read their own config/templates).
  // Mutations are refused unless they land inside the throwaway scratch dir.
  const fs = require("node:fs");
  const path = require("node:path");
  const MUTATORS = [
    "unlink", "unlinkSync", "rm", "rmSync", "rmdir", "rmdirSync",
    "rename", "renameSync", "truncate", "truncateSync",
    "writeFile", "writeFileSync", "appendFile", "appendFileSync",
    "mkdir", "mkdirSync", "copyFile", "copyFileSync", "cp", "cpSync",
    "createWriteStream", "chmod", "chmodSync", "chown", "chownSync",
    "symlink", "symlinkSync", "link", "linkSync", "open", "openSync",
  ];
  const resolvedScratch = path.resolve(scratchDir);
  const insideScratch = (candidate) => {
    try {
      const target = path.resolve(String(candidate));
      const relative = path.relative(resolvedScratch, target);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    } catch {
      return false;
    }
  };
  for (const key of MUTATORS) {
    const original = fs[key];
    if (typeof original !== "function") continue;
    Object.defineProperty(fs, key, {
      configurable: true,
      writable: true,
      value: function guarded(...args) {
        // `open`/`openSync` are read-capable; only refuse write-ish flags.
        if ((key === "open" || key === "openSync") && !/[wa+]/.test(String(args[1] ?? "r"))) {
          return original.apply(fs, args);
        }
        if (insideScratch(args[0])) return original.apply(fs, args);
        throw blocked(`fs.${key}`);
      },
    });
  }
  if (fs.promises) blockAll(fs.promises, MUTATORS.filter((k) => !k.endsWith("Sync")), "fs.promises");
}

// Probe payloads. Two structurally DIFFERENT inputs plus an empty one. A real
// handler either varies its output across them, rejects them for a declared
// reason, or reaches a gated boundary. A handler that returns the same bytes
// for all three while never reading its input is a stub.
function probeInputs(declaredArgs) {
  const variants = [
    { token: "alpha", ordinal: 1 },
    { token: "bravo", ordinal: 2 },
  ];
  const built = variants.map(({ token, ordinal }) => {
    const input = {
      __allsortedProbe: ordinal,
      id: `probe-${token}`,
      query: token,
      search: token,
      name: `Probe ${token}`,
      title: `Probe ${token}`,
      text: `probe ${token}`,
      email: `probe-${token}@example.invalid`,
      domain: `${token}.example.invalid`,
      url: `https://${token}.example.invalid/`,
      path: `probe-${token}.txt`,
      limit: ordinal,
      dryRun: true,
      execute: false,
    };
    // Anything the recipe DECLARES as required gets supplied, so a thrown
    // "X is required" can only mean the handler demands an undeclared arg.
    for (const key of declaredArgs) {
      if (input[key] === undefined) input[key] = `probe-${token}`;
    }
    return input;
  });
  built.push({ __allsortedProbe: 0 });
  return built;
}

function serializeError(error) {
  if (error && error.allsortedSandboxBlocked) {
    return { kind: "blocked", operation: error.allsortedSandboxBlocked, message: String(error.message) };
  }
  return {
    kind: "throw",
    name: (error && error.name) || "Error",
    code: (error && error.code) || null,
    message: error && error.message ? String(error.message) : String(error),
  };
}

async function main() {
  const payload = JSON.parse(process.argv[2] || "{}");
  const { handlerPath, declaredArgs = [], scratchDir } = payload;

  installSandbox(scratchDir || require("node:os").tmpdir());

  const result = { handlerPath, exports: null, invocations: [], loadError: null };

  let handlerModule;
  try {
    handlerModule = require(handlerPath);
  } catch (error) {
    result.loadError = serializeError(error);
    process.stdout.write(`__ALLSORTED_RESULT__${JSON.stringify(result)}`);
    return;
  }

  const runRecipe = handlerModule && handlerModule.runRecipe;
  result.exports = {
    keys: handlerModule && typeof handlerModule === "object" ? Object.keys(handlerModule) : [],
    hasRunRecipe: typeof runRecipe === "function",
    runRecipeLength: typeof runRecipe === "function" ? runRecipe.length : null,
  };

  if (typeof runRecipe !== "function") {
    process.stdout.write(`__ALLSORTED_RESULT__${JSON.stringify(result)}`);
    return;
  }

  for (const input of probeInputs(declaredArgs)) {
    try {
      const value = await runRecipe(input);
      result.invocations.push({
        input: { probe: input.__allsortedProbe },
        outcome: "returned",
        // Canonicalized so identical replies compare equal byte-for-byte.
        shape: {
          isObject: Boolean(value) && typeof value === "object" && !Array.isArray(value),
          status: value && typeof value === "object" ? value.status : undefined,
          replyType: value && typeof value === "object" ? typeof value.reply : "undefined",
          artifactsType: value && typeof value === "object"
            ? (Array.isArray(value.artifacts) ? "array" : typeof value.artifacts)
            : "undefined",
          metadataType: value && typeof value === "object"
            ? (value.metadata === null ? "null" : typeof value.metadata)
            : "undefined",
          keys: value && typeof value === "object" ? Object.keys(value).sort() : [],
        },
        fingerprint: safeStringify(value),
      });
    } catch (error) {
      result.invocations.push({
        input: { probe: input.__allsortedProbe },
        outcome: "threw",
        error: serializeError(error),
      });
    }
  }

  process.stdout.write(`__ALLSORTED_RESULT__${JSON.stringify(result)}`);
}

function safeStringify(value) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (key, entry) => {
      if (entry && typeof entry === "object") {
        if (seen.has(entry)) return "[circular]";
        seen.add(entry);
      }
      if (typeof entry === "function") return "[function]";
      if (typeof entry === "bigint") return entry.toString();
      return entry;
    });
  } catch {
    return String(value);
  }
}

main().catch((error) => {
  process.stdout.write(
    `__ALLSORTED_RESULT__${JSON.stringify({ fatal: serializeError(error) })}`
  );
});
