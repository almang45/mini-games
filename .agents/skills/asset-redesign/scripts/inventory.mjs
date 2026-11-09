#!/usr/bin/env node
// Prints a Markdown inventory of every visual asset and of the code that draws visuals itself.
// Usage, from anywhere in the repo: node .agents/skills/asset-redesign/scripts/inventory.mjs
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  IMAGE_EXT, enterRepoRoot, extOf, inlineBlocks, isTestPath, listFiles, readArtInJs, runMain,
} from "./lib.mjs";

const CODE_EXT = new Set([".html", ".css", ".js", ".mjs", ".webmanifest", ".json"]);
const ICON_MAX_PX = 512;
const RASTER_MAX_BYTES = 200 * 1024;

runMain("inventory", () => {
  enterRepoRoot();
  const files = listFiles();
  const sources = loadSources(files);
  const images = files.filter((f) => IMAGE_EXT.has(extOf(f)));

  const out = [];
  out.push("## Image files", "");
  out.push("| File | Bytes | Size / viewBox | Notes | Used by | Docs |", "|---|---|---|---|---|---|");
  for (const file of images) out.push(imageRow(file, sources));

  out.push("", "## Code that draws visuals", "");
  out.push("Inline `<script>` is game logic and out of scope; it is listed so the audit sees what draws there.", "");
  out.push("| File | Lines of CSS | Gradients | Shadows | Data URIs | Inline SVG | SVG/canvas drawn from JS | Inline script lines |");
  out.push("|---|---|---|---|---|---|---|---|");
  for (const src of sources.filter((s) => s.kind === "code")) {
    const row = visualRow(src);
    if (row) out.push(row);
  }

  out.push("", "## Art defined in JS (editable within limits)", "");
  out.push("| File | May edit | Art | Keep |", "|---|---|---|---|");
  for (const entry of readArtInJs()) {
    const edit = Array.isArray(entry.edit) ? entry.edit.map((s) => "`" + s + "`").join(", ") : entry.edit;
    out.push(`| \`${entry.file}\` | ${edit} | ${entry.art} | ${entry.keep} |`);
  }

  console.log(out.join("\n"));
  return 0;
});

function loadSources(files) {
  const sources = [];
  for (const file of files) {
    const ext = extOf(file);
    const isDoc = ext === ".md";
    if (!isDoc && !CODE_EXT.has(ext)) continue;
    if (isTestPath(file) || file === "AGENTS.md" || file.startsWith(".agents/")) continue;
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const scripts = ext === ".html" ? inlineBlocks(text, "script") : [];
    const styles = ext === ".html" ? inlineBlocks(text, "style") : [];
    let jsText = "";
    if (ext === ".js" || ext === ".mjs") jsText = text;
    else if (scripts.length) jsText = scripts.map((b) => b.text).join("\n");
    sources.push({ file, ext, kind: isDoc ? "doc" : "code", text, jsText, scripts, styles });
  }
  return sources;
}

function imageRow(file, sources) {
  if (!existsSync(file)) return `| \`${file}\` | MISSING | | tracked but deleted from the working tree | | |`;
  const buf = readFileSync(file);
  const bytes = statSync(file).size;
  const notes = [];
  let size;
  if (extOf(file) === ".svg") {
    const info = svgInfo(buf.toString("utf8"));
    size = info.size;
    notes.push(...info.notes);
  } else {
    const dims = rasterSize(buf, extOf(file));
    size = dims ? `${dims.w} x ${dims.h}` : "unknown";
    if (dims && (dims.w !== dims.h)) notes.push("non-square");
    if (dims && Math.max(dims.w, dims.h) > ICON_MAX_PX) notes.push(`over ${ICON_MAX_PX} px`);
    if (bytes > RASTER_MAX_BYTES) notes.push("over 200 KB");
  }
  const refs = references(file, sources);
  return `| \`${file}\` | ${bytes} | ${size} | ${notes.join(", ")} | ${refs.code.join("<br>") || "**none found**"} | ${refs.docs.join(", ")} |`;
}

function svgInfo(svg) {
  const notes = [];
  const root = (svg.match(/<svg\b[^>]*>/i) || [""])[0];
  const viewBox = root.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  let size = "no viewBox";
  if (viewBox) {
    size = viewBox[1].trim();
    const [, , w, h] = size.split(/[\s,]+/).map(Number);
    if (w !== h) notes.push("non-square");
  } else {
    notes.push("no viewBox");
  }
  if (/\b(width|height)\s*=/.test(root)) notes.push("fixed width/height");
  if (/<image\b/i.test(svg)) notes.push("embedded raster");
  if (/<text\b/i.test(svg)) notes.push("live text");
  if (/sodipodi|inkscape:|<metadata\b|<!--\s*Generator/i.test(svg)) notes.push("editor metadata");
  if (/href\s*=\s*["']https?:/i.test(svg) || /@import|url\(\s*["']?https?:/i.test(svg)) notes.push("external reference");
  return { size, notes };
}

// Reads dimensions from the file header so the result does not depend on how file(1) formats them.
function rasterSize(buf, ext) {
  if (ext === ".png" && buf.length >= 24 && buf.toString("ascii", 1, 4) === "PNG") {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (ext === ".gif" && buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  if (ext === ".webp" && buf.length >= 30 && buf.toString("ascii", 8, 12) === "WEBP") return webpSize(buf);
  if (ext === ".jpg" || ext === ".jpeg") return jpegSize(buf);
  if (ext === ".ico" && buf.length >= 8) return { w: buf[6] || 256, h: buf[7] || 256 };
  return null;
}

function webpSize(buf) {
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  return null;
}

function jpegSize(buf) {
  const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (SOF.has(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A path only counts when it is not the tail of a longer name: "icon.svg" must not match "favicon.svg".
function pathRe(p) {
  return new RegExp(`(?<![\\w./-])(?:\\./)?${escapeRe(p)}(?![\\w-])`);
}

// Paths a file may use for `target`. JS resolves URLs against the page that loads it, which lives in
// the game folder, so JS files also get candidates relative to their top-level folder.
function candidates(fromFile, target) {
  const dirs = new Set([path.posix.dirname(fromFile)]);
  if (fromFile.endsWith(".js") || fromFile.endsWith(".mjs")) {
    const top = fromFile.includes("/") ? fromFile.split("/")[0] : ".";
    dirs.add(top);
  }
  const out = new Set([target]);
  for (const dir of dirs) out.add(dir === "." ? target : path.posix.relative(dir, target));
  // A file inside the target folder yields an empty relative path, which would match anything.
  return [...out].filter((c) => c !== "" && c !== ".");
}

function references(asset, sources) {
  const code = [];
  const docs = [];
  const dir = path.posix.dirname(asset);
  const base = path.posix.basename(asset);
  const baseRe = pathRe(base);
  for (const src of sources) {
    if (src.kind === "doc") {
      // A bare file name in a doc only means this asset when the doc sits in the asset's own folder.
      const sameDir = path.posix.dirname(src.file) === dir;
      if (candidates(src.file, asset).some((c) => pathRe(c).test(src.text)) || (sameDir && baseRe.test(src.text))) docs.push(src.file);
      continue;
    }
    if (candidates(src.file, asset).some((c) => pathRe(c).test(src.text))) {
      code.push(src.file);
      continue;
    }
    if (!src.jsText) continue;
    // Runtime-built names (tile faces) only show up as a base folder string in script.
    const folderHit = dir !== "." && candidates(src.file, dir).some((c) =>
      new RegExp(`(?<![\\w./-])(?:\\./)?${escapeRe(c)}/["'\`]`).test(src.jsText));
    if (folderHit) code.push(`${src.file} (folder)`);
    else if (baseRe.test(src.jsText)) code.push(`${src.file} (by name)`);
  }
  return { code, docs };
}

function visualRow(src) {
  const css = src.ext === ".css" ? src.text : src.styles.map((b) => b.text).join("\n");
  const markup = src.ext === ".html" ? stripBlocks(src.text) : "";
  const cssLines = css ? css.split("\n").length : 0;
  const count = (text, re) => (text.match(re) || []).length;
  const gradients = count(css, /gradient\(/g);
  const shadows = count(css, /box-shadow|text-shadow|drop-shadow\(/g);
  const dataUris = count(css, /url\(\s*["']?data:/g) + count(markup, /["']data:image\//g);
  const inlineSvg = count(markup, /<svg\b/gi);
  const drawn = count(src.jsText, /createElementNS\([^)]*svg|<svg\b|getContext\(\s*["']2d/gi);
  const scriptLines = src.scripts.reduce((n, b) => n + b.lastLine - b.firstLine + 1, 0);
  if (!cssLines && !inlineSvg && !drawn && !dataUris) return null;
  return `| \`${src.file}\` | ${cssLines} | ${gradients} | ${shadows} | ${dataUris} | ${inlineSvg} | ${drawn} | ${scriptLines} |`;
}

function stripBlocks(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}
