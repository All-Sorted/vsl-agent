"use strict";
const { isDeepStrictEqual } = require("node:util");

// jsonPath is a dotted own-property path, or an array of exact keys/indexes.
// A missing path fails even when equals is null. Values are never included in errors.
function matchesAssertion(source, assertion) {
  if (Object.hasOwn(assertion, "jsonPath")) {
    const keys = Array.isArray(assertion.jsonPath) ? assertion.jsonPath :
      typeof assertion.jsonPath === "string" && assertion.jsonPath ? assertion.jsonPath.split(".") : null;
    if (!keys || !keys.length || keys.some(key => typeof key !== "string" && !Number.isInteger(key))) return false;
    let value;
    try { value = JSON.parse(source); } catch { return false; }
    for (const key of keys) {
      if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return false;
      value = value[key];
    }
    if (Object.hasOwn(assertion, "equals")) return isDeepStrictEqual(value, assertion.equals);
    if (assertion.jsonType === "array") return Array.isArray(value);
    return false;
  }
  return typeof assertion.contains === "string" && source.includes(assertion.contains);
}
module.exports = { matchesAssertion };
