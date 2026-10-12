#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {execFileSync} = require("node:child_process");
const ROOT = __dirname;
const MARKER = ".allsorted-target.json";
const STATE = ".allsorted-vsl-agent-install.json";
function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function files(root, here = root) {
  return fs.readdirSync(here, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry => {
    if (here === ROOT && entry.name === ".git") return [];
    const full = path.join(here,entry.name);
    if (entry.isSymbolicLink()) throw Error("Symlink refused: " + full);
    if (entry.isDirectory()) return files(root,full);
    if (!entry.isFile()) throw Error("Non-file refused: " + full);
    return [path.relative(root,full).split(path.sep).join("/")];
  });
}
function checkAncestors(target, platform) {
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current,part);
    if (!fs.existsSync(current) && !fs.lstatSync(current,{throwIfNoEntry:false})) break;
    const stat = fs.lstatSync(current);
    const systemAlias = platform === "darwin" && ["/tmp","/var","/etc"].includes(current);
    if (stat.isSymbolicLink() && !systemAlias) throw Error("Symlink target or ancestor refused: " + current);
    if (!fs.statSync(current).isDirectory()) throw Error("Target ancestor is not a directory: " + current);
  }
}
function verifyPackage() {
  const manifestPath = path.join(ROOT,"manifest.json");
  if (fs.lstatSync(manifestPath).isSymbolicLink()) throw Error("Symlink manifest refused");
  const manifest = JSON.parse(fs.readFileSync(manifestPath,"utf8"));
  if (manifest.name !== "allsorted-vsl-agent" || !manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files)) throw Error("Invalid release manifest");
  const actual = files(ROOT).filter(file => file !== "manifest.json");
  const expected = Object.keys(manifest.files).sort();
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected)) throw Error("Release file set differs from manifest");
  for (const file of expected) {
    if (file.startsWith("/") || file.includes("\\") || file.split("/").some(part=>!part || part==="." || part==="..")) throw Error("Unsafe manifest path");
    if (!/^[a-f0-9]{64}$/.test(manifest.files[file]) || hash(path.join(ROOT,file)) !== manifest.files[file]) throw Error("Release checksum mismatch: " + file);
  }
  return manifest;
}
function verifyRuntime(source,target) {
  const expected = files(source), actual = files(target);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error("Dirty installation: runtime file set differs; preserve it and choose a new target");
  for (const file of expected) if (hash(path.join(source,file)) !== hash(path.join(target,file))) throw Error("Dirty installation: edited " + file + "; preserve it and choose a new target");
}
function validateRuntime(target) {
  execFileSync(process.execPath,[path.join(ROOT,"core/vsl-agent/install/validate-vsl-agent.js"),"--target",target],{stdio:"inherit"});
  execFileSync(process.execPath,[path.join(target,"vsl-agent/workflow/workflow.cjs"),"validate"],{stdio:"inherit"});
}
function install(args, {platform=process.platform,nodeVersion=process.versions.node}={}) {
  if (!["darwin","linux"].includes(platform)) throw Error("Unsupported platform: " + platform);
  if (Number(nodeVersion.split(".")[0]) < 24) throw Error("Node 24 or newer is required");
  if (args.length !== 2 || args[0] !== "--target" || !args[1] || args[1].startsWith("--")) throw Error("Usage: node install.cjs --target <dedicated folder>");
  const target = path.resolve(args[1]);
  checkAncestors(target,platform);
  const canonicalRoot = fs.realpathSync(ROOT);
  let existing = target;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const canonicalTarget = path.resolve(fs.realpathSync(existing),path.relative(existing,target));
  if (canonicalTarget === canonicalRoot || canonicalTarget.startsWith(canonicalRoot+path.sep) || canonicalRoot.startsWith(canonicalTarget+path.sep)) throw Error("Target must not overlap the release folder");
  const manifest = verifyPackage();
  const source = path.join(ROOT,"core/vsl-agent/module/vsl-agent");
  const runtime = path.join(target,"vsl-agent"), marker = path.join(target,MARKER);
  const existed = fs.existsSync(target);
  const entries = existed ? fs.readdirSync(target) : [];
  if (entries.length) {
    if (!entries.includes(MARKER) || fs.lstatSync(marker).isSymbolicLink()) throw Error("Nonempty target requires a regular All Sorted marker");
    const value = JSON.parse(fs.readFileSync(marker,"utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid All Sorted target marker");
  }
  if (fs.lstatSync(runtime,{throwIfNoEntry:false})) {
    if (fs.lstatSync(runtime).isSymbolicLink() || !fs.statSync(runtime).isDirectory()) throw Error("Symlink or invalid runtime refused");
    verifyRuntime(source,runtime);
    validateRuntime(target);
    return {status:"VERIFIED",version:manifest.version,coreVersion:manifest.coreVersion,target};
  }
  if (fs.lstatSync(path.join(target,STATE),{throwIfNoEntry:false})) throw Error("Existing install state without runtime; preserve it and choose a new target");
  const ownsMarker = !entries.length;
  fs.mkdirSync(target,{recursive:true});
  try {
    if (ownsMarker) fs.writeFileSync(marker,JSON.stringify({product:"All Sorted",scope:"VSL standalone",version:manifest.version})+"\n",{flag:"wx"});
    fs.mkdirSync(runtime);
    for (const file of files(source)) {
      const destination = path.join(runtime,file);
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.copyFileSync(path.join(source,file),destination,fs.constants.COPYFILE_EXCL);
    }
    verifyRuntime(source,runtime);
    validateRuntime(target);
    fs.writeFileSync(path.join(target,STATE),JSON.stringify({name:"vsl-agent",version:manifest.coreVersion,standaloneVersion:manifest.version,files:files(source).map(file=>({path:"vsl-agent/"+file,sha256:hash(path.join(source,file))})),mode:"isolated standalone"},null,2)+"\n",{flag:"wx"});
  } catch (error) {
    // These paths were absent at preflight and belong only to this attempted install.
    fs.rmSync(runtime,{recursive:true,force:true});
    fs.rmSync(path.join(target,STATE),{force:true});
    if (ownsMarker) fs.rmSync(marker,{force:true});
    if (!existed && fs.readdirSync(target).length===0) fs.rmdirSync(target);
    throw error;
  }
  return {status:"INSTALLED",version:manifest.version,coreVersion:manifest.coreVersion,target};
}
if (require.main === module) {
  try { console.log(JSON.stringify(install(process.argv.slice(2)),null,2)); }
  catch (error) { console.error(error.message); process.exitCode=1; }
}
module.exports={install};
