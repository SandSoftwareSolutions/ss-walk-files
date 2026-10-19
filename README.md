# @sandsoftwaresolutions/walk-files

[![CI](https://github.com/SandSoftwareSolutions/ss-walk-files/actions/workflows/ci.yml/badge.svg)](https://github.com/SandSoftwareSolutions/ss-walk-files/actions/workflows/ci.yml)

Walk a folder in the same order on every machine, with `.gitignore`-style ignore rules, and never follow a symbolic link. For build tools, backups, hashing, search. No dependencies.

## Install

```bash
npm install @sandsoftwaresolutions/walk-files
```

## Usage

```js
import { walk, listFiles, createMatcher } from "@sandsoftwaresolutions/walk-files";

const files = await listFiles("./project", {
  ignore: ["node_modules/", "dist/", "*.log", "!important.log"],
  ignoreFiles: [".gitignore"]            // also read patterns from this file in the root
});
// ["package.json", "src/index.js", "src/util/deep.js", ...]  sorted, "/" separators

for await (const entry of walk("./project", { ignore: "node_modules/" })) {
  console.log(entry.rel, entry.size, entry.mtimeMs);
}

const ignored = createMatcher(["*.log", "build/"]);
ignored("logs/app.log");      // true
ignored("build", true);       // true (second argument: is it a folder?)
```

## Details

- **Same order everywhere.** Entries are sorted by name and use `/` in `rel`, also on Windows, so a list or a hash made on one machine matches another. Names are compared as they are stored (UTF-16 order, no Unicode normalisation): macOS stores accented names decomposed, so those can sort differently there.
- **Ignored folders are skipped, not scanned.** `node_modules/` costs nothing.
- **Symbolic links are never followed.** No loops, and nothing outside the folder is read by accident. Only the folder you pass in may itself be a link to a folder. A file that is removed while the walk runs is skipped. `symlinks: "include"` lists them (type `"symlink"`) without following.
- **`.gitignore` rules:** `*`, `?`, `[a-z]`, `**` for any number of folders, a leading or inner `/` anchors to the root, a trailing `/` means folders only, `!` re-includes (the last matching rule wins), `#` comments, `\#` and `\!` escapes. As in git, a file inside an ignored folder stays ignored even if a later rule says `!`. Patterns are matched without regular expressions, so a hostile `.gitignore` (`*a*a*a*a*b`, a dozen `**/`) cannot make a walk slow. A negated class such as `[!a]` never matches a `/`. CRLF line endings in the file are fine.
- Options: `dirs` (also yield folders), `maxDepth` (1 = only the root folder), `filter(entry)`, `signal` (an `AbortSignal`).
- Entries: `{ path, rel, name, type: "file" | "dir" | "symlink", size, mtimeMs }`.
- Only the root's ignore files are read; nested `.gitignore` files in subfolders are not (yet).
