import { CODE_ALPHABET, CODE_LENGTH } from "./protocol.js";

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// 32 symbols divide 256 evenly, so masking a random byte keeps every symbol equally likely.
export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b & 31]).join("");
}

// 128 bits: a seat token is the only thing that proves a reconnecting socket owns its seat.
export function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}
