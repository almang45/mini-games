#!/usr/bin/env node
// Checks that a design branch only changes what AGENTS.md lets the UI/UX designer change,
// including game logic inside inline <script> blocks of HTML pages.
// Usage: node .agents/skills/asset-redesign/scripts/check-scope.mjs [base-ref]
// Compares the working tree (committed, staged, unstaged and untracked) with base-ref, which
// defaults to the merge base of HEAD and origin/main. Exit 0: in scope. Exit 1: blocked files.
// Exit 2: the check itself failed.
import { existsSync, readFileSync } from "node:fs";
import {
  IMAGE_EXT, ToolError, commitsWithoutCoauthor, enterRepoRoot, extOf, git, inlineBlocks, readArtInJs, runMain,
} from "./lib.mjs";

const FREE_EXT = new Set([...IMAGE_EXT, ".css", ".md"]);
const MANIFEST_FILES = new Set(["manifest.webmanifest"]);
const CONFIG_PREFIXES = [".agents/", ".github/"];
const CONFIG_FILES = new Set(["AGENTS.md", "sw.js"]);

runMain("check-scope", () => {
  enterRepoRoot();
  const base = process.argv[2] ? verifyRef(process.argv[2]) : mergeBase();
  const artInJs = new Map(readArtInJs().map((e) => [e.file, e]));
  const results = changedFiles(base).map((change) => classify(change, base, artInJs));
  const uncredited = commitsWithoutCoauthor(base);

  if (!results.length && !uncredited.length) {
    console.log(`No changes against ${base}.`);
    return 0;
  }
  console.log(`Scope check against ${base}\n`);
  if (results.length) {
    console.log("| Status | File | Why |\n|---|---|---|");
    for (const r of results) console.log(`| ${r.status} | \`${r.file}\` | ${r.why} |`);
  }
  if (uncredited.length) {
    console.log("\n| Status | Commit | Why |\n|---|---|---|");
    for (const c of uncredited) console.log(`| BLOCKED | \`${c.sha}\` ${c.subject} | no Co-Authored-By trailer |`);
  }

  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  const review = results.filter((r) => r.status === "REVIEW").length;
  console.log("");
  if (review) console.log(`${review} REVIEW file(s): allowed, but say in the PR what changed and that the listed limits hold.`);
  if (uncredited.length) {
    console.log(`${uncredited.length} commit(s) without a co-author: amend them (git commit --amend, or rebase -x for several) to add "Co-Authored-By: Antigravity <noreply@antigravity.google>", or your own agent's trailer.`);
  }
  if (blocked) {
    console.log(`${blocked} BLOCKED file(s): revert them, or keep only asset-path / class-name edits and justify each in the PR.`);
  }
  if (blocked || uncredited.length) return 1;
  console.log("All changes are in the designer's scope.");
  return 0;
});

function verifyRef(ref) {
  try {
    return git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
  } catch {
    throw new ToolError(`base ref '${ref}' is not a commit`);
  }
}

function mergeBase() {
  try {
    return git(["merge-base", "HEAD", "origin/main"]).trim();
  } catch (err) {
    throw new ToolError(`no base ref given and ${err.message}; run git fetch origin or pass a base ref`);
  }
}

function changedFiles(base) {
  const changes = [];
  const fields = git(["diff", "--name-status", "-z", "--find-renames", base]).split("\0").filter(Boolean);
  for (let i = 0; i < fields.length; i++) {
    const status = fields[i][0];
    if (status === "R" || status === "C") {
      changes.push({ status: "D", file: fields[i + 1], oldFile: fields[i + 1] });
      changes.push({ status: "A", file: fields[i + 2], oldFile: null });
      i += 2;
    } else {
      changes.push({ status, file: fields[i + 1], oldFile: status === "A" ? null : fields[i + 1] });
      i += 1;
    }
  }
  for (const file of git(["ls-files", "-z", "--others", "--exclude-standard"]).split("\0").filter(Boolean)) {
    changes.push({ status: "A", file, oldFile: null });
  }
  return changes;
}

function classify({ status, file }, base, artInJs) {
  const ext = extOf(file);
  const result = (s, why) => ({ status: s, file, why });

  if (CONFIG_FILES.has(file) || CONFIG_PREFIXES.some((p) => file.startsWith(p))) {
    return result("BLOCKED", "agent, CI or service-worker config");
  }
  if (MANIFEST_FILES.has(file)) return result("REVIEW", "icon entries only");
  if (FREE_EXT.has(ext)) return result("OK", status === "D" ? "removed asset or doc" : "visual asset, stylesheet or doc");
  if (ext === ".html") return classifyHtml(status, file, base);
  if (artInJs.has(file)) {
    const entry = artInJs.get(file);
    const edit = Array.isArray(entry.edit) ? entry.edit.join(", ") : entry.edit;
    return result("REVIEW", `art in JS: may edit ${edit}; keep ${entry.keep}`);
  }
  if (ext === ".js" || ext === ".mjs") return result("BLOCKED", "game logic");
  return result("BLOCKED", "outside the designer's scope");
}

function classifyHtml(status, file, base) {
  const result = (s, why) => ({ status: s, file, why });
  if (status === "D") return result("BLOCKED", "page removed");

  const newScripts = existsSync(file) ? inlineBlocks(readFileSync(file, "utf8"), "script") : [];
  if (status === "A") {
    return newScripts.length
      ? result("BLOCKED", `new page with inline <script> at lines ${ranges(newScripts)}`)
      : result("OK", "new page without inline script");
  }

  const oldScripts = inlineBlocks(git(["show", `${base}:${file}`]), "script");
  const touched = [];
  for (const hunk of hunks(base, file)) {
    if (hunk.newCount > 0 && overlaps(newScripts, hunk.newStart, hunk.newStart + hunk.newCount - 1)) {
      touched.push(`${hunk.newStart}-${hunk.newStart + hunk.newCount - 1}`);
    } else if (hunk.oldCount > 0 && overlaps(oldScripts, hunk.oldStart, hunk.oldStart + hunk.oldCount - 1)) {
      touched.push(`old ${hunk.oldStart}-${hunk.oldStart + hunk.oldCount - 1}`);
    }
  }
  return touched.length
    ? result("BLOCKED", `inline <script> (game logic) changed at lines ${touched.join(", ")}`)
    : result("OK", "markup or inline <style> only");
}

function hunks(base, file) {
  const out = [];
  const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  for (const line of git(["diff", "-U0", base, "--", file]).split("\n")) {
    const m = header.exec(line);
    if (!m) continue;
    out.push({
      oldStart: Number(m[1]), oldCount: m[2] === undefined ? 1 : Number(m[2]),
      newStart: Number(m[3]), newCount: m[4] === undefined ? 1 : Number(m[4]),
    });
  }
  return out;
}

function overlaps(blocks, first, last) {
  return blocks.some((b) => first <= b.lastLine && last >= b.firstLine);
}

function ranges(blocks) {
  return blocks.map((b) => `${b.firstLine}-${b.lastLine}`).join(", ");
}
