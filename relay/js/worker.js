// Entry point of the mini-games relay Worker (see relay/README.md).
import { handle } from "./router.js";
import { json } from "./http.js";
import { log } from "./log.js";

export { Room } from "./room.js";

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      log("error", "unhandled", { path: new URL(request.url).pathname, error: String((error && error.stack) || error) });
      return json({ error: "internal" }, 500);
    }
  },
};
