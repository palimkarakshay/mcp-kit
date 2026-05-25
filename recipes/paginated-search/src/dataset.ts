/**
 * A fixed, in-memory product catalog — the sample data the pagination recipe
 * pages over. ~50 fictional products so a default page (20) leaves several
 * pages to walk. The order here is the stable, deterministic order the cursor
 * indexes into; nothing re-sorts it.
 */

/** One catalog record. */
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  /** Units on hand. */
  stock: number;
}

/** Categories used across the catalog (handy for `category` filtering). */
export const CATEGORIES = ["audio", "computing", "wearable", "home", "camera"] as const;

/** The catalog. Insertion order is the pagination order. */
export const PRODUCTS: readonly Product[] = [
  { id: "p001", name: "Aurora Wireless Headphones", category: "audio", price: 199, stock: 42 },
  { id: "p002", name: "Aurora Earbuds Pro", category: "audio", price: 149, stock: 88 },
  { id: "p003", name: "Boreal Bookshelf Speaker", category: "audio", price: 129, stock: 17 },
  { id: "p004", name: "Boreal Soundbar 5.1", category: "audio", price: 349, stock: 9 },
  { id: "p005", name: "Cobalt Studio Microphone", category: "audio", price: 89, stock: 51 },
  { id: "p006", name: "Cobalt USB Audio Interface", category: "audio", price: 119, stock: 23 },
  { id: "p007", name: "Drift Portable Speaker", category: "audio", price: 59, stock: 134 },
  { id: "p008", name: "Drift Turntable", category: "audio", price: 229, stock: 6 },
  { id: "p009", name: "Ember Laptop 14", category: "computing", price: 1299, stock: 14 },
  { id: "p010", name: "Ember Laptop 16 Pro", category: "computing", price: 1899, stock: 8 },
  { id: "p011", name: "Fjord Mini Desktop", category: "computing", price: 699, stock: 21 },
  { id: "p012", name: "Fjord Tower Workstation", category: "computing", price: 2499, stock: 4 },
  { id: "p013", name: "Glacier Mechanical Keyboard", category: "computing", price: 129, stock: 63 },
  { id: "p014", name: "Glacier Ergo Mouse", category: "computing", price: 79, stock: 97 },
  { id: "p015", name: "Halcyon 27 Monitor", category: "computing", price: 329, stock: 19 },
  { id: "p016", name: "Halcyon 34 Ultrawide", category: "computing", price: 749, stock: 11 },
  { id: "p017", name: "Iris Docking Station", category: "computing", price: 189, stock: 33 },
  { id: "p018", name: "Iris USB-C Hub", category: "computing", price: 49, stock: 142 },
  { id: "p019", name: "Juniper Smartwatch", category: "wearable", price: 249, stock: 27 },
  { id: "p020", name: "Juniper Fitness Band", category: "wearable", price: 99, stock: 110 },
  { id: "p021", name: "Kestrel Sport Watch", category: "wearable", price: 179, stock: 38 },
  { id: "p022", name: "Kestrel Sleep Ring", category: "wearable", price: 299, stock: 15 },
  { id: "p023", name: "Lumen AR Glasses", category: "wearable", price: 499, stock: 7 },
  { id: "p024", name: "Lumen Heart Monitor", category: "wearable", price: 129, stock: 44 },
  { id: "p025", name: "Mistral Smart Thermostat", category: "home", price: 159, stock: 56 },
  { id: "p026", name: "Mistral Air Purifier", category: "home", price: 219, stock: 22 },
  { id: "p027", name: "Nimbus Smart Bulb 4-Pack", category: "home", price: 39, stock: 188 },
  { id: "p028", name: "Nimbus Smart Plug", category: "home", price: 19, stock: 240 },
  { id: "p029", name: "Onyx Robot Vacuum", category: "home", price: 399, stock: 13 },
  { id: "p030", name: "Onyx Cordless Vacuum", category: "home", price: 249, stock: 29 },
  { id: "p031", name: "Pioneer Video Doorbell", category: "home", price: 149, stock: 47 },
  { id: "p032", name: "Pioneer Indoor Camera", category: "home", price: 69, stock: 92 },
  { id: "p033", name: "Quartz Espresso Machine", category: "home", price: 449, stock: 10 },
  { id: "p034", name: "Quartz Electric Kettle", category: "home", price: 59, stock: 76 },
  { id: "p035", name: "Riley Mirrorless Camera", category: "camera", price: 1099, stock: 12 },
  { id: "p036", name: "Riley Action Camera", category: "camera", price: 299, stock: 34 },
  { id: "p037", name: "Solstice 50mm Lens", category: "camera", price: 399, stock: 18 },
  { id: "p038", name: "Solstice 24-70mm Zoom Lens", category: "camera", price: 899, stock: 6 },
  { id: "p039", name: "Tundra Carbon Tripod", category: "camera", price: 179, stock: 41 },
  { id: "p040", name: "Tundra Camera Backpack", category: "camera", price: 129, stock: 58 },
  { id: "p041", name: "Umbra Studio Light", category: "camera", price: 149, stock: 25 },
  { id: "p042", name: "Umbra Ring Light", category: "camera", price: 79, stock: 83 },
  { id: "p043", name: "Vega Drone 4K", category: "camera", price: 799, stock: 9 },
  { id: "p044", name: "Vega Gimbal Stabilizer", category: "camera", price: 159, stock: 31 },
  { id: "p045", name: "Willow Noise-Cancelling Headphones", category: "audio", price: 279, stock: 20 },
  { id: "p046", name: "Willow Conference Speakerphone", category: "audio", price: 199, stock: 16 },
  { id: "p047", name: "Xenon Gaming Headset", category: "audio", price: 109, stock: 64 },
  { id: "p048", name: "Xenon Stream Deck", category: "computing", price: 149, stock: 37 },
  { id: "p049", name: "Yarrow E-Reader", category: "computing", price: 139, stock: 49 },
  { id: "p050", name: "Zephyr Tablet 11", category: "computing", price: 599, stock: 26 },
];
