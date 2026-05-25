/**
 * The starter's one example tool.
 *
 * It is deliberately small but shows every habit the rest of the kit relies
 * on: a verb-first name, a description that says when to use it *and* what it
 * will not do, fully-described parameters, worked examples, an output schema,
 * read-only annotations, structured-error failure — and **no credentials in
 * the input** (the time zone is data, not a secret).
 */
import { z } from "zod";

import { invalidInput } from "../errors.js";
import { defineTool } from "../tool.js";

export const getCurrentTime = defineTool({
  name: "get_current_time",
  title: "Get current time",
  description:
    "Return the current date and time in a given IANA time zone. " +
    "Use this when you need the wall-clock time right now — to timestamp an action, work out what 'today' is, " +
    "or render a local time for the user. " +
    "It does not parse or convert arbitrary timestamps you already have, do date arithmetic, or schedule anything in the future; " +
    "it only reports the present instant. " +
    'Example: get_current_time({ "timezone": "Asia/Tokyo", "format": "human" }).',
  inputSchema: {
    timezone: z
      .string()
      .describe(
        'IANA time-zone name such as "America/New_York" or "Asia/Kolkata". A numeric offset like "+05:30" is not accepted. Defaults to "UTC".',
      )
      .default("UTC"),
    format: z
      .enum(["iso", "human"])
      .describe(
        'How to render localTime: "iso" gives a sortable "YYYY-MM-DD HH:mm:ss" form, "human" gives a long readable form. Defaults to "iso".',
      )
      .default("iso"),
  },
  outputSchema: {
    timezone: z.string().describe("The IANA zone the time was rendered in."),
    localTime: z.string().describe("Wall-clock time in that zone, per the requested format."),
    utcIso: z.string().describe("The same instant as an ISO-8601 UTC string."),
    unixMs: z.number().describe("Milliseconds since the Unix epoch."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
  examples: [
    { description: "Current time in UTC, ISO style (the defaults).", arguments: {} },
    {
      description: "Current time in Tokyo, human-readable.",
      arguments: { timezone: "Asia/Tokyo", format: "human" },
    },
  ],
  handler: (args) => {
    const { timezone, format } = args;
    const now = new Date();

    let localTime: string;
    try {
      localTime =
        format === "human"
          ? new Intl.DateTimeFormat("en-US", {
              dateStyle: "full",
              timeStyle: "long",
              timeZone: timezone,
            }).format(now)
          : // "sv-SE" renders an ISO-like "YYYY-MM-DD HH:mm:ss".
            now.toLocaleString("sv-SE", { timeZone: timezone });
    } catch {
      throw invalidInput(`Unknown IANA time zone: "${timezone}".`, { timezone });
    }

    const payload = {
      timezone,
      localTime,
      utcIso: now.toISOString(),
      unixMs: now.getTime(),
    };
    return {
      content: [{ type: "text", text: `${payload.localTime} (${timezone})` }],
      structuredContent: payload,
    };
  },
});
