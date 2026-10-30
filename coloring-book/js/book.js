// Fill state for Buku Mewarnai: which region has which crayon color, with undo. Every function
// returns a new state instead of changing the one it was given. Framework-agnostic (no DOM).
(function (root) {
  "use strict";

  const MAX_HISTORY = 100;

  function createState(fills) {
    return Object.freeze({ fills: Object.freeze(Object.assign({}, fills)), history: Object.freeze([]) });
  }

  function withHistory(state, fills, entry) {
    const history = state.history.concat([Object.freeze(entry)]).slice(-MAX_HISTORY);
    return Object.freeze({ fills: Object.freeze(fills), history: Object.freeze(history) });
  }

  function paint(state, regionId, color) {
    const before = state.fills[regionId] || null;
    if (before === color) return state;
    return withHistory(state, Object.assign({}, state.fills, { [regionId]: color }), { regionId, before });
  }

  // Undo brings the whole picture back, so an accidental clear costs nothing.
  function clear(state) {
    if (Object.keys(state.fills).length === 0) return state;
    return withHistory(state, {}, { cleared: state.fills });
  }

  function undo(state) {
    const last = state.history[state.history.length - 1];
    if (!last) return state;
    const history = Object.freeze(state.history.slice(0, -1));
    if (last.cleared) return Object.freeze({ fills: Object.freeze(Object.assign({}, last.cleared)), history });
    const fills = Object.assign({}, state.fills);
    if (last.before === null) delete fills[last.regionId];
    else fills[last.regionId] = last.before;
    return Object.freeze({ fills: Object.freeze(fills), history });
  }

  // Saved fills from localStorage, keeping only regions the picture has and colors the
  // palette still offers.
  function sanitizeFills(raw, regionIds, colorIds) {
    const fills = {};
    if (!raw || typeof raw !== "object") return fills;
    const regions = new Set(regionIds);
    const colors = new Set(colorIds);
    for (const [region, color] of Object.entries(raw)) {
      if (regions.has(region) && colors.has(color)) fills[region] = color;
    }
    return fills;
  }

  function coloredShare(fills, regionIds) {
    if (regionIds.length === 0) return 0;
    return regionIds.filter((id) => fills[id]).length / regionIds.length;
  }

  const api = { MAX_HISTORY, createState, paint, clear, undo, sanitizeFills, coloredShare };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BOOK = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
