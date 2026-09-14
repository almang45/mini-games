// Registers the site-wide service worker (../sw.js) so any page opened once keeps working
// offline. Service workers need http(s), so opening files straight from disk skips this.
(function () {
  "use strict";
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  const workerUrl = new URL("../sw.js", document.currentScript.src);

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(workerUrl)
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // On a first visit this page loaded before the worker could see it, so pass those files on.
        const urls = [location.href].concat(performance.getEntriesByType("resource").map((entry) => entry.name));
        registration.active.postMessage({ type: "cache-urls", urls });
      })
      .catch((error) => console.warn("Offline play is unavailable:", error));
  });
})();
