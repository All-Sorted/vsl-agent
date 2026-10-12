#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const frameworks = require('./frameworks.json');
const examples = require('./example-patterns.json');
const WORKFLOW_VERSION = '1.1';
function recommend(brief = {}) {
  const types = { service: 'application', course: 'education', physical: 'demo', software: 'workflow' };
  const allowed = ['purchase', 'application', 'booking', 'trial'];
  if (!Object.hasOwn(types, brief.offer_type) || !allowed.includes(brief.conversion_event)) return { status: 'NEEDS_INPUT', missing: ['offer_type: service|course|physical|software', 'conversion_event: purchase|application|booking|trial'], choices: frameworks };
  if (brief.framework_id && !frameworks.some(f => f.id === brief.framework_id)) return { status: 'NEEDS_INPUT', missing: ['valid framework_id'], choices: frameworks };
  let primary = types[brief.offer_type];
  if (['application', 'booking'].includes(brief.conversion_event)) primary = 'application';
  else if (brief.mechanism_complexity === 'high') primary = 'mechanism';
  if (brief.framework_id) primary = brief.framework_id;
  let secondary = brief.founder_story_verified === true ? 'founder' : (primary === 'mechanism' ? types[brief.offer_type] : 'mechanism');
  if (secondary === primary) secondary = primary === 'education' ? 'mechanism' : 'education';
  return { status: 'RECOMMENDATION', primary: frameworks.find(f => f.id === primary), alternative: frameworks.find(f => f.id === secondary), reason: `Minimal offline starting heuristic, not the final AIOS comparison. ${brief.framework_id ? 'User chose ' + brief.framework_id + '. ' : ''}Based on supplied offer_type=${brief.offer_type}, conversion_event=${brief.conversion_event}, mechanism_complexity=${brief.mechanism_complexity || 'unknown'}. Review actual buyer awareness and proof before accepting this suggestion.`, evidence: { offer_type: brief.offer_type, conversion_event: brief.conversion_event, mechanism_complexity: brief.mechanism_complexity || null, framework_id: brief.framework_id || null, buyer_awareness: brief.buyer_awareness || 'not supplied', traffic_source: brief.traffic_source || 'not supplied', available_proof: brief.proof || [] }, deeperComparison: 'Your chosen agent must compare actual buyer awareness, traffic, demonstration and proof before recommending the final framework.', predictsPerformance: false };
}
function scriptPrompt(brief = {}) {
  const missing = ['offer', 'audience', 'cta', 'terms'].filter(key => !brief[key]);
  return `GOAL: Use my accessible AIOS context and the All Sorted VSL workflow to write and revise a recordable script for my own offer. Write pass/fail acceptance checks before starting and keep going until they pass or a real human gate remains.
CONTEXT: The supplied brief is a starting point, not permission to invent missing facts. Verify it against the active project, brand brain, voice, approved offer and real evidence. Ask only for material uncertainty.
BRIEF STATUS: ${missing.length ? 'NEEDS_CONTEXT, this is a drafting scaffold' : 'VERIFY_SOURCES, supplied fields are not validated evidence'}. Fields to discover from AIOS before writing: ${missing.join(', ') || 'verify all supplied facts'}. Never mark an incomplete draft ready.
SUPPLIED BRIEF: ${JSON.stringify(brief)}
FRAMEWORK SUGGESTION: ${JSON.stringify(recommend(brief))}
AVAILABLE FRAMEWORKS: ${JSON.stringify(frameworks)}
STUDY CARDS: ${JSON.stringify(examples)}
WORKFLOW:
${fs.readFileSync(path.join(__dirname, 'BRAIN.md'), 'utf8')}
OUTPUT: Full revised spoken script, timed storyboard, three hooks, short ad cut, framework decision and source-linked claims register, saved without replacing prior work. No rendering or publication.
SELF-HEALING: Read the exact error, diagnose inside this output folder, preserve existing work, make the smallest reversible repair and repeat the failed check. Do not retry the same failure more than twice without new evidence. Figure it out yourself and keep going until it actually works. Stop with NEEDS_INPUT for sign-in or missing material facts, and NEEDS_REVIEW for unsafe repair. Never reveal credentials, spend money, disable safety checks or publish.`;
}
function validate() {
  for (const f of ['BRAIN.md', 'frameworks.json', 'example-patterns.json', 'EXAMPLES.md']) if (!fs.statSync(path.join(__dirname, f)).isFile()) throw new Error(`Missing workflow file: ${f}`);
  if (frameworks.length !== 6 || new Set(frameworks.map(f => f.id)).size !== 6) throw new Error('Six distinct frameworks required');
  if (examples.length !== 34 || examples.some((e, i) => e.id !== `E${i + 1}` || !e.lesson)) throw new Error('All 34 ordered study cards required');
  return { status: 'PASS', version: WORKFLOW_VERSION, frameworks: 6, studyCards: 34, mode: 'offline, your chosen agent writes the script', generatesPaidMedia: false };
}
function main(args = process.argv.slice(2)) {
  const command = args[0] || 'validate';
  if (args.slice(1).some((arg, i, tail) => arg !== '--input' && tail[i - 1] !== '--input')) throw new Error('Usage: validate | frameworks | recommend --input brief.json | script-prompt --input brief.json');
  const at = args.indexOf('--input');
  if (at >= 0 && (!args[at + 1] || args[at + 1].startsWith('--'))) throw new Error('--input requires a JSON file');
  const brief = at >= 0 ? JSON.parse(fs.readFileSync(path.resolve(args[at + 1]), 'utf8')) : {};
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) throw new Error('Brief must be a JSON object');
  if (command === 'script-prompt') return console.log(scriptPrompt(brief));
  const result = command === 'validate' ? validate() : command === 'frameworks' ? frameworks : command === 'recommend' ? recommend(brief) : null;
  if (!result) throw new Error(`Unknown command: ${command}`);
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { recommend, scriptPrompt, validate };
