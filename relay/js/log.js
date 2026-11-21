// One JSON object per line: Workers Logs indexes each field, so events can be queried by room or reason.
const CONSOLE = { error: console.error, warn: console.warn, info: console.log, debug: console.debug };

export const logger = {
  write(level, line) {
    (CONSOLE[level] || console.log)(line);
  },
};

export function log(level, event, fields = {}) {
  logger.write(level, JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields }));
}
