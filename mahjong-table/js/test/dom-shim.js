// Minimal hand-rolled DOM shim: just enough to load js/ui.js in Node and drive
// the "You vs 3 AI" flow end-to-end, to catch integration bugs (missing ids,
// bad selectors, control-flow mistakes) that the unit tests can't see because
// they never touch the DOM-facing code. NOT a general-purpose DOM - only
// supports what index.html + js/ui.js actually use.
"use strict";

const { FakeClassList } = require("../../../shared/test/fake-class-list.js");

class FakeElement {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase();
    this.id = "";
    this._classList = new FakeClassList(this);
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this._text = "";
    this._html = "";
    this._hidden = false;
    this._listeners = {};
    this._checked = false;
    this.type = "";
    this.name = "";
    this.value = "";
    this.title = "";
  }
  get className() { return this._classList.toString(); }
  set className(v) { this._classList = new FakeClassList(this); String(v).split(/\s+/).filter(Boolean).forEach((c) => this._classList.add(c)); }
  get classList() { return this._classList; }
  get hidden() { return this._hidden; }
  set hidden(v) { this._hidden = !!v; }
  get disabled() { return !!this._disabled; }
  set disabled(v) { this._disabled = !!v; }
  get checked() { return this._checked; }
  set checked(v) { this._checked = !!v; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; this._html = ""; }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v);
    this.children = []; // rows built via innerHTML in this codebase are never queried afterward
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) this.children.splice(i, 1);
    return child;
  }
  get firstChild() { return this.children[0]; }
  addEventListener(type, handler) { (this._listeners[type] = this._listeners[type] || []).push(handler); }
  dispatch(type) { (this._listeners[type] || []).forEach((h) => h.call(this)); }
  click() { this.dispatch("click"); }
  querySelector(sel) { return queryOne(this, sel); }
  querySelectorAll(sel) { return queryAll(this, sel); }
  scrollTop = 0;
}

function matches(el, sel) {
  const dataRole = sel.match(/^\[data-role="([^"]+)"\]$/);
  if (dataRole) return el.dataset && el.dataset.role === dataRole[1];
  const inputChecked = sel.match(/^input\[name="([^"]+)"\]:checked$/);
  if (inputChecked) return el.tagName === "INPUT" && el.name === inputChecked[1] && el.checked;
  return false;
}

function queryAll(root, sel) {
  const out = [];
  (function walk(node) {
    for (const c of node.children) {
      if (matches(c, sel)) out.push(c);
      walk(c);
    }
  })(root);
  return out;
}
function queryOne(root, sel) { return queryAll(root, sel)[0] || null; }

function buildSeatEl(i) {
  const seat = new FakeElement("div");
  seat.id = "seat-" + i;
  seat.dataset.seat = String(i);
  // index.html nests these under a .seat-header div, but nesting depth doesn't
  // matter here: querySelector walks the whole subtree by data-role alone.
  const mk = (role) => { const e = new FakeElement("span"); e.dataset.role = role; seat.appendChild(e); return e; };
  ["wind", "name", "dealer", "riichi", "score", "melds", "discards", "hand"].forEach(mk);
  seat.querySelector('[data-role="dealer"]').hidden = true;
  seat.querySelector('[data-role="riichi"]').hidden = true;
  return seat;
}

function createDocument() {
  const registry = new Map();
  const body = new FakeElement("body");

  function registerTree(el) {
    if (el.id) registry.set(el.id, el);
    el.children.forEach(registerTree);
  }

  const ids = [
    "app", "screen-start", "rulesetChoice", "modeChoice", "btnStartGame", "engineWarning",
    "screen-table", "mahjongTable", "tableCenter", "roundIndicator", "honbaIndicator", "wallCount", "riichiPot",
    "doraArea", "doraTiles", "actionBar", "turnActions", "btnRiichi", "btnTsumo", "kanOptions", "callActions",
    "eventLog", "screen-gameover", "finalStandings", "btnBackToStart",
    "passDeviceOverlay", "passDeviceTitle", "btnPassReady",
    "resultOverlay", "resultTitle", "resultYaku", "resultPoints", "resultScoreChanges", "btnContinueHand",
    "drawOverlay", "drawTenpaiList", "btnContinueDraw",
  ];
  // ids that start with the `hidden` attribute in index.html (everything else
  // defaults to visible, matching the real markup)
  const startHidden = new Set([
    "engineWarning", "screen-table", "screen-gameover", "turnActions", "callActions",
    "doraArea", "passDeviceOverlay", "resultOverlay", "drawOverlay",
  ]);
  for (const id of ids) {
    const e = new FakeElement("div");
    e.id = id;
    e.hidden = startHidden.has(id);
    body.appendChild(e);
    registry.set(id, e);
  }
  for (let i = 0; i < 4; i++) {
    const seatEl = buildSeatEl(i);
    seatEl.id = "seat-" + i;
    body.appendChild(seatEl);
    registerTree(seatEl);
  }

  const rulesetRiichi = new FakeElement("input");
  rulesetRiichi.type = "radio"; rulesetRiichi.name = "ruleset"; rulesetRiichi.value = "riichi"; rulesetRiichi.checked = true;
  const rulesetClassical = new FakeElement("input");
  rulesetClassical.type = "radio"; rulesetClassical.name = "ruleset"; rulesetClassical.value = "classical";
  const modeAi = new FakeElement("input");
  modeAi.type = "radio"; modeAi.name = "mode"; modeAi.value = "ai"; modeAi.checked = true;
  const modeHotseat = new FakeElement("input");
  modeHotseat.type = "radio"; modeHotseat.name = "mode"; modeHotseat.value = "hotseat";
  body.appendChild(rulesetRiichi); body.appendChild(rulesetClassical); body.appendChild(modeAi); body.appendChild(modeHotseat);

  return {
    body,
    getElementById: (id) => registry.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    querySelector: (sel) => queryOne(body, sel),
    querySelectorAll: (sel) => queryAll(body, sel),
    _setRuleset(v) { rulesetRiichi.checked = v === "riichi"; rulesetClassical.checked = v === "classical"; },
    _setMode(v) { modeAi.checked = v === "ai"; modeHotseat.checked = v === "hotseat"; },
  };
}

module.exports = { createDocument, FakeElement };
