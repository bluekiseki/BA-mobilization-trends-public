// ----------------------------------------------------------------------
// Logic: Monte Carlo Simulation
// ----------------------------------------------------------------------

function shuffleArray(array: number[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
export const simulateAverageFlips = (simCount: number, maxOpenCount: number): number => {
  let totalFlips = 0;

  for (let i = 0; i < simCount; i++) {
    // 1. Initialize deck (2 copies each of cards 0-5, total 12)
    const deck = new Array<number>(12);
    for (let j = 0; j < 6; j++) {
      deck[j * 2] = j;
      deck[j * 2 + 1] = j;
    }
    shuffleArray(deck);

    // 2. State variables
    const knownLocations: Record<number, number> = {};
    const pendingMatches: number[] = [];
    const unknownPool = Array.from({ length: 12 }, (_, k) => k);

    let attempts = 0;
    let matchedPairs = 0;

    while (matchedPairs < 6 && attempts < maxOpenCount) {
      attempts++;

      // Guaranteed match (if pair is already known)
      if (pendingMatches.length > 0) {
        pendingMatches.pop();
        matchedPairs++;
        continue;
      }

      // Optimization strategy (when 4 cards remain)
      // Condition: 2 unknown cards, 2 known cards (halves of different pairs)
      // Explanation: If you flip the 2 unknowns, they are 100% different (since remaining are A, B).
      //      However, if you flip known(A) + unknown(A or B), there is a 50% chance of match.
      if (unknownPool.length === 2 && Object.keys(knownLocations).length === 2) {
        // 1. Select one known card (e.g., A)
        const knownValStr = Object.keys(knownLocations)[0];
        const knownVal = Number(knownValStr);

        // 2. Select one unknown card (e.g., A or B)
        const uIdxIndex = 0;
        const uIdx = unknownPool[uIdxIndex];
        unknownPool.splice(uIdxIndex, 1);
        const uVal = deck[uIdx];

        // 3. Compare (open simultaneously)
        if (knownVal === uVal) {
          // Match success (A == A)
          matchedPairs++;
          delete knownLocations[knownVal];
          // Remaining situation: Known B(1), Unknown B(1) -> Handled in next turn [Priority 3]
        } else {
          // Match failed (A != B)
          // We already knew the location of the other known card (B).
          // Since the flipped uVal is B, we found B's pair.
          pendingMatches.push(uVal);
          delete knownLocations[uVal]; // Move B to pending
          // A remains in knownLocations
        }
        continue;
      }

      // Handle last pair (1 known, 1 unknown)
      // Left with 2 cards after strategy success, or by luck
      if (unknownPool.length === 1 && pendingMatches.length === 0) {
        // The remaining one is definitely the pair of the known card
        unknownPool.pop();
        matchedPairs++;
        continue;
      }

      // General search (open 2 unknown cards simultaneously)
      if (unknownPool.length < 2) break; // Exception handling

      const idx1Index = Math.floor(Math.random() * unknownPool.length);
      const idx1 = unknownPool[idx1Index];
      unknownPool.splice(idx1Index, 1);
      const val1 = deck[idx1];

      const idx2Index = Math.floor(Math.random() * unknownPool.length);
      const idx2 = unknownPool[idx2Index];
      unknownPool.splice(idx2Index, 1);
      const val2 = deck[idx2];

      if (val1 === val2) {
        matchedPairs++;
      } else {
        // Update information
        if (knownLocations[val1] !== undefined) {
          pendingMatches.push(val1);
          delete knownLocations[val1];
        } else {
          knownLocations[val1] = idx1;
        }

        if (knownLocations[val2] !== undefined) {
          pendingMatches.push(val2);
          delete knownLocations[val2];
        } else {
          knownLocations[val2] = idx2;
        }
      }
    }
    totalFlips += attempts;
  }
  return totalFlips / simCount;
};
