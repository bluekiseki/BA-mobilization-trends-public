// Cafe crafting nodes that can produce gift items, precomputed from SchaleDB's
// crafting.min.json + groups.min.json by scripts/build-crafting-gift-nodes.mjs.
// Served as a static asset at /data/craftingGiftNodes.json.

export interface CraftingGiftNodeGift {
  itemId: number;
  /** Expected number of this gift produced by one craft of the node. */
  expectedCount: number;
}

export interface CraftingGiftNode {
  nodeId: number;
  tier: number;
  quality: number;
  /** [jp, global, cn] release flags. */
  released: [boolean, boolean, boolean];
  /** Probability the node is among the 5 nodes offered per craft (SchaleDB-precomputed). */
  chance: { jp: number; global: number };
  /** Draw weight (Property) normalized to the tier mean — for the exact best-pick integral. */
  weight: number;
  /** True when the node yields a small, specific gift set (<= 6) rather than a random pool. */
  targeted: boolean;
  name: Record<'en' | 'ko' | 'ja' | 'zh_Hant', string>;
  gifts: CraftingGiftNodeGift[];
  /** Present only when the global server's drop table differs from jp. */
  giftsGlobal?: CraftingGiftNodeGift[];
}

export interface CraftingGiftNodesData {
  nodes: CraftingGiftNode[];
  /** Per tier ("1"/"2"/"3"): normalized draw weights of every NON-gift node in that tier. */
  tierOtherWeights: Record<string, number[]>;
}
