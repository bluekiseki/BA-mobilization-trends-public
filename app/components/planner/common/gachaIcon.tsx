import type { EventData, GachaElement, IconData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';

// Define expected content structure for the recursive calculation result
interface FinalExpectedContent {
  expectedAmount: number;
  itemInfo: any; // Type this more strictly if possible (IconInfo)
  iconSrc: string | undefined;
  type: string;
  id: string;
  rarity: number;
}

// Recursive function to calculate final expected items
export const calculateExpectedContents = (
  groupId: string | number,
  groupAmount: number, // How many times this specific group is opened
  eventDataIcons: EventData['icons'],
  iconData: IconData,
  locale: Locale,
  depth = 0, // Depth counter to prevent infinite loops
): Record<string, FinalExpectedContent> => {
  const finalContents: Record<string, FinalExpectedContent> = {};
  if (depth > 10) {
    // Safety break for deep recursion
    console.warn('Reached recursion depth limit for GachaGroup:', groupId);
    return finalContents;
  }

  const gachaInfo = eventDataIcons.GachaGroup?.[String(groupId)];
  if (!gachaInfo) return finalContents;

  const elements: GachaElement[] = gachaInfo.GachaElement || gachaInfo.GachaElementRecursive || [];
  const isRecursive = gachaInfo.IsRecursive;

  // Calculate total probability for non-recursive groups to normalize
  const totalProb = !isRecursive ? elements.reduce((sum, el) => sum + el.Prob, 0) : 0;

  elements.forEach((el) => {
    const containedItemId = el.ParcelId.toString();
    const containedItemType = el.ParcelTypeStr;
    const probability = totalProb > 0 ? el.Prob / totalProb : 1 / elements.length; // Assume equal prob if totalProb is 0 (e.g., recursive)

    // Expected amount/count *for this specific element* within one open of the current group
    const expectedAmountPerOpen = (el.ParcelAmountMin + el.ParcelAmountMax) / 2;
    // How many times this element is expected *in total* given the groupAmount
    const totalExpectedCount = groupAmount * probability;

    if (containedItemType === 'GachaGroup') {
      // Recursive step: Calculate contents of the nested group
      const nestedContents = calculateExpectedContents(
        containedItemId,
        totalExpectedCount * expectedAmountPerOpen, // Pass the expected number of times the subgroup is opened
        eventDataIcons,
        iconData,
        locale,
        depth + 1,
      );
      // Merge results
      for (const key in nestedContents) {
        if (finalContents[key]) {
          finalContents[key].expectedAmount += nestedContents[key].expectedAmount;
        } else {
          finalContents[key] = nestedContents[key];
        }
      }
    } else {
      // Base case: This is a final item (Item, Currency, etc.)
      const itemKey = `${containedItemType}_${containedItemId}`;
      const containedItemInfo = (eventDataIcons as any)[containedItemType]?.[containedItemId];
      const containedIconSrc = (iconData as any)[containedItemType]?.[containedItemId];
      const finalExpectedAmount = totalExpectedCount * expectedAmountPerOpen;

      if (finalExpectedAmount > 0) {
        if (finalContents[itemKey]) {
          finalContents[itemKey].expectedAmount += finalExpectedAmount;
        } else {
          finalContents[itemKey] = {
            expectedAmount: finalExpectedAmount,
            itemInfo: containedItemInfo,
            iconSrc: containedIconSrc,
            type: containedItemType,
            id: containedItemId,
            rarity: containedItemInfo?.Rarity ?? 0,
          };
        }
      }
    }
  });

  return finalContents;
};
