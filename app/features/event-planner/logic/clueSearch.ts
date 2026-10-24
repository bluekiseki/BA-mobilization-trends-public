import type { ClueSearchData } from '~/types/plannerData';

export interface ClueSearchCostModel {
  costKey: string;
  costPerSearch: number;
  inspirationConvertCount: number;
}

// Search-based clue events (e.g. 863) buy random fragments with event currency instead of
// purchasing specific fragments from the shop. Leftover fragments are swappable 1:1 through the
// event shop token, so only the total fragment count matters.
export function getClueSearchCostModel(clue: ClueSearchData): ClueSearchCostModel | null {
  const info = clue.info[0];
  const goods = info?.SearchCostGoods;
  if (!info?.SearchCostGoodsId || !goods || goods.ConsumeParcelId.length === 0) return null;
  return {
    costKey: `${goods.ConsumeParcelTypeStr[0]}_${goods.ConsumeParcelId[0]}`,
    costPerSearch: goods.ConsumeParcelAmount[0],
    inspirationConvertCount: info.InspirationConvertCount ?? 0,
  };
}

// Minimum searches to collect `fragments`: every search yields one fragment plus one deduction
// point, and every `inspirationConvertCount` points become an inspiration worth one more fragment.
export function searchesForFragments(fragments: number, inspirationConvertCount: number): number {
  if (fragments <= 0) return 0;
  if (inspirationConvertCount <= 0) return fragments;
  let searches = Math.floor((fragments * inspirationConvertCount) / (inspirationConvertCount + 1));
  while (searches + Math.floor(searches / inspirationConvertCount) < fragments) searches++;
  return searches;
}
