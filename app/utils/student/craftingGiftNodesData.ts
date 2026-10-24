// Loads the precomputed gift-producing crafting nodes (/data/craftingGiftNodes.json).
// Module-scoped promise cache: one fetch per session, shared by every call site.
import { cdn } from '~/utils/cdn';
import type { CraftingGiftNodesData } from '~/types/crafting';

let cache: Promise<CraftingGiftNodesData> | null = null;

const fetchNodes = async (): Promise<CraftingGiftNodesData> => {
  try {
    const res = await fetch(cdn('/data/craftingGiftNodes.json'));
    if (!res.ok) throw new Error(`craftingGiftNodes: ${res.status}`);
    const data: CraftingGiftNodesData = await res.json();
    return data;
  } catch (err) {
    cache = null; // allow a retry on the next mount
    throw err;
  }
};

export const loadCraftingGiftNodes = (): Promise<CraftingGiftNodesData> => {
  if (!cache) cache = fetchNodes();
  return cache;
};
