#!/usr/bin/env node
"use strict";

// Shared recipe-layer validation capability.
//
// WHY THIS EXISTS
// ---------------
// Customers reach a module through its RECIPE layer, but module validators
// historically only exercised the CLI. That let "split modules" ship: a real
// CLI bolted to a canned recipe layer, or real recipes bolted to a stubbed CLI.
// Both install PASS because the broken half is the half nobody checks.
//
// This module is the missing half. For every shipped `*.recipe.json` it:
//   1. resolves and loads the declared handler,
//   2. asserts the handler exports the codebase contract
//      `runRecipe(input) -> { status, reply, artifacts?, metadata? }`,
//   3. invokes it credential-free in a sandboxed subprocess and proves the
//      response is a real envelope rather than a canned string,
//   4. detects duplicate recipes (two recipe files that are byte-identical, or
//      two recipes advertising the same id) - the advertised recipe does not
//      actually exist.
//
// SAFETY
// ------
// Handlers belong to modules that send messages, delete files and move data.
// Invocation therefore happens ONLY in `recipe-probe.js`, a child process that
// (a) receives an explicitly-constructed environment with every credential
// removed - built as an object, never via a shell, so nothing can silently
// no-op - and (b) disables fetch/http/https/net/tls/dns/child_process and all
// filesystem mutation before the handler is loaded.
//
// On top of that sandbox, recipes that declare a destructive or approval-gated
// action, or whose id/title/actions match a send-or-destroy verb, are NEVER
// invoked. They are asserted statically instead, and the report says which
// treatment each recipe received.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PROBE_SCRIPT = path.join(__dirname, "recipe-probe.js");
const RESULT_MARKER = "__ALLSORTED_RESULT__";

// Verbs that mean "this reaches the real world". Never invoked, regardless of
// what the recipe claims about itself.
const NEVER_INVOKE = /\b(send|email|mail|dm|message|post|publish|tweet|delete|remove|destroy|purge|drop|revoke|terminate|uninstall|charge|refund|pay|payout|transfer|withdraw|deploy|reset|wipe|archive|clean|kill|restart|shutdown)\b/i;

// ---------------------------------------------------------------------------
// discovery
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    // Installer backups (.allsorted-backups/, .allsorted-<module>-backups/,
    // transaction and prune copies) hold byte-identical copies of recipes the
    // installer replaced. Scanning them reported every backed-up recipe as a
    // duplicate of the live one, and the failure grew with every re-run.
    if (entry.isDirectory() && /^\.allsorted-(?:.*-)?(?:backups|transactions)$/.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function findRecipes(root) {
  return walk(root)
    .filter((file) => file.endsWith(".recipe.json"))
    .sort();
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ---------------------------------------------------------------------------
// static analysis of the handler source
// ---------------------------------------------------------------------------

// Extract the `runRecipe` function body well enough to answer one question:
// does it ever read its own input parameter? A handler that declares an input
// and never touches it, while returning a literal reply, is a stub.
function analyzeHandlerSource(source) {
  // Matches every shape this codebase uses:
  //   module.exports.runRecipe = async function runRecipe(input = {}) {
  //   exports.runRecipe = async (input) => {
  //   async function runRecipe(input={}){        (minified stubs)
  const match = source.match(/runRecipe\s*(?:=\s*)?(?:async\s+)?(?:function\s*)?(?:runRecipe\s*)?\(([^)]*)\)\s*(?:=>\s*)?\{/);
  if (!match) return { found: false, paramName: null, readsInput: null, hasStringLiteralReply: null };

  const rawParams = (match[1] || "").trim();
  const paramName = rawParams ? rawParams.split(/[,=]/)[0].trim() : null;

  // Body: from the opening brace of runRecipe, balanced to its close.
  const start = source.indexOf("{", match.index + match[0].length - 1);
  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = end > start ? source.slice(start + 1, end) : source.slice(start + 1);

  const readsInput = paramName
    ? new RegExp(`\\b${paramName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(body)
    : false;

  return {
    found: true,
    paramName,
    readsInput,
    // A reply built only from a string literal (no template interpolation, no
    // variable) is the shape a canned stub takes.
    hasStringLiteralReply: /reply\s*:\s*["'][^"']*["']/.test(body),
    bodyLength: body.replace(/\s+/g, " ").trim().length,
    // The decisive stub signal. A handler that delegates to ANY function -
    // a runtime, a helper, an imported operation - is real code whose output
    // may legitimately be constant under a credential-free sandbox. A handler
    // whose body performs no call at all and just hands back an object literal
    // is a canned reply and nothing else.
    callsAnything: /[A-Za-z_$][\w$.]*\s*\(/.test(
      body
        // strip strings/comments so text inside a reply cannot fake a call
        .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
    ),
  };
}

// ---------------------------------------------------------------------------
// sandboxed invocation
// ---------------------------------------------------------------------------

// Build the child environment by CONSTRUCTION, not by subtraction. Nothing from
// the parent environment is inherited except an explicit, audited allowlist, so
// there is no way for a credential to survive by accident.
const ENV_ALLOWLIST = ["PATH", "NODE_PATH", "LANG", "LC_ALL", "TZ", "TMPDIR"];

function scrubbedEnv(scratchDir) {
  const env = Object.create(null);
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.HOME = scratchDir;
  env.TMPDIR = scratchDir;
  env.USERPROFILE = scratchDir;
  env.ALLSORTED_RECIPE_CONTRACT_PROBE = "1";
  // Neutralize any injected preload (e.g. the installer write guard) so the
  // probe's own sandbox is the only thing in the child.
  delete env.NODE_OPTIONS;
  return env;
}

// Proves the strip actually worked. Called once per run and asserted, because a
// silently-ineffective scrub is worse than no scrub at all.
function verifyEnvScrub(scratchDir) {
  const env = scrubbedEnv(scratchDir);
  const leaked = Object.keys(env).filter((key) => !ENV_ALLOWLIST.includes(key) && !["HOME", "TMPDIR", "USERPROFILE", "ALLSORTED_RECIPE_CONTRACT_PROBE"].includes(key));
  if (leaked.length) throw new Error(`Recipe probe environment scrub failed; unexpected keys: ${leaked.join(", ")}`);

  const secretish = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API|AUTH|SESSION|COOKIE/i;
  const survivors = Object.keys(env).filter((key) => secretish.test(key));
  if (survivors.length) throw new Error(`Recipe probe environment scrub failed; credential-shaped keys survived: ${survivors.join(", ")}`);
  return { allowlisted: Object.keys(env).sort(), parentKeyCount: Object.keys(process.env).length };
}

function runProbe(handlerPath, declaredArgs, scratchDir, timeoutMs) {
  const payload = JSON.stringify({ handlerPath, declaredArgs, scratchDir });
  let stdout = "";
  try {
    stdout = execFileSync(process.execPath, [PROBE_SCRIPT, payload], {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      cwd: scratchDir,
      env: scrubbedEnv(scratchDir),
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    stdout = (error.stdout || "").toString();
    if (!stdout.includes(RESULT_MARKER)) {
      return {
        probeFailed: true,
        reason: error.killed ? "timeout" : "crash",
        message: String((error.stderr || error.message || "")).slice(0, 600),
      };
    }
  }
  const index = stdout.lastIndexOf(RESULT_MARKER);
  if (index < 0) return { probeFailed: true, reason: "no-result", message: stdout.slice(0, 600) };
  try {
    return JSON.parse(stdout.slice(index + RESULT_MARKER.length));
  } catch (error) {
    return { probeFailed: true, reason: "unparseable", message: String(error.message) };
  }
}

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------

function declaredArgNames(recipe) {
  const names = new Set();
  for (const key of ["requiredArgs", "requiredContext", "requiredInputs"]) {
    for (const entry of recipe[key] || []) {
      if (typeof entry === "string") names.add(entry);
      else if (entry && typeof entry === "object" && entry.name) names.add(entry.name);
    }
  }
  return [...names];
}

function isNeverInvoke(recipe) {
  if (recipe.safety && recipe.safety.destructive === true) return "safety.destructive=true";
  if (recipe.safety && recipe.safety.approvalRequired === true) return "safety.approvalRequired=true";
  const haystack = [recipe.id, recipe.title, ...(recipe.actions || []).map((a) => (typeof a === "string" ? a : a && a.name))]
    .filter(Boolean)
    .join(" ");
  const verb = haystack.match(NEVER_INVOKE);
  if (verb) return `declares a send/destroy verb: "${verb[0]}"`;
  return null;
}

// "X is required" thrown for an X the recipe never advertised means the handler
// demands an argument outside its published contract - the recipe is unusable
// as documented. This is exactly the shape of a shared-helper signature bug.
function undeclaredRequiredArg(errorMessage, declared) {
  // Accepts both "email is required" and the comma-joined form a broken helper
  // produces when it is handed a key ARRAY it was never designed to accept
  // ("search,query is required") - which is itself the signature of a
  // mismatched shared-helper contract.
  const match = String(errorMessage || "").match(/^([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s+is required/);
  if (!match) return null;
  const keys = match[1].split(",").map((key) => key.trim()).filter(Boolean);
  // Undeclared only if NONE of the demanded keys were advertised.
  return keys.some((key) => declared.includes(key)) ? null : match[1];
}

// A handler that inspects its input and refuses to run on input it cannot use
// is behaving CORRECTLY. That is the single most common thing a real handler
// does under the empty probe, and scoring it as a fault is how a contract check
// starts accusing working code.
//
// These patterns therefore mean "the handler validated its input and declined",
// which is a pass signal, not a defect. They are deliberately anchored to
// validation phrasing ("X is required", "requires an <X>", "Provide an <X>")
// rather than matching any message containing the word "invalid", so a genuine
// crash still surfaces as a runtime error.
const INPUT_VALIDATION_MESSAGE = new RegExp(
  [
    "\\b(is|are) required\\b",
    "\\brequires? (an?|at least|one|the|a valid)\\b",
    "^\\s*(please\\s+)?provide\\b",
    "\\bmust (be|include|contain|specify|provide)\\b",
    "\\bmissing required (argument|input|field|parameter)\\b",
    "\\binvalid input\\b",
    "\\bexpected (an?|one of)\\b",
    "\\busage:",
  ].join("|"),
  "i"
);

function classifyInvocation(invocation, declared) {
  if (invocation.outcome === "returned") {
    const shape = invocation.shape || {};
    if (!shape.isObject) return { kind: "bad-envelope", detail: "runRecipe did not return an object" };
    if (typeof shape.status !== "string" || !shape.status) return { kind: "bad-envelope", detail: "envelope is missing a string `status`" };
    if (shape.replyType !== "string") return { kind: "bad-envelope", detail: "envelope is missing a string `reply`" };
    if (shape.artifactsType !== "undefined" && shape.artifactsType !== "array") return { kind: "bad-envelope", detail: "`artifacts` must be an array when present" };
    if (shape.metadataType !== "undefined" && shape.metadataType !== "object") return { kind: "bad-envelope", detail: "`metadata` must be an object when present" };
    return { kind: "envelope" };
  }
  const error = invocation.error || {};
  if (error.kind === "blocked") return { kind: "sandbox-blocked", detail: error.operation };
  if (error.code === "MODULE_NOT_FOUND") return { kind: "dependency-missing", detail: error.message };

  // A handler refusing to run without credentials is REAL code reaching a real
  // gate. That is a pass signal, and it is checked before the input-error rules
  // so a message like "Set PORKBUN_API_KEY ..." is not misread as an arg fault.
  if (/credential|api[_ -]?key|secret|not configured|unauthor|\bSet [A-Z][A-Z0-9_]{2,}\b|[A-Z][A-Z0-9]{2,}_(KEY|TOKEN|SECRET|ID)\b/.test(error.message || "")) {
    return { kind: "credential-gate", detail: error.message };
  }

  // Only the fully-populated probes can prove an arg-contract violation. The
  // empty probe is expected to be rejected by any handler that needs input, so
  // it is never used to accuse a handler of demanding undeclared arguments.
  if (invocation.input && invocation.input.probe !== 0) {
    const undeclared = undeclaredRequiredArg(error.message, declared);
    if (undeclared) return { kind: "undeclared-required-arg", detail: undeclared, message: error.message };
  }
  // Node's own engine faults (ERR_INVALID_ARG_TYPE, ERR_ASSERTION, ...) read
  // like validation messages - "The \"path\" argument must be of type string" -
  // but they are the handler CRASHING, not the handler checking its arguments.
  // The recipe convention requires graceful refusal, so these stay runtime
  // errors and keep being reported.
  const engineFault = typeof error.code === "string" && error.code.startsWith("ERR_");
  if (
    !engineFault &&
    (INPUT_VALIDATION_MESSAGE.test(error.message || "") ||
      /must be non-empty|must be a positive/i.test(error.message || ""))
  ) {
    return { kind: "declared-input-error", detail: error.message };
  }
  return { kind: "runtime-error", detail: error.message };
}

// ---------------------------------------------------------------------------
// main check
// ---------------------------------------------------------------------------

function checkRecipeContract(options = {}) {
  const root = path.resolve(options.root);
  const moduleName = options.moduleName || path.basename(root);
  const timeoutMs = options.timeoutMs || 20000;

  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "allsorted-recipe-probe-"));
  const envProof = verifyEnvScrub(scratchDir);

  const report = {
    module: moduleName,
    root,
    envScrub: envProof,
    recipes: [],
    failures: [],
    warnings: [],
  };

  try {
    const recipeFiles = findRecipes(root);
    if (!recipeFiles.length) {
      // A module with no recipe layer has nothing for this check to contradict.
      report.note = "module ships no recipes";
      report.ok = true;
      return report;
    }

    // --- duplicate detection ------------------------------------------
    const byHash = new Map();
    const byId = new Map();
    for (const file of recipeFiles) {
      const raw = fs.readFileSync(file);
      const hash = sha256(raw);
      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash).push(file);
      let parsed = null;
      try {
        parsed = JSON.parse(raw.toString("utf8"));
      } catch (error) {
        report.failures.push({
          rule: "RECIPE_UNPARSEABLE",
          recipe: path.relative(root, file),
          detail: error.message,
        });
        continue;
      }
      if (parsed && parsed.id) {
        if (!byId.has(parsed.id)) byId.set(parsed.id, []);
        byId.get(parsed.id).push(file);
      }
    }
    for (const [hash, files] of byHash) {
      if (files.length < 2) continue;
      report.failures.push({
        rule: "DUPLICATE_RECIPE",
        recipe: files.map((f) => path.relative(root, f)).join(" == "),
        detail: `${files.length} recipe files are byte-identical (sha256 ${hash.slice(0, 12)}). The recipe advertised by the extra file(s) does not exist.`,
      });
    }
    for (const [id, files] of byId) {
      if (files.length < 2) continue;
      const relatives = files.map((f) => path.relative(root, f));
      const alreadyReported = report.failures.some(
        (failure) => failure.rule === "DUPLICATE_RECIPE" && relatives.every((r) => failure.recipe.includes(r))
      );
      if (alreadyReported) continue;
      report.failures.push({
        rule: "DUPLICATE_RECIPE_ID",
        recipe: relatives.join(" == "),
        detail: `${files.length} recipes advertise the same id "${id}"; only one can ever be dispatched.`,
      });
    }

    // --- per-recipe contract ------------------------------------------
    const handlerFanIn = new Map();
    const parsedRecipes = [];
    for (const file of recipeFiles) {
      let recipe;
      try {
        recipe = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        continue;
      }
      const relative = path.relative(root, file);
      if (!recipe.handler || typeof recipe.handler !== "string") {
        report.failures.push({ rule: "HANDLER_UNDECLARED", recipe: relative, detail: "recipe declares no `handler`" });
        continue;
      }
      const handlerPath = path.resolve(path.dirname(file), recipe.handler);
      if (!fs.existsSync(handlerPath)) {
        report.failures.push({
          rule: "HANDLER_MISSING",
          recipe: relative,
          detail: `handler file does not exist: ${recipe.handler}`,
        });
        continue;
      }
      if (!handlerFanIn.has(handlerPath)) handlerFanIn.set(handlerPath, []);
      handlerFanIn.get(handlerPath).push(relative);
      parsedRecipes.push({ file, relative, recipe, handlerPath });
    }

    // Probe each distinct handler once; reuse the result for every recipe that
    // points at it.
    const probeCache = new Map();
    for (const entry of parsedRecipes) {
      const { relative, recipe, handlerPath } = entry;
      const declared = declaredArgNames(recipe);
      const skipReason = isNeverInvoke(recipe);
      const source = fs.readFileSync(handlerPath, "utf8");
      const statics = analyzeHandlerSource(source);

      const record = {
        recipe: relative,
        id: recipe.id,
        handler: path.relative(root, handlerPath),
        declaredArgs: declared,
        treatment: skipReason ? "static-assert-only" : "invoked-in-sandbox",
        skipReason,
        static: statics,
        sharedHandlerWith: handlerFanIn.get(handlerPath).filter((r) => r !== relative),
      };

      // Static contract assertion applies to every recipe, invoked or not.
      if (!/\brunRecipe\b/.test(source)) {
        report.failures.push({
          rule: "NO_RUNRECIPE_EXPORT",
          recipe: relative,
          detail: `handler ${recipe.handler} never mentions runRecipe`,
        });
      }

      if (!skipReason) {
        const cacheKey = `${handlerPath}::${declared.sort().join(",")}`;
        if (!probeCache.has(cacheKey)) {
          probeCache.set(cacheKey, runProbe(handlerPath, declared, scratchDir, timeoutMs));
        }
        const probe = probeCache.get(cacheKey);
        record.probe = summarizeProbe(probe);

        if (probe.probeFailed) {
          // Fail CLOSED. A probe that could not run has proven nothing, and a
          // check that quietly downgrades "I could not look" to "looks fine" is
          // exactly the blind spot this file exists to close.
          report.failures.push({
            rule: "PROBE_FAILED",
            recipe: relative,
            detail: `could not exercise the handler (${probe.reason}): ${probe.message}`,
          });
        } else if (probe.loadError) {
          if (probe.loadError.code === "MODULE_NOT_FOUND") {
            report.warnings.push({ rule: "DEPENDENCY_MISSING", recipe: relative, detail: probe.loadError.message });
          } else {
            report.failures.push({
              rule: "HANDLER_LOAD_FAILED",
              recipe: relative,
              detail: `${probe.loadError.name}: ${probe.loadError.message}`,
            });
          }
        } else if (!probe.exports || !probe.exports.hasRunRecipe) {
          report.failures.push({
            rule: "NO_RUNRECIPE_EXPORT",
            recipe: relative,
            detail: `handler exports [${(probe.exports && probe.exports.keys.join(", ")) || ""}] but not a runRecipe function`,
          });
        } else {
          evaluateInvocations({ report, record, probe, recipe, relative, declared, statics, handlerFanIn, handlerPath, root, handlerSource: source });
        }
      }

      report.recipes.push(record);
    }
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }

  report.ok = report.failures.length === 0;
  return report;
}

function summarizeProbe(probe) {
  if (probe.probeFailed) return { probeFailed: true, reason: probe.reason };
  return {
    hasRunRecipe: Boolean(probe.exports && probe.exports.hasRunRecipe),
    outcomes: (probe.invocations || []).map((i) => i.outcome),
  };
}

function evaluateInvocations(context) {
  const { report, record, probe, recipe, relative, declared, statics, handlerFanIn, handlerPath } = context;
  const invocations = probe.invocations || [];
  const classified = invocations.map((invocation) => classifyInvocation(invocation, declared));
  record.classifications = classified.map((c) => c.kind);

  // 1. envelope shape
  for (const result of classified) {
    if (result.kind === "bad-envelope") {
      report.failures.push({
        rule: "BAD_ENVELOPE",
        recipe: relative,
        detail: `${result.detail}. Contract is runRecipe(input) -> { status, reply, artifacts?, metadata? }`,
      });
      break;
    }
  }

  // 2. the handler demands an argument its recipe never advertised
  const undeclared = classified.find((c) => c.kind === "undeclared-required-arg");
  if (undeclared) {
    // Severity turns on whether we can PROVE the handler is wrong, rather than
    // merely under-documented.
    //
    //  fatal  - the recipe publishes a requiredArgs contract and the handler
    //           demands something outside it; or the handler supplies its own
    //           DEFAULT for the very key it then refuses to run without, which
    //           is only possible when its argument helper's signature has been
    //           misread (the shape of a shared-helper contract break).
    //  warn   - the recipe declares no argument contract at all, so a genuinely
    //           required argument is a documentation gap, not dead code.
    const keys = String(undeclared.detail).split(",").map((key) => key.trim());
    const defaultedAtCallSite = keys.some((key) =>
      new RegExp(`readArg\\s*\\(\\s*[^,)]+,\\s*(?:\\[[^\\]]*["']${key}["'][^\\]]*\\]|["']${key}["'])\\s*,\\s*[^)]`).test(context.handlerSource || "")
    );
    const detail =
      `handler threw "${undeclared.message}" but "${undeclared.detail}" is not in the recipe's declared args ` +
      `[${declared.join(", ") || "none"}].`;

    if (declared.length) {
      report.failures.push({
        rule: "UNDECLARED_REQUIRED_ARG",
        recipe: relative,
        detail: `${detail} The recipe publishes an argument contract that its own handler violates.`,
      });
    } else if (defaultedAtCallSite) {
      report.failures.push({
        rule: "ARG_HELPER_CONTRACT_BREAK",
        recipe: relative,
        detail:
          `${detail} The handler passes its own default for "${undeclared.detail}" and is still refused, ` +
          `so its argument helper's signature does not mean what the call site assumes. The recipe is unusable.`,
      });
    } else {
      report.warnings.push({
        rule: "UNDOCUMENTED_REQUIRED_ARG",
        recipe: relative,
        detail: `${detail} Declare it in requiredArgs so callers know to send it.`,
      });
    }
  }

  // 3. canned-stub detection
  const returned = invocations.filter((i) => i.outcome === "returned");
  const fingerprints = new Set(returned.map((i) => i.fingerprint));
  const identicalAcrossInputs = returned.length >= 2 && fingerprints.size === 1;
  record.identicalAcrossInputs = identicalAcrossInputs;

  const looksCanned =
    statics.found &&
    statics.paramName &&
    statics.readsInput === false &&
    statics.callsAnything === false;

  if (identicalAcrossInputs && looksCanned) {
    const siblings = handlerFanIn.get(handlerPath) || [];
    if (siblings.length >= 2) {
      report.failures.push({
        rule: "CANNED_FANIN_HANDLER",
        recipe: relative,
        detail:
          `${siblings.length} recipes (${siblings.join(", ")}) all funnel into ${path.basename(handlerPath)}, ` +
          `whose runRecipe declares "${statics.paramName}" and never reads it, and returns byte-identical output ` +
          `for every probe input. These recipes do not exist; only the canned reply does.`,
      });
    } else {
      report.failures.push({
        rule: "CANNED_STUB_HANDLER",
        recipe: relative,
        detail:
          `runRecipe declares "${statics.paramName}", never reads it, and returns byte-identical output for every ` +
          `probe input. This is a stub, not an implementation.`,
      });
    }
  } else if (identicalAcrossInputs && (handlerFanIn.get(handlerPath) || []).length >= 2) {
    // Shared handler that DOES read input but still cannot tell recipes apart.
    report.warnings.push({
      rule: "SHARED_HANDLER_UNIFORM_OUTPUT",
      recipe: relative,
      detail: `${handlerFanIn.get(handlerPath).length} recipes share ${path.basename(handlerPath)} and it returned identical output for every probe input.`,
    });
  }

  // 4. informational: real code that hit a gated boundary, or that inspected
  //    its input and declined, is a PASS signal - not something to report.
  for (const result of classified) {
    if (result.kind === "sandbox-blocked") {
      record.reachedGatedBoundary = result.detail;
    } else if (result.kind === "declared-input-error") {
      record.validatedItsInput = result.detail;
    } else if (result.kind === "runtime-error") {
      report.warnings.push({ rule: "RUNTIME_ERROR", recipe: relative, detail: result.detail });
    }
  }
  void recipe;
}

// ---------------------------------------------------------------------------
// reporting / CLI
// ---------------------------------------------------------------------------

function formatReport(report) {
  const lines = [];
  const status = report.ok ? "PASS" : "FAIL";
  lines.push(`[recipe-contract] ${status} ${report.module} (${report.recipes.length} recipes)`);
  if (report.note) lines.push(`  note: ${report.note}`);
  for (const failure of report.failures) {
    lines.push(`  FAIL ${failure.rule}  ${failure.recipe}`);
    lines.push(`       ${failure.detail}`);
  }
  for (const warning of report.warnings) {
    lines.push(`  warn ${warning.rule}  ${warning.recipe}: ${warning.detail}`);
  }
  return lines.join("\n");
}

// The entry point module validators call.
function assertRecipeContract(root, options = {}) {
  const report = checkRecipeContract({ root, ...options });
  const text = formatReport(report);
  if (!report.ok) {
    const error = new Error(`Recipe contract validation failed\n${text}`);
    error.report = report;
    throw error;
  }
  if (options.verbose) console.log(text);
  return report;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const targetIndex = argv.indexOf("--target");
  const nameIndex = argv.indexOf("--module");
  const root = targetIndex >= 0 ? argv[targetIndex + 1] : process.cwd();
  const options = { root, json: argv.includes("--json") };
  if (nameIndex >= 0) options.moduleName = argv[nameIndex + 1];
  const report = checkRecipeContract(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatReport(report));
  // NOT process.exit(). Writes to a pipe are asynchronous, and process.exit()
  // discards whatever has not drained - which silently truncated any --json
  // report larger than the 64 KB pipe buffer, producing valid-looking output
  // that could not be parsed. Setting exitCode lets Node flush first.
  process.exitCode = report.ok ? 0 : 1;
}

module.exports = {
  analyzeHandlerSource,
  assertRecipeContract,
  checkRecipeContract,
  findRecipes,
  formatReport,
  scrubbedEnv,
  verifyEnvScrub,
};
