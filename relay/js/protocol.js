// Wire protocol of the online-play relay. shared/net/relay-client.js mirrors these values for
// the browser, and shared/js/test/net-contract.test.js fails if the two drift apart.

export const PROTOCOL_VERSION = 1;
// Pages and the Worker deploy separately, so keep accepting the previous version for one release.
export const SUPPORTED_VERSIONS = Object.freeze([1]);

export const MAX_MESSAGE_CHARS = 32 * 1024;
export const MAX_TOKEN_CHARS = 64;
export const MIN_SEATS = 2;
export const MAX_SEATS = 4;

// No 0/O or 1/I, so a code read aloud or off a small screen can't be misread.
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5}$/;
export const GAME_PATTERN = /^[a-z0-9-]{1,32}$/;

// Exact frames: the runtime answers PING with PONG itself, without waking the room.
export const PING = '{"t":"ping"}';
export const PONG = '{"t":"pong"}';

export const CLOSE = Object.freeze({
  BAD_MESSAGE: 4000,
  HELLO_TIMEOUT: 4001,
  FORBIDDEN: 4003,
  ROOM_GONE: 4004,
  WRONG_GAME: 4005,
  STALE: 4007,
  RATE_LIMITED: 4008,
  ROOM_FULL: 4009,
  REPLACED: 4010,
  LEFT: 4011,
  TOO_LARGE: 4013,
  VERSION: 4026,
});
