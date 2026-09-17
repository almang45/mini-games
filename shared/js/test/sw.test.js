// The service worker caches the whole tile set by name, so a tile added to or renamed in
// shared/assets/tiles/ must be reflected in sw.js or offline games show blanks for it.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const REPO = path.join(__dirname, "..", "..", "..");
const source = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
const match = source.match(/const TILE_FILES = (\[[\s\S]*?\]);/);
ok("sw.js declares TILE_FILES", !!match);
const listed = JSON.parse(match[1]);
const onDisk = fs.readdirSync(path.join(REPO, "shared", "assets", "tiles")).filter((f) => f.endsWith(".svg"));

ok("no duplicates in TILE_FILES", new Set(listed).size === listed.length);
ok("every tile on disk is listed", onDisk.every((f) => listed.includes(f)), onDisk.filter((f) => !listed.includes(f)));
ok("every listed tile exists", listed.every((f) => onDisk.includes(f)), listed.filter((f) => !onDisk.includes(f)));

const tiles = require(path.join(REPO, "mahjong-table", "js", "tiles.js"));
const tableAssets = [...Array(tiles.KIND_COUNT).keys()].map((kind) => tiles.assetOf(kind));
ok("every Mahjong Table tile face is listed", tableAssets.every((f) => listed.includes(f)), tableAssets.filter((f) => !listed.includes(f)));

console.log("sw.test.js: " + passed + " assertions passed");
