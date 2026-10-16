import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { createMatcher, listFiles, walk } from "./src/index.js";

const root = mkdtempSync(join(tmpdir(), "walk-files-"));
after(() => rmSync(root, { recursive: true, force: true }));
const put = (rel, content = "x") => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
};
for (const f of ["b.txt", "a.txt", "src/index.js", "src/util/deep.js", "src/util/deep.test.js", "node_modules/pkg/index.js", "build/out.js", "docs/readme.md", "docs/img/logo.png", ".env", "notes.log", "src/app.log"]) put(f);

test("lists files in a stable, sorted order with / separators", async () => {
  const all = await listFiles(root);
  assert.deepEqual(all, [".env", "a.txt", "b.txt", "build/out.js", "docs/img/logo.png", "docs/readme.md", "node_modules/pkg/index.js", "notes.log", "src/app.log", "src/index.js", "src/util/deep.js", "src/util/deep.test.js"]);
});

test("entries describe the files", async () => {
  const entries = [];
  for await (const e of walk(root, { maxDepth: 1 })) entries.push(e);
  assert.deepEqual(entries.map((e) => e.rel), [".env", "a.txt", "b.txt", "notes.log"]);
  assert.equal(entries[1].type, "file");
  assert.equal(entries[1].size, 1);
  assert.ok(entries[1].path.endsWith("a.txt") && entries[1].mtimeMs > 0);
});

test("ignore patterns work like .gitignore", async () => {
  const list = await listFiles(root, { ignore: ["node_modules/", "build", "*.log", "!src/app.log", "docs/img/", ".env", "/b.txt"] });
  assert.deepEqual(list, ["a.txt", "docs/readme.md", "src/app.log", "src/index.js", "src/util/deep.js", "src/util/deep.test.js"]);
});

test("ignored folders are not entered, and files inside stay ignored whatever a later ! says", async () => {
  const list = await listFiles(root, { ignore: "build/\n!build/out.js\nnode_modules" });
  assert.ok(!list.includes("build/out.js"));
  assert.ok(!list.some((p) => p.startsWith("node_modules")));
});

test("ignoreFiles reads patterns from the root folder", async () => {
  writeFileSync(join(root, ".walkignore"), "# comments are fine\n*.log\n\ndocs/**\n!docs/readme.md\n");
  const list = await listFiles(root, { ignoreFiles: [".walkignore", ".missing"], ignore: ["node_modules/", "build/"] });
  assert.ok(!list.includes("notes.log") && !list.includes("src/app.log"));
  assert.ok(!list.includes("docs/img/logo.png"));
  assert.ok(list.includes("docs/readme.md"));
});

test("dirs, filter and maxDepth", async () => {
  const dirs = [];
  for await (const e of walk(root, { dirs: true, ignore: ["node_modules/", "build/"], filter: (e) => e.type === "dir" })) dirs.push(e.rel);
  assert.deepEqual(dirs, ["docs", "docs/img", "src", "src/util"]);
  assert.deepEqual(await listFiles(root, { ignore: ["node_modules/", "build/", "docs/", ".walkignore", ".env"], filter: (e) => e.name.endsWith(".js"), maxDepth: 2 }), ["src/index.js"]);
});

test("symbolic links are skipped, or listed without being followed", { skip: process.platform === "win32" }, async () => {
  const outside = mkdtempSync(join(tmpdir(), "walk-outside-"));
  writeFileSync(join(outside, "secret.txt"), "secret");
  symlinkSync(outside, join(root, "link-to-outside"));
  symlinkSync(root, join(root, "loop"));
  try {
    const list = await listFiles(root, { ignore: ["node_modules/", "build/"] });
    assert.ok(!list.some((p) => p.includes("secret") || p.startsWith("loop") || p.startsWith("link-to-outside")));
    const entries = [];
    for await (const e of walk(root, { symlinks: "include", ignore: ["node_modules/", "build/", "src/", "docs/"] })) if (e.type === "symlink") entries.push(e.rel);
    assert.deepEqual(entries, ["link-to-outside", "loop"]);
  } finally {
    unlinkSync(join(root, "link-to-outside"));
    unlinkSync(join(root, "loop"));
    rmSync(outside, { recursive: true, force: true });
  }
});

test("errors and cancellation", async () => {
  await assert.rejects(listFiles(join(root, "a.txt")), TypeError);
  await assert.rejects(listFiles(join(root, "missing")), { code: "ENOENT" });
  await assert.rejects(listFiles(root, { symlinks: "follow" }), RangeError);
  const controller = new AbortController();
  controller.abort(new Error("stop"));
  await assert.rejects(listFiles(root, { signal: controller.signal }), /stop/);
});

test("the matcher on its own", () => {
  const m = createMatcher(["*.log", "!keep.log", "/root-only.txt", "cache/", "a/**/z", "**/tmp", "docs/*.md", "?.x", "[ab].y", "\\#hash", "trailing   "]);
  const cases = {
    "x.log": true, "dir/x.log": true, "keep.log": false, "root-only.txt": true, "sub/root-only.txt": false,
    "cache/file": true, "a/z": true, "a/b/c/z": true, "a/b": false, "x/tmp/y": true, "tmp": true,
    "docs/a.md": true, "docs/sub/a.md": false, "q.x": true, "qq.x": false, "a.y": true, "c.y": false, "#hash": true, "trailing": true
  };
  for (const [path, expected] of Object.entries(cases)) assert.equal(m(path), expected, path);
  assert.equal(m("cache", true), true);
  assert.equal(m("cache", false), false); // "cache/" is for folders only
  assert.equal(createMatcher()("anything"), false);
});
