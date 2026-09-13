// Loads the real index.html script bundle (tiles/hand/yaku/score/game/ai/ui) into a
// vm sandbox against a minimal hand-rolled DOM (js/test/dom-shim.js), then drives the
// actual "You vs 3 AI" flow via the real btnStartGame click handler and lets the AI
// play a hand out through the real js/ui.js control loop. This is the only test that
// exercises js/ui.js itself (the unit tests below it never touch the DOM).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const { createDocument } = require("./dom-shim.js");

const JS_DIR = path.join(__dirname, "..");
const SCRIPTS = ["tiles.js", "hand.js", "yaku-riichi.js", "score-riichi.js", "score-classical.js", "game.js", "ai.js", "ui.js"];

// Simulates whatever a human sitting at the keyboard would click next: Tsumo
// when available, else the first legal/selectable hand tile to discard; Ron
// when offered in a call panel else Pass; "Ready" on the pass-device
// interstitial; "Continue" on a hand-result/draw modal. Returns true if it
// clicked something (so the poller knows progress is still being made).
function driveHumanIfNeeded(document) {
  const passOverlay = document.getElementById("passDeviceOverlay");
  if (!passOverlay.hidden) { document.getElementById("btnPassReady").click(); return true; }

  const resultOverlay = document.getElementById("resultOverlay");
  if (!resultOverlay.hidden) { document.getElementById("btnContinueHand").click(); return true; }

  const drawOverlay = document.getElementById("drawOverlay");
  if (!drawOverlay.hidden) { document.getElementById("btnContinueDraw").click(); return true; }

  const turnActions = document.getElementById("turnActions");
  if (!turnActions.hidden) {
    const btnTsumo = document.getElementById("btnTsumo");
    if (!btnTsumo.disabled) { btnTsumo.click(); return true; }
    for (let i = 0; i < 4; i++) {
      const handEl = document.getElementById("seat-" + i).querySelector('[data-role="hand"]');
      const selectable = handEl.children.find((c) => c.classList.contains("selectable"));
      if (selectable) { selectable.click(); return true; }
    }
  }

  const callActions = document.getElementById("callActions");
  if (!callActions.hidden) {
    const panel = callActions.children[0];
    if (panel) {
      const ronBtn = panel.children.find((c) => c.textContent === "Ron");
      const passBtn = panel.children.find((c) => c.textContent === "Pass");
      if (ronBtn) { ronBtn.click(); return true; }
      if (passBtn) { passBtn.click(); return true; }
    }
  }
  return false;
}

function runOneScenario(ruleset, mode, onDone) {
  const document = createDocument();
  document._setRuleset(ruleset);
  document._setMode(mode);

  const sandbox = {
    console,
    document,
    setTimeout: (fn) => setTimeout(fn, 0), // collapse the 550ms AI pacing delay for the test
    clearTimeout,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  for (const file of SCRIPTS) {
    const code = fs.readFileSync(path.join(JS_DIR, file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  }

  assert.ok(sandbox.MJ && sandbox.MJ.game && sandbox.MJ.ai, "MJ.game/MJ.ai attached to window after loading all scripts");
  assert.strictEqual(document.getElementById("engineWarning").hidden, true, "no engine-missing warning once everything is loaded");

  document.getElementById("btnStartGame").click();

  const start = Date.now();
  const HARD_TIMEOUT_MS = 15000;
  function poll() {
    driveHumanIfNeeded(document);
    const gameOverShown = document.getElementById("screen-gameover").hidden === false;
    const stuck = Date.now() - start > HARD_TIMEOUT_MS;
    if (gameOverShown) {
      onDone(null, { document });
    } else if (stuck) {
      const logBox = document.getElementById("eventLog");
      const lastFew = logBox.children.slice(-5).map((c) => c.textContent);
      console.error("DEBUG: eventLog entries so far =", logBox.children.length, "last 5:", lastFew);
      onDone(new Error("UI-driven game did not reach game-over within " + HARD_TIMEOUT_MS + "ms"), { document });
    } else {
      setImmediate(poll); // as fast as the event loop allows, no artificial pacing
    }
  }
  poll();
}

let passed = 0;
function ok(label, cond) { assert.ok(cond, label); passed++; }

function runAndAssert(ruleset, mode, next) {
  runOneScenario(ruleset, mode, (err, ctx) => {
    if (err) { console.error("FAIL:", ruleset, mode, err.message); process.exitCode = 1; next(); return; }
    ok(ruleset + "/" + mode + ": reached game-over without throwing", true);
    const standings = ctx.document.getElementById("finalStandings");
    ok(ruleset + "/" + mode + ": final standings rendered for all 4 seats", standings.children.length === 4);
    const log = ctx.document.getElementById("eventLog");
    ok(ruleset + "/" + mode + ": event log has entries", log.children.length > 0);
    next();
  });
}

runAndAssert("riichi", "ai", () => {
  runAndAssert("classical", "ai", () => {
    runAndAssert("riichi", "hotseat", () => {
      console.log("ui-integration.test.js: " + passed + " assertions passed");
      if (process.exitCode) process.exit(process.exitCode);
    });
  });
});
