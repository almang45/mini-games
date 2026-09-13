// Riichi point calculation: han/fu -> base points -> payments. Formula-based
// (not a hardcoded table), matching standard competitive rules.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MJ = Object.assign(root.MJ || {}, { scoreRiichi: factory() });
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function round100(n) { return Math.ceil(n / 100) * 100; }

  // base points before the dealer/non-dealer multiplier
  function basePoints(han, fu) {
    if (han >= 13) return 8000 * Math.round(han / 13); // (multiple) yakuman
    if (han >= 11) return 6000; // sanbaiman
    if (han >= 8) return 4000;  // baiman
    if (han >= 6) return 3000;  // haneman
    if (han >= 5) return 2000;  // mangan
    const base = fu * Math.pow(2, 2 + han);
    return Math.min(base, 2000); // capped at mangan even below han 5 ("kiriage" not applied)
  }

  // returns { total, payments: { dealerPays?, eachNonDealerPays?, discarderPays? } }
  function computeScore(han, fu, isDealer, winBy) {
    const base = basePoints(han, fu);
    if (winBy === "tsumo") {
      if (isDealer) {
        const each = round100(base * 2);
        return { total: each * 3, payments: { eachPays: each } };
      }
      const dealerPays = round100(base * 2);
      const eachPays = round100(base * 1);
      return { total: dealerPays + eachPays * 2, payments: { dealerPays, eachPays } };
    }
    // ron
    const multiplier = isDealer ? 6 : 4;
    const discarderPays = round100(base * multiplier);
    return { total: discarderPays, payments: { discarderPays } };
  }

  function limitName(han) {
    if (han >= 13) return han >= 26 ? "Double Yakuman" : "Yakuman";
    if (han >= 11) return "Sanbaiman";
    if (han >= 8) return "Baiman";
    if (han >= 6) return "Haneman";
    if (han >= 5) return "Mangan";
    return null;
  }

  return { basePoints, computeScore, limitName, round100 };
});
