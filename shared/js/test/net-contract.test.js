// The browser client and the relay Worker ship separately (Pages vs Cloudflare), so the wire
// constants they share are copied, not imported. This keeps the copies identical.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const client = require("../../net/relay-client.js");

(async () => {
  const relay = await import(pathToFileURL(path.join(__dirname, "../../../relay/js/protocol.js")).href);
  let passed = 0;
  const same = (label, a, b) => {
    assert.deepStrictEqual(a, b, label);
    passed++;
  };
  same("protocol version", client.PROTOCOL_VERSION, relay.PROTOCOL_VERSION);
  assert.ok(relay.SUPPORTED_VERSIONS.includes(client.PROTOCOL_VERSION), "the relay accepts the client's version");
  passed++;
  same("close codes", { ...client.CLOSE }, { ...relay.CLOSE });
  same("code pattern", client.CODE_PATTERN.source, relay.CODE_PATTERN.source);
  same("code length", client.CODE_LENGTH, relay.CODE_LENGTH);
  same("ping frame", client.PING, relay.PING);
  for (const ch of relay.CODE_ALPHABET) {
    assert.ok(client.CODE_PATTERN.test(ch.repeat(relay.CODE_LENGTH)), "alphabet symbol " + ch + " passes the client pattern");
    passed++;
  }
  console.log("net contract: " + passed + " checks passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
