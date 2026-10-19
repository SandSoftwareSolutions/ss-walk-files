import { readdir, readFile, lstat, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createMatcher } from "./ignore.js";

export { createMatcher };

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * Walks a folder and yields its entries: `{ path, rel, name, type, size, mtimeMs }` where `type` is "file", "dir" or "symlink",
 * `rel` always uses `/`, and the order is the same on every machine (sorted by name, folders in place).
 * Options: `ignore` (gitignore-style patterns, array or text), `ignoreFiles` (names like [".gitignore"] read from the root folder),
 * `dirs` (also yield folders, default false), `symlinks` ("skip" default, or "include" to yield them without following), `maxDepth`,
 * `filter(entry)`, `signal`. Ignored folders are not entered at all, so `node_modules` costs nothing.
 * Symbolic links are never followed, so there are no loops and nothing outside the folder is read by accident.
 */
export async function* walk(root, { ignore = [], ignoreFiles = [], dirs = false, symlinks = "skip", maxDepth = Infinity, filter, signal } = {}) {
  const base = resolve(root);
  const top = await stat(base); // the root itself may be a link to a folder (as /tmp is on macOS); links below it are never followed
  if (!top.isDirectory()) throw new TypeError(`walk-files: ${root} is not a folder`);
  if (!["skip", "include"].includes(symlinks)) throw new RangeError('walk-files: symlinks must be "skip" or "include"');
  const patterns = typeof ignore === "string" ? ignore.split("\n") : [...ignore];
  for (const name of ignoreFiles) {
    try {
      patterns.push(...(await readFile(join(base, name), "utf8")).split("\n"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const ignored = createMatcher(patterns);

  async function* visit(dir, rel, depth) {
    signal?.throwIfAborted();
    let names;
    try {
      names = (await readdir(dir, { withFileTypes: true })).sort(byName);
    } catch (error) {
      if (error.code === "ENOENT" && dir !== base) return; // removed while we were walking
      throw error;
    }
    for (const dirent of names) {
      const childRel = rel ? `${rel}/${dirent.name}` : dirent.name;
      const path = join(dir, dirent.name);
      const isDir = dirent.isDirectory();
      if (ignored(childRel, isDir)) continue;
      if (dirent.isSymbolicLink()) {
        if (symlinks === "include") {
          const entry = { path, rel: childRel, name: dirent.name, type: "symlink", size: 0, mtimeMs: 0 };
          if (!filter || (await filter(entry))) yield entry;
        }
        continue;
      }
      if (isDir) {
        if (dirs) {
          const entry = { path, rel: childRel, name: dirent.name, type: "dir", size: 0, mtimeMs: 0 };
          if (!filter || (await filter(entry))) yield entry;
        }
        if (depth < maxDepth) yield* visit(path, childRel, depth + 1);
      } else if (dirent.isFile()) {
        let info;
        try {
          info = await lstat(path);
        } catch (error) {
          if (error.code === "ENOENT") continue; // removed while we were walking
          throw error;
        }
        const entry = { path, rel: childRel, name: dirent.name, type: "file", size: info.size, mtimeMs: info.mtimeMs };
        if (!filter || (await filter(entry))) yield entry;
      }
    }
  }
  yield* visit(base, "", 1);
}

/** All files as an array of relative paths (`/` separated, sorted). Takes the same options as `walk`. */
export async function listFiles(root, options) {
  const out = [];
  for await (const entry of walk(root, options)) if (entry.type === "file") out.push(entry.rel);
  return out;
}
