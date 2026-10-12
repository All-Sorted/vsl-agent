#!/usr/bin/env node
"use strict";

// Video sales letter planner.
//
// This does not write a sales video. It does three things a person writing one
// has to do first, and it does them from the brief rather than from a template:
//
//   1. BEATS  - turn the brief into an ordered beat sheet where every beat
//               carries the actual offer, audience, problem, mechanism and
//               proof you supplied, and names what is still missing.
//   2. CLAIMS - scan a draft for the categories of statement that need
//               evidence, qualification, or a licence before publication.
//   3. TERMS  - check that the material terms a buyer needs are present before
//               the call to action.
//
// It never invents a result, a testimonial, a deadline, or a guarantee. Where
// the brief is silent it says so instead of filling the gap.

const fs = require("node:fs");
const path = require("node:path");

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

function list(value) { return Array.isArray(value) ? value.filter(Boolean).map(String) : []; }

function normaliseBrief(input = {}) {
  const terms = input.terms && typeof input.terms === "object" ? input.terms : {};
  return {
    offer: String(input.offer || "").trim(),
    audience: String(input.audience || "").trim(),
    problem: String(input.problem || "").trim(),
    mechanism: String(input.mechanism || "").trim(),
    promise: String(input.promise || "").trim(),
    proof: list(input.proof),
    objections: list(input.objections),
    terms: {
      price: String(terms.price || "").trim(),
      billing: String(terms.billing || "").trim(),
      delivery: String(terms.delivery || "").trim(),
      guarantee: String(terms.guarantee || "").trim(),
      eligibility: String(terms.eligibility || "").trim(),
    },
    cta: String(input.cta || "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Beats
// ---------------------------------------------------------------------------

const MISSING = (field) => `Not supplied: ${field}. Add it to the brief before writing this beat.`;

function buildBeats(brief) {
  const proofFor = (index) => brief.proof[index] || null;
  return [
    {
      id: "hook",
      name: "Hook",
      goal: "Earn the next fifteen seconds by naming the exact situation the viewer is in.",
      say: brief.problem && brief.audience
        ? `Open on ${brief.problem}, stated the way ${brief.audience} would say it out loud. No preamble, no introduction, no logo.`
        : MISSING(!brief.problem ? "problem" : "audience"),
      onScreen: brief.problem ? `The problem in six words or fewer.` : null,
      proof: null,
      needs: [!brief.problem && "problem", !brief.audience && "audience"].filter(Boolean),
    },
    {
      id: "stakes",
      name: "Stakes",
      goal: "Make the cost of leaving it alone concrete, without exaggerating it.",
      say: brief.problem
        ? `Show what ${brief.problem} costs over a month: the time, the rework, the missed follow-ups. Use only costs you can point at.`
        : MISSING("problem"),
      onScreen: "One cost, quantified only if you hold the figure.",
      proof: null,
      needs: [!brief.problem && "problem"].filter(Boolean),
    },
    {
      id: "mechanism",
      name: "Mechanism",
      goal: "Explain why this works, in ordinary language, before asking for anything.",
      say: brief.mechanism
        ? `Explain ${brief.mechanism} in one plain sentence, then show it doing the thing. Cut every word a viewer would need a glossary for.`
        : MISSING("mechanism"),
      onScreen: "The mechanism named, once.",
      proof: null,
      needs: [!brief.mechanism && "mechanism"].filter(Boolean),
    },
    {
      id: "demonstration",
      name: "Demonstration",
      goal: "Show the thing working rather than describing it working.",
      say: brief.offer
        ? `Show ${brief.offer} in use on a real task, start to finish, unedited enough to be believable.`
        : MISSING("offer"),
      onScreen: "Nothing. Let the demonstration carry it.",
      proof: proofFor(0),
      needs: [!brief.offer && "offer", !brief.proof.length && "proof"].filter(Boolean),
    },
    {
      id: "proof",
      name: "Proof",
      goal: "Attach evidence to the specific claim it supports, and to no other.",
      say: brief.proof.length
        ? `Pair each item with the one claim it covers: ${brief.proof.map((item, index) => `(${index + 1}) ${item.replace(/\.\s*$/, "")}`).join("; ")}. State the scope of each item out loud.`
        : "No evidence was supplied. Mark this beat as blocked rather than reaching for a testimonial, a screenshot, or a round number to fill it.",
      onScreen: brief.proof.length ? "The source of each item, on screen, while it is claimed." : null,
      proof: proofFor(0),
      needs: [!brief.proof.length && "proof"].filter(Boolean),
    },
    {
      id: "objections",
      name: "Objections",
      goal: "Answer the reasons a viewer would say no, before they say it.",
      say: brief.objections.length
        ? `Answer each of these on camera: ${brief.objections.join("; ")}. Answer with evidence or with a bounded honest limit, never with reassurance.`
        : "No objections were supplied. Ask three recent buyers what nearly stopped them, then write this beat.",
      onScreen: "The objection as a question.",
      proof: proofFor(1),
      needs: [!brief.objections.length && "objections"].filter(Boolean),
    },
    {
      id: "terms",
      name: "Offer and terms",
      goal: "State what it costs and what happens next, in full, before you ask.",
      say: termsSentence(brief),
      onScreen: "Price and terms, held long enough to read.",
      proof: null,
      needs: missingTerms(brief),
    },
    {
      id: "cta",
      name: "Call to action",
      goal: "Ask for one specific, reversible next step.",
      say: brief.cta
        ? `Ask for exactly this and nothing else: ${brief.cta}. Say what happens immediately after they do it.`
        : MISSING("cta"),
      onScreen: brief.cta ? "The action, worded the same way as the button." : null,
      proof: null,
      needs: [!brief.cta && "cta"].filter(Boolean),
    },
  ];
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

const TERM_LABELS = {
  price: "price",
  billing: "billing frequency",
  delivery: "what they get and when",
  guarantee: "guarantee or refund terms",
  eligibility: "who it is not for",
};

function missingTerms(brief) {
  return Object.keys(TERM_LABELS).filter((key) => !brief.terms[key]).map((key) => TERM_LABELS[key]);
}

function termsSentence(brief) {
  const present = Object.keys(TERM_LABELS).filter((key) => brief.terms[key]);
  if (!present.length) return "No material terms were supplied. This beat cannot be written until price, billing, delivery, guarantee and eligibility are settled.";
  return `State plainly: ${present.map((key) => `${TERM_LABELS[key]} (${brief.terms[key]})`).join(", ")}.`;
}

function checkTerms(input = {}) {
  const brief = normaliseBrief(input);
  const absent = missingTerms(brief);
  return {
    status: absent.length ? "incomplete" : "complete",
    disclosed: Object.keys(TERM_LABELS).filter((key) => brief.terms[key]).map((key) => ({ term: TERM_LABELS[key], value: brief.terms[key] })),
    missing: absent,
    rule: "Every one of these belongs on screen before the call to action, not in a footnote afterwards.",
  };
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

const CLAIM_RULES = [
  { code: "guarantee", severity: "block", test: /\b(?:guarantee[ds]?|guaranteed results|risk[- ]free|no risk|promise you)\b/i, why: "A guarantee is a contractual statement, not copy.", fix: "Only say it if your published terms say it, word for word." },
  { code: "absolute", severity: "review", test: /\b(?:always|never|everyone|nobody|no one|every single|100%|the only|nothing else)\b/i, why: "An absolute is read as applying to the viewer.", fix: "Bound it: who, when, and under what conditions." },
  { code: "earnings", severity: "block", test: /\b(?:income|revenue|profit|salary|earn(?:ed|ings)?|six[- ]figure|replace your (?:income|salary)|make \$?\d|financially free)\b/i, why: "Earnings language is regulated in many places.", fix: "Check the rules that apply to you and publish a typical-results statement." },
  { code: "health", severity: "block", test: /\b(?:cure[ds]?|heal(?:s|ed|ing)?|treat(?:s|ment)?|diagnos\w*|symptom\w*|disease|clinical(?:ly)?|pain[- ]free|lose \d+\s?(?:kg|lb|pounds))\b/i, why: "Health language is a regulated claim in most places.", fix: "Remove it, or get qualified sign-off before publication." },
  { code: "legal-or-tax", severity: "block", test: /\b(?:tax[- ]free|write[- ]off|legally|compliant|compliance|liability|loophole)\b/i, why: "Legal and tax statements are acted on by viewers.", fix: "Remove it, or get qualified sign-off before publication." },
  { code: "scarcity", severity: "review", test: /\b(?:limited time|only \d+ (?:left|spots?|seats?|places?)|closing soon|last chance|doors close|before midnight|act now|hurry)\b/i, why: "Scarcity is a factual claim about supply or a deadline.", fix: "Only state it if the limit is real and enforced. Otherwise cut it." },
  { code: "effortless", severity: "review", test: /\b(?:effortless(?:ly)?|on autopilot|while you sleep|no work|set it and forget it|instant(?:ly)?|overnight|in minutes)\b/i, why: "Effort and speed claims set an expectation you will be held to.", fix: "State the real effort and the real timeframe." },
  { code: "authority-by-assertion", severity: "review", test: /\b(?:proven|scientifically|studies show|research shows|experts agree|industry[- ]leading|world[- ]class|award[- ]winning)\b/i, why: "This asserts authority instead of showing it.", fix: "Cite the specific source on screen, or cut the word." },
  { code: "comparative", severity: "review", test: /\b(?:better than|cheaper than|faster than|beats|outperform\w*|unlike (?:the )?(?:others|competitors))\b/i, why: "A comparison is a claim about someone else as well as about you.", fix: "Hold evidence for the comparison, or drop it." },
  { code: "typicality", severity: "review", test: /\b(?:results? (?:like|such as)|our customers (?:get|see)|typical(?:ly)? (?:get|see)|you(?:'ll| will) get)\b/i, why: "This projects one person's result onto the viewer.", fix: "Say whose result it was and what is usual." },
];

function claimCheck(text = "") {
  const draft = String(text || "");
  const flags = CLAIM_RULES.filter((rule) => rule.test.test(draft)).map((rule) => ({
    code: rule.code,
    severity: rule.severity,
    match: (draft.match(rule.test) || [""])[0].trim(),
    why: rule.why,
    fix: rule.fix,
  }));
  const blocking = flags.filter((flag) => flag.severity === "block");
  return {
    status: blocking.length ? "hold" : flags.length ? "review" : "clear",
    blocking: blocking.map((flag) => flag.code),
    flags,
    note: "A flag is not a verdict on your copy. It marks a statement that needs evidence, a qualification, or a licence before it goes out.",
  };
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function outline(input = {}) {
  const brief = normaliseBrief(input);
  const beats = buildBeats(brief);
  const blocked = beats.filter((beat) => beat.needs.length);
  return {
    brief,
    beats,
    blockedBeats: blocked.map((beat) => ({ beat: beat.name, needs: beat.needs })),
    readiness: blocked.length ? "incomplete" : "ready",
    note: blocked.length
      ? "Beats above are blocked on brief fields that were not supplied. Gather those first. Nothing here invents them for you."
      : "Every beat has the brief material it needs. Write it.",
  };
}

// The claim scan runs over YOUR words, not over the planner's own instructions.
// Scanning the generated plan would flag its own scaffolding ("guarantee or
// refund terms") and bury the statements that actually matter.
function briefText(brief) {
  return [brief.offer, brief.problem, brief.promise, brief.mechanism, ...brief.proof, ...brief.objections, brief.cta, ...Object.values(brief.terms)].filter(Boolean).join(". ");
}

function create(input = {}) {
  const plan = outline(input);
  const terms = checkTerms(input);
  const script = plan.beats
    .map((beat, index) => [`${index + 1}. ${beat.name} - ${beat.goal}`, `   Say: ${beat.say}`, beat.onScreen ? `   On screen: ${beat.onScreen}` : null, beat.proof ? `   Proof: ${beat.proof}` : null, beat.needs.length ? `   Blocked on: ${beat.needs.join(", ")}` : null].filter(Boolean).join("\n"))
    .join("\n\n");
  return {
    status: plan.readiness === "ready" && terms.status === "complete" ? "needs_review" : "needs_input",
    plan,
    terms,
    script,
    claims: claimCheck(briefText(plan.brief)),
    note: "This is a plan for a person to write from. It is not a finished script and it is not ready to record.",
  };
}

function savePlan(file, result) { fs.writeFileSync(path.resolve(file), `${JSON.stringify(result, null, 2)}\n`, "utf8"); }

function main(argv = process.argv.slice(2)) {
  try {
    const command = argv[0] || "demo";
    const inputAt = argv.indexOf("--input");
    const input = inputAt >= 0 ? readJson(path.resolve(argv[inputAt + 1])) : {};
    if (command === "demo") return console.log(JSON.stringify({ mode: "offline demo", ...create(readJson(path.join(__dirname, "..", "examples", "sample-brief.json"))) }, null, 2));
    if (command === "outline") return console.log(JSON.stringify(outline(input), null, 2));
    if (command === "terms") return console.log(JSON.stringify(checkTerms(input), null, 2));
    if (command === "create") {
      const result = create(input);
      const outputAt = argv.indexOf("--output");
      if (outputAt >= 0 && argv[outputAt + 1]) savePlan(argv[outputAt + 1], result);
      return console.log(JSON.stringify(result, null, 2));
    }
    if (command === "claims") return console.log(JSON.stringify(claimCheck(String(input.text || input.draft || "")), null, 2));
    console.error("Unknown command. Usage: demo | outline --input <brief.json> | create --input <brief.json> | terms --input <brief.json> | claims --input <text.json>");
    process.exitCode = 2;
  } catch (error) { console.error(`[vsl-agent] ${error.message}`); process.exitCode = 1; }
}

if (require.main === module) main();
module.exports = { normaliseBrief, buildBeats, briefText, outline, checkTerms, claimCheck, create, savePlan, main, CLAIM_RULES, TERM_LABELS };
