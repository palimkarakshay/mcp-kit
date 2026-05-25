/**
 * Opaque cursor encode/decode.
 *
 * A cursor is just an offset into the matched result list, but we hand the
 * model an *opaque* base64 string rather than a raw number. That keeps callers
 * from doing cursor arithmetic and lets the encoding change later without
 * breaking them — the model's only contract is "pass next_cursor back as
 * cursor". A cursor that does not decode to a valid offset is a caller error.
 */
import { invalidInput } from "@mcp-kit/core";

const PREFIX = "off:";

/** Encode a non-negative integer offset into an opaque cursor string. */
export function encodeCursor(offset: number): string {
  return Buffer.from(`${PREFIX}${offset}`, "utf8").toString("base64url");
}

/**
 * Decode a cursor back to its offset. Throws {@link invalidInput} for anything
 * that is not a cursor this server issued (malformed base64, wrong shape, or a
 * negative / non-integer offset).
 */
export function decodeCursor(cursor: string): number {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw invalidInput("Malformed cursor. Pass back a next_cursor from a previous search_records response.", {
      cursor,
    });
  }
  if (!decoded.startsWith(PREFIX)) {
    throw invalidInput("Malformed cursor. Pass back a next_cursor from a previous search_records response.", {
      cursor,
    });
  }
  const offset = Number(decoded.slice(PREFIX.length));
  if (!Number.isInteger(offset) || offset < 0) {
    throw invalidInput("Malformed cursor. Pass back a next_cursor from a previous search_records response.", {
      cursor,
    });
  }
  return offset;
}
