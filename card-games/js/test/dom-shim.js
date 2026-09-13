// Minimal hand-rolled DOM shim: just enough to load js/core/dom.js + js/app.js
// under Node and drive full games end-to-end through the real controller, to
// catch integration bugs (missing ids, bad wiring) that engine-only tests
// can't see. Deliberately NOT a general-purpose DOM - only what app.js and
// core/dom.js actually touch (no querySelector needed - app.js was written
// to avoid selector strings entirely so this shim can stay tiny).
"use strict";

class FakeClassList {
  constructor() { this._set = new Set(); }
  add(c) { this._set.add(c); }
  remove(c) { this._set.delete(c); }
  toggle(c, force) {
    const has = this._set.has(c);
    const want = force === undefined ? !has : !!force;
    if (want) this._set.add(c); else this._set.delete(c);
  }
  contains(c) { return this._set.has(c); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase();
    this.id = "";
    this.classList = new FakeClassList();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this._text = "";
    this._hidden = false;
    this._disabled = false;
    this.title = "";
    this.type = "";
    this.onclick = null;
    this._listeners = {};
  }
  get className() { return Array.from(this.classList._set).join(" "); }
  set className(v) {
    this.classList._set.clear();
    String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
  }
  get hidden() { return this._hidden; }
  set hidden(v) { this._hidden = !!v; }
  get disabled() { return this._disabled; }
  set disabled(v) { this._disabled = !!v; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  set innerHTML(v) { if (v !== "") throw new Error("shim only supports innerHTML = \"\" (clear)"); this.children = []; this._text = ""; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  addEventListener(type, handler) { (this._listeners[type] = this._listeners[type] || []).push(handler); }
  click() {
    (this._listeners.click || []).forEach((h) => h.call(this));
    if (this.onclick) this.onclick();
  }
}

const ELEMENT_IDS = [
  "gameGrid", "seatSetup", "seatRows", "startBtn", "startWarning",
  "screen-start", "screen-table",
  "tableTitle", "tableStatus", "btnBackToLobby", "tableWrap", "actionBar", "logPanel",
  "suitModal", "suitBtnC", "suitBtnD", "suitBtnH", "suitBtnS",
  "interstitialOverlay", "interstitialTitle", "btnInterstitialReady",
  "resultOverlay", "standingsList", "btnPlayAgain", "btnResultLobby",
];
const START_HIDDEN = new Set(["suitModal", "interstitialOverlay", "resultOverlay"]);

function createDocument() {
  const registry = new Map();
  const domReadyHandlers = [];

  for (const id of ELEMENT_IDS) {
    const e = new FakeElement(id === "startBtn" || id.startsWith("btn") || id.startsWith("suitBtn") ? "button" : "div");
    e.id = id;
    e.hidden = START_HIDDEN.has(id);
    registry.set(id, e);
  }
  const tableWrap = registry.get("tableWrap");
  const feltTable = new FakeElement("div");
  feltTable.id = "feltTable";
  tableWrap.appendChild(feltTable);
  registry.set("feltTable", feltTable);

  return {
    getElementById: (id) => registry.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    addEventListener: (type, handler) => { if (type === "DOMContentLoaded") domReadyHandlers.push(handler); },
    _fireDOMContentLoaded: () => domReadyHandlers.forEach((h) => h()),
  };
}

module.exports = { createDocument, FakeElement };
