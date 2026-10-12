"use strict";

const fs = require("node:fs");
const path = require("node:path");
const removeSync = fs.rmSync.bind(fs);

function atomicWrite(filePath, content, options = {}) {
  const encoding = options.encoding || "utf8";
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tempPath, content, encoding);
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch { /* best effort */ }
    throw error;
  }
}

function atomicWriteJson(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
  syncAgentRegistry(filePath);
}

function moduleMetadata() {
  const moduleRoot = path.resolve(__dirname, "..", "..");
  const specPath = path.join(moduleRoot, "module.spec.json");
  if (!fs.existsSync(specPath)) return null;
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  if (!spec.name || spec.name === "mission-control-core") return null;
  const catalogPath = path.resolve(moduleRoot, "..", "..", "manifests", "catalog.json");
  const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, "utf8")) : { modules: [] };
  const catalogEntry = Array.isArray(catalog.modules) ? catalog.modules.find((entry) => entry.name === spec.name) : null;
  return {
    name: spec.name,
    displayName: spec.displayName || spec.name.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "),
    category: catalogEntry?.category || spec.categories?.[0] || "uncategorized",
    version: spec.version || "0.0.0",
  };
}

function registryPathForTarget(target) {
  return [
    path.join(target, "lib", "agent-registry.json"),
    path.join(target, "mission-control", "lib", "agent-registry.json"),
  ].find((candidate) => fs.existsSync(candidate)) || null;
}

function syncAgentRegistry(statePath) {
  if (!/^\.allsorted-.*(?:state|manifest|install)\.json$/.test(path.basename(statePath))) return;
  const metadata = moduleMetadata();
  const registryPath = registryPathForTarget(path.dirname(statePath));
  if (!metadata || !registryPath) return;
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!registry || !Array.isArray(registry.agents)) return;
  const agent = {
    name: metadata.name,
    displayName: metadata.displayName,
    category: metadata.category,
    installPath: path.join(path.dirname(statePath), metadata.name),
    version: metadata.version,
    registeredAt: new Date().toISOString(),
  };
  const existing = registry.agents.findIndex((entry) => entry && entry.name === metadata.name);
  if (existing >= 0) agent.registeredAt = registry.agents[existing].registeredAt || agent.registeredAt;
  if (existing >= 0) registry.agents[existing] = agent;
  else registry.agents.push(agent);
  atomicWrite(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
}

function removeAgentRegistryEntry(statePath) {
  if (!/^\.allsorted-.*(?:state|manifest|install)\.json$/.test(path.basename(statePath))) return;
  const metadata = moduleMetadata();
  const registryPath = registryPathForTarget(path.dirname(statePath));
  if (!metadata || !registryPath) return;
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!registry || !Array.isArray(registry.agents)) return;
  const next = registry.agents.filter((entry) => entry && entry.name !== metadata.name);
  if (next.length === registry.agents.length) return;
  registry.agents = next;
  atomicWrite(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
}

fs.rmSync = function allsortedRegistryAwareRemove(filePath, ...args) {
  removeAgentRegistryEntry(filePath);
  return removeSync(filePath, ...args);
};

module.exports = { atomicWrite, atomicWriteJson };
