/**
 * The starter's tool registry. The `*.tools.ts` filename and the exported
 * `tools` array are the convention the tool-description lint discovers.
 */
import type { AnyToolSpec } from "./tool.js";
import { getCurrentTime } from "./tools/get-current-time.js";

export const tools: AnyToolSpec[] = [getCurrentTime];
