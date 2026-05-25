/**
 * Paginated-search tools — the cursor-pagination half of the cookbook.
 *
 * `search_records` returns exactly *one page* of a fixed product catalog plus
 * an opaque `next_cursor`; the model fetches the next page by passing that
 * value straight back as `cursor`. `get_record` fetches a single item by id.
 *
 * The dataset is static and importing this module touches no network, so the
 * lint can load it freely.
 */
import { type AnyToolSpec, defineTool, notFound, toolResult } from "@mcp-kit/core";
import { z } from "zod";

import { decodeCursor, encodeCursor } from "./cursor.js";
import { CATEGORIES, PRODUCTS, type Product } from "./dataset.js";

function matches(product: Product, query: string | undefined, category: string | undefined): boolean {
  if (category && product.category !== category) return false;
  if (query) {
    const q = query.toLowerCase();
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

const searchRecords = defineTool({
  name: "search_records",
  title: "Search the product catalog (paginated)",
  description:
    "Search a fixed catalog of products and return ONE page of matches, using cursor-based pagination. " +
    "Use this when you want to browse or filter the catalog by a name/category substring and walk the results a " +
    "page at a time: call it first without a cursor, then to get the next page pass the next_cursor value from " +
    "the previous response back in as cursor. Keep going until next_cursor is null (has_more is false). " +
    "It returns a single page, never the whole catalog at once, and it does NOT fuzzy-match, rank by relevance, " +
    "or sort by arbitrary fields — matching is a plain case-insensitive substring over name and category and the " +
    "order is fixed. To fetch one known item by id use get_record instead. " +
    'Example: search_records({ "query": "laptop", "limit": 10 }).',
  inputSchema: {
    query: z
      .string()
      .optional()
      .describe("Optional case-insensitive substring matched against a product's name and category. Omit to match all."),
    category: z
      .enum(CATEGORIES)
      .optional()
      .describe('Optional exact category filter, e.g. "computing". One of: audio, computing, wearable, home, camera.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .describe("Maximum number of items to return on this page (1–100). Defaults to 20.")
      .default(20),
    cursor: z
      .string()
      .optional()
      .describe("Opaque pagination cursor: pass the next_cursor from the previous response to fetch the next page. Omit for the first page."),
  },
  outputSchema: {
    items: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          category: z.string(),
          price: z.number(),
          stock: z.number(),
        }),
      )
      .describe("The page of matching products."),
    next_cursor: z
      .string()
      .nullable()
      .describe("Cursor for the next page, or null when this is the last page. Pass it back as cursor."),
    has_more: z.boolean().describe("True if more pages remain after this one."),
    total_matched: z.number().describe("Total number of products matching the filters across all pages."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
  examples: [
    { description: "First page of all products, default page size.", arguments: {} },
    { description: "Search laptops, 10 per page.", arguments: { query: "laptop", limit: 10 } },
    { description: "Second page, using a cursor from a previous response.", arguments: { cursor: "b2ZmOjIw" } },
  ],
  handler: (args) => {
    const offset = args.cursor === undefined ? 0 : decodeCursor(args.cursor);
    const matched = PRODUCTS.filter((p) => matches(p, args.query, args.category));
    const items = matched.slice(offset, offset + args.limit);
    const nextOffset = offset + items.length;
    const hasMore = nextOffset < matched.length;
    const nextCursor = hasMore ? encodeCursor(nextOffset) : null;
    return toolResult(
      `${items.length} of ${matched.length} match(es)${hasMore ? " (more pages available)" : ""}.`,
      {
        items,
        next_cursor: nextCursor,
        has_more: hasMore,
        total_matched: matched.length,
      },
    );
  },
});

const getRecord = defineTool({
  name: "get_record",
  title: "Get one product by id",
  description:
    "Fetch a single product from the catalog by its exact id. " +
    "Use this when you already know the id — for example one returned by search_records — and want that one " +
    "record's full details. " +
    "It does not search, filter, or page; it looks up exactly one id and errors if there is no such product. To " +
    "find ids in the first place, use search_records instead. " +
    'Example: get_record({ "id": "p009" }).',
  inputSchema: {
    id: z.string().min(1).describe('The exact product id to fetch, e.g. "p009", as returned by search_records.'),
  },
  outputSchema: {
    id: z.string().describe("The product id."),
    name: z.string().describe("Product name."),
    category: z.string().describe("Product category."),
    price: z.number().describe("Price in whole currency units."),
    stock: z.number().describe("Units currently in stock."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
  examples: [{ description: "Look up the Ember Laptop 14.", arguments: { id: "p009" } }],
  handler: (args) => {
    const product = PRODUCTS.find((p) => p.id === args.id);
    if (!product) throw notFound(`No product with id "${args.id}".`, { id: args.id });
    return toolResult(`${product.name} (${product.category}) — $${product.price}, ${product.stock} in stock.`, product);
  },
});

export const tools: AnyToolSpec[] = [searchRecords, getRecord];
