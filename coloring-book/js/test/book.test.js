const assert = require("assert");
const BOOK = require("../book.js");
const { SIZE, PICTURES, PICTURES_BY_ID, cloud, band } = require("../pictures.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const REQUIRED = {
  rect: ["x", "y", "width", "height"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  path: ["d"],
};

// Every number in a path or attribute, so a typo that throws a shape off the page shows up.
const numbersIn = (value) => String(value).match(/-?\d+(\.\d+)?/g) || [];

(function picturesAreWellFormed() {
  ok("picture ids are unique", new Set(PICTURES.map((p) => p.id)).size === PICTURES.length);
  ok("at least six pictures", PICTURES.length >= 6);
  for (const picture of PICTURES) {
    const label = picture.id;
    ok(label + " is findable by id", PICTURES_BY_ID[picture.id] === picture);
    ok(label + " has names in both languages", Boolean(picture.name.id && picture.name.en));
    const ids = picture.regions.map((r) => r.id);
    ok(label + ": region ids are unique", new Set(ids).size === ids.length, ids);
    ok(label + ": the first region is the full-page background", picture.regions[0].id === "bg" &&
      picture.regions[0].attrs.width === SIZE && picture.regions[0].attrs.height === SIZE);
    ok(label + ": enough to color", picture.regions.length >= 8);
    picture.regions.forEach((region, i) => {
      const where = label + "/" + region.id;
      ok(where + ": known shape", Boolean(REQUIRED[region.tag]), region.tag);
      for (const attr of REQUIRED[region.tag] || []) ok(where + ": has " + attr, region.attrs[attr] !== undefined);
      if (region.tag === "path") ok(where + ": path uses only path commands", /^[MLHVCSQTAZ0-9 .,-]+$/i.test(region.attrs.d), region.attrs.d);
      for (const [attr, value] of Object.entries(region.attrs)) {
        if (attr === "transform") continue;
        for (const num of numbersIn(value)) {
          ok(where + ": " + attr + " stays near the page", Number(num) >= -20 && Number(num) <= SIZE + 20, num);
        }
      }
      if (region.clip) {
        const target = ids.indexOf(region.clip);
        ok(where + ": clips to an earlier region", target >= 0 && target < i, region.clip);
      }
    });
    for (const line of picture.lines) ok(label + ": detail line is a path", /^[MLHVCSQTAZ0-9 .,-]+$/i.test(line), line);
  }
})();

(function helpersDrawWhatTheySay() {
  const c = cloud(10, 100, 1);
  ok("cloud starts at its bottom-left corner", c.startsWith("M10 100 "));
  ok("cloud closes", c.endsWith("Z"));
  ok("a doubled cloud is twice as wide", cloud(0, 100, 2).includes(" 224 40 "));
  ok("rainbow band spans its outer diameter", band(200, 300, 190, 170).startsWith("M10 300 A190 190 0 0 1 390 300 L370 300 A170 170 0 0 0 30 300 Z"));
  const rainbow = PICTURES_BY_ID.rainbow.regions.filter((r) => r.id.startsWith("band"));
  ok("seven rainbow bands, for mejikuhibiniu", rainbow.length === 7);
})();

(function paintingAndUndo() {
  let state = BOOK.createState({});
  state = BOOK.paint(state, "sun", "yellow");
  ok("painting fills a region", state.fills.sun === "yellow");
  const same = BOOK.paint(state, "sun", "yellow");
  ok("painting the same color again changes nothing", same === state);
  state = BOOK.paint(state, "sun", "orange");
  state = BOOK.paint(state, "bg", "light-blue");
  ok("history keeps every change", state.history.length === 3);

  let undone = BOOK.undo(state);
  ok("undo removes a first fill", !("bg" in undone.fills));
  undone = BOOK.undo(undone);
  ok("undo restores the color before", undone.fills.sun === "yellow");
  undone = BOOK.undo(BOOK.undo(undone));
  ok("undo past the start is a no-op", Object.keys(undone.fills).length === 0 && undone.history.length === 0);
  ok("undo on an empty history returns the same state", BOOK.undo(undone) === undone);

  const cleared = BOOK.clear(state);
  ok("clear empties the picture", Object.keys(cleared.fills).length === 0);
  ok("clear on a blank picture changes nothing", BOOK.clear(cleared) === cleared);
  const back = BOOK.undo(cleared);
  ok("undo brings a cleared picture back", back.fills.sun === "orange" && back.fills.bg === "light-blue");
  ok("the original state is untouched", state.fills.sun === "orange" && Object.isFrozen(state.fills));

  let long = BOOK.createState({});
  for (let i = 0; i < BOOK.MAX_HISTORY + 20; i++) long = BOOK.paint(long, "r" + i, "red");
  ok("history is capped", long.history.length === BOOK.MAX_HISTORY);
})();

(function savedFillsAreChecked() {
  const fills = BOOK.sanitizeFills({ sun: "yellow", moon: "white", bg: "plaid", wall: "red" }, ["bg", "sun", "wall"], ["yellow", "red"]);
  ok("keeps known regions and colors", fills.sun === "yellow" && fills.wall === "red");
  ok("drops unknown regions", !("moon" in fills));
  ok("drops unknown colors", !("bg" in fills));
  ok("junk becomes an empty picture", Object.keys(BOOK.sanitizeFills("oops", ["bg"], ["red"])).length === 0);
  ok("share of regions colored", BOOK.coloredShare({ a: "red", b: "blue" }, ["a", "b", "c", "d"]) === 0.5);
  ok("an empty region list is 0% colored", BOOK.coloredShare({}, []) === 0);
})();

console.log("book.test.js: " + passed + " assertions passed");
