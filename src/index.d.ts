export interface Entry {
  /** Absolute path. */
  path: string;
  /** Path relative to the root, always with "/". */
  rel: string;
  name: string;
  type: "file" | "dir" | "symlink";
  size: number;
  mtimeMs: number;
}

export interface WalkOptions {
  /** Gitignore-style patterns. */
  ignore?: string | readonly string[];
  /** Files in the root folder to read patterns from, such as [".gitignore"]. */
  ignoreFiles?: readonly string[];
  /** Also yield folders. Default false. */
  dirs?: boolean;
  /** "include" yields symbolic links without following them. Default "skip". */
  symlinks?: "skip" | "include";
  /** 1 = only the root folder. Default: unlimited. */
  maxDepth?: number;
  filter?: (entry: Entry) => boolean | Promise<boolean>;
  signal?: AbortSignal;
}

export function walk(root: string, options?: WalkOptions): AsyncGenerator<Entry, void, undefined>;
export function listFiles(root: string, options?: WalkOptions): Promise<string[]>;
export function createMatcher(patterns?: string | readonly string[]): (relPath: string, isDirectory?: boolean) => boolean;
