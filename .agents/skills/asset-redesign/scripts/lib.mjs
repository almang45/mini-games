// Helpers shared by inventory.mjs and check-scope.mjs. Node built-ins only: the repo has no npm dependencies.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export const IMAGE_EXT = new Set([".svg", ".png", ".webp", ".jpg", ".jpeg", ".gif", ".ico"]);
export const ART_IN_JS_FILE = ".agents/skills/asset-redesign/resources/art-in-js.json";

export class ToolError extends Error {}

export function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : err.message;
    throw new ToolError(`git ${args.join(" ")} failed: ${stderr}`);
  }
}

export function enterRepoRoot() {
  process.chdir(git(["rev-parse", "--show-toplevel"]).trim());
}

// Tracked files plus untracked ones that are not ignored, so new assets show up before they are committed.
export function listFiles() {
  return git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .filter(Boolean)
    .sort();
}

export const isTestPath = (file) => /(^|\/)test\//.test(file);
export const extOf = (file) => path.posix.extname(file).toLowerCase();

const SCRIPT_OPEN = /<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi;
const STYLE_OPEN = /<style\b[^>]*>/gi;

// Inline <script> or <style> blocks of an HTML document, with 1-based inclusive line ranges and their text.
export function inlineBlocks(html, kind) {
  const open = kind === "script" ? SCRIPT_OPEN : STYLE_OPEN;
  const close = kind === "script" ? "</script>" : "</style>";
  const blocks = [];
  open.lastIndex = 0;
  let match;
  while ((match = open.exec(html)) !== null) {
    const start = match.index + match[0].length;
    const end = html.toLowerCase().indexOf(close, start);
    const stop = end === -1 ? html.length : end;
    blocks.push({
      text: html.slice(start, stop),
      firstLine: lineAt(html, match.index),
      lastLine: lineAt(html, stop),
    });
    open.lastIndex = stop;
  }
  return blocks;
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function readArtInJs() {
  try {
    return JSON.parse(readFileSync(ART_IN_JS_FILE, "utf8"));
  } catch (err) {
    throw new ToolError(`cannot read ${ART_IN_JS_FILE}: ${err.message}`);
  }
}

export function runMain(name, main) {
  try {
    const code = main();
    process.exitCode = typeof code === "number" ? code : 0;
  } catch (err) {
    console.error(`${name}: ${err instanceof ToolError ? err.message : err.stack}`);
    process.exitCode = 2;
  }
}
