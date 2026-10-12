"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
test("unsupported platform refuses before target writes",()=>{
 const target=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"vsl-platform-")),"not-created");
 const {install}=require("../install.cjs");
 assert.throws(()=>install(["--target",target],{platform:"win32"}),/Unsupported/);
 assert.equal(fs.existsSync(target),false);
});

test("fresh release install creates and validates the actual runtime",()=>{
 const {install}=require("../install.cjs");
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),"vsl-install-")),target=path.join(parent,"target with spaces");
 install(["--target",target]);
 assert.equal(fs.existsSync(path.join(target,"vsl-agent/workflow/workflow.cjs")),true);
});

test("rerun validates without replacing files or installation state",()=>{
 const {install}=require("../install.cjs");
 const target=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"vsl-rerun-")),"runtime");
 assert.equal(install(["--target",target]).status,"INSTALLED");
 const state=path.join(target,".allsorted-vsl-agent-install.json"),before=fs.readFileSync(state);
 fs.writeFileSync(path.join(target,"my-draft.txt"),"user draft");
 assert.equal(install(["--target",target]).status,"VERIFIED");
 assert.deepEqual(fs.readFileSync(state),before);
 assert.equal(fs.readFileSync(path.join(target,"my-draft.txt"),"utf8"),"user draft");
});

test("edited runtime refuses and preserves the edited bytes",()=>{
 const {install}=require("../install.cjs");
 const target=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"vsl-dirty-")),"runtime");
 install(["--target",target]);
 const file=path.join(target,"vsl-agent/README.md");fs.writeFileSync(file,"my edits");
 assert.throws(()=>install(["--target",target]),/Dirty installation/);
 assert.equal(fs.readFileSync(file,"utf8"),"my edits");
});

test("symlink ancestor refuses before writes to its destination",()=>{
 const {install}=require("../install.cjs");
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),"vsl-link-")),real=path.join(parent,"real"),link=path.join(parent,"link");
 fs.mkdirSync(real);fs.symlinkSync(real,link,"dir");
 assert.throws(()=>install(["--target",path.join(link,"runtime")]),/Symlink/);
 assert.deepEqual(fs.readdirSync(real),[]);
});

test("nonempty unmarked target refuses without altering user files",()=>{
 const {install}=require("../install.cjs");
 const target=fs.mkdtempSync(path.join(os.tmpdir(),"vsl-unmarked-"));fs.writeFileSync(path.join(target,"keep.txt"),"keep");
 assert.throws(()=>install(["--target",target]),/marker/);
 assert.deepEqual(fs.readdirSync(target),["keep.txt"]);
});

test("old Node and malformed arguments refuse before target writes",()=>{
 const {install}=require("../install.cjs");
 const target=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"vsl-args-")),"runtime");
 assert.throws(()=>install(["--target",target],{nodeVersion:"22.0.0"}),/Node 24/);
 assert.throws(()=>install(["--target",target,"--force"]),/Usage/);
 assert.equal(fs.existsSync(target),false);
});

test("tampered release refuses before target creation",()=>{
 const root=path.resolve(__dirname,".."),parent=fs.mkdtempSync(path.join(os.tmpdir(),"vsl-tamper-")),copy=path.join(parent,"release"),target=path.join(parent,"target");
 fs.cpSync(root,copy,{recursive:true});
 fs.appendFileSync(path.join(copy,"core/vsl-agent/module/vsl-agent/README.md"),"\nchanged");
 const {spawnSync}=require("node:child_process");
 const run=spawnSync(process.execPath,[path.join(copy,"install.cjs"),"--target",target],{encoding:"utf8"});
 assert.equal(run.status,1);
 assert.equal(fs.existsSync(target),false);
});

test("standalone install preserves an unrelated registry reached through a symlink",()=>{
 const {install}=require("../install.cjs");
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),"vsl-registry-")),target=path.join(parent,"target"),outside=path.join(parent,"outside");
 fs.mkdirSync(target);fs.mkdirSync(outside);
 fs.writeFileSync(path.join(target,".allsorted-target.json"),"{}");
 fs.writeFileSync(path.join(outside,"agent-registry.json"),'{"agents":[]}');
 fs.symlinkSync(outside,path.join(target,"lib"),"dir");
 install(["--target",target]);
 assert.equal(fs.readFileSync(path.join(outside,"agent-registry.json"),"utf8"),'{"agents":[]}');
});

test("inherited offer type is rejected rather than returning an empty recommendation",()=>{
 const {recommend}=require("../core/vsl-agent/module/vsl-agent/workflow/workflow.cjs");
 assert.equal(recommend({offer_type:"toString",conversion_event:"purchase"}).status,"NEEDS_INPUT");
});

test("failed executable validation rolls back only newly owned runtime paths",()=>{
 const root=path.resolve(__dirname,".."),parent=fs.mkdtempSync(path.join(os.tmpdir(),"vsl-rollback-")),copy=path.join(parent,"release"),target=path.join(parent,"target");
 fs.cpSync(root,copy,{recursive:true});fs.mkdirSync(target);
 fs.writeFileSync(path.join(target,".allsorted-target.json"),"{}");fs.writeFileSync(path.join(target,"keep.txt"),"keep");
 const rel="core/vsl-agent/install/validate-vsl-agent.js";fs.writeFileSync(path.join(copy,rel),'throw Error("forced validator failure");');
 const manifestPath=path.join(copy,"manifest.json"),manifest=JSON.parse(fs.readFileSync(manifestPath));
 manifest.files[rel]=require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(copy,rel))).digest("hex");
 fs.writeFileSync(manifestPath,JSON.stringify(manifest));
 const run=require("node:child_process").spawnSync(process.execPath,[path.join(copy,"install.cjs"),"--target",target],{encoding:"utf8"});
 assert.equal(run.status,1);
 assert.deepEqual(fs.readdirSync(target).sort(),[".allsorted-target.json","keep.txt"]);
 assert.equal(fs.readFileSync(path.join(target,"keep.txt"),"utf8"),"keep");
});
