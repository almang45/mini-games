// The one truly-identical primitive shared by every project's hand-rolled
// DOM shim (js/test/dom-shim.js): a minimal classList implementation backed
// by a Set. Everything else in each shim (FakeElement, createDocument) is
// intentionally project-specific and stays local - only this class was
// byte-for-byte duplicated, so a fix here (e.g. a toggle() edge case) can't
// silently drift out of sync between projects.
"use strict";

// Like the browser's DOMTokenList: add/remove take any number of tokens, and
// an empty token or one containing whitespace throws instead of being stored
// (a browser rejects classList.add("a b"); a shim that accepted it let that
// bug pass every Node test).
function check(c) {
  if (c === "") throw new SyntaxError("classList token must not be empty");
  if (/\s/.test(c)) throw new Error("classList token '" + c + "' contains whitespace (InvalidCharacterError in a browser)");
}

class FakeClassList {
  constructor() { this._set = new Set(); }
  add(...cs) { cs.forEach(check); cs.forEach((c) => this._set.add(c)); }
  remove(...cs) { cs.forEach(check); cs.forEach((c) => this._set.delete(c)); }
  toggle(c, force) {
    check(c);
    const has = this._set.has(c);
    const want = force === undefined ? !has : !!force;
    if (want) this._set.add(c); else this._set.delete(c);
  }
  contains(c) { return this._set.has(c); }
  toString() { return Array.from(this._set).join(" "); }
}

module.exports = { FakeClassList };
