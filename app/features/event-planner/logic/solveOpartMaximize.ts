// Extended Simplex Solver handling b[i] < 0 constraints
// Used for opart optimization with over-farming upper bounds

const TOLERANCE = 1e-9;

type SimplexSolution = {
  status: 'optimal' | 'infeasible' | 'unbounded';
  result: number[];
  objectiveValue?: number;
};

function extendedSimplexSolver(c: number[], A: number[][], b: number[]): SimplexSolution {
  const m = A.length;
  const n = c.length;

  if (m === 0 || n === 0) {
    return { status: 'optimal', result: Array<number>(n).fill(0), objectiveValue: 0 };
  }

  // Check for b[i] >= 0 constraints (require artificials)
  const needsArtificial = b.map((bi) => bi >= -TOLERANCE);

  // Phase 1 Tableau setup
  const num_vars_p1 = n + 2 * m;
  const tableau_p1: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array<number>(num_vars_p1 + 1).fill(0));
  const basis: number[] = [];

  // Fill tableau
  for (let i = 0; i < m; i++) {
    if (b[i] < -TOLERANCE) {
      // b[i] < 0: negate row, use slack as basis
      for (let j = 0; j < n; j++) {
        tableau_p1[i][j] = -A[i][j];
      }
      tableau_p1[i][n + i] = 1; // slack
      tableau_p1[i][n + m + i] = 0; // no artificial
      tableau_p1[i][num_vars_p1] = -b[i];
      basis[i] = n + i;
    } else {
      // b[i] >= 0: standard (surplus + artificial)
      for (let j = 0; j < n; j++) {
        tableau_p1[i][j] = A[i][j];
      }
      tableau_p1[i][n + i] = -1; // surplus
      tableau_p1[i][n + m + i] = 1; // artificial
      tableau_p1[i][num_vars_p1] = b[i];
      basis[i] = n + m + i;
    }
  }

  // Set Phase 1 objective (sum only artificial rows)
  const obj_row_p1 = tableau_p1[m];
  for (let i = 0; i < m; i++) {
    if (needsArtificial[i]) {
      for (let j = 0; j <= num_vars_p1; j++) {
        obj_row_p1[j] += tableau_p1[i][j];
      }
    }
  }
  for (let i = 0; i < m; i++) {
    if (needsArtificial[i]) {
      obj_row_p1[n + m + i] -= 1;
    }
  }

  // Run Phase 1
  const phase1Feasible = runSimplexIterations(tableau_p1, basis, n, m, num_vars_p1);

  if (!phase1Feasible || tableau_p1[m][num_vars_p1] > TOLERANCE) {
    return { status: 'infeasible', result: [] };
  }

  // Phase 2: Extract and set up
  const num_vars_p2 = n + m;
  const tableau_p2: number[][] = Array.from({ length: m + 1 }, () => Array<number>(num_vars_p2 + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < num_vars_p2; j++) {
      tableau_p2[i][j] = tableau_p1[i][j];
    }
    tableau_p2[i][num_vars_p2] = tableau_p1[i][num_vars_p1];
  }

  const obj_row_p2 = tableau_p2[m];
  const c_B = basis.map((bi) => (bi < n ? c[bi] : 0));

  for (let j = 0; j < num_vars_p2; j++) {
    let z_j = 0;
    for (let i = 0; i < m; i++) {
      z_j += c_B[i] * tableau_p2[i][j];
    }
    const c_j = j < n ? c[j] : 0;
    obj_row_p2[j] = z_j - c_j;
  }

  let obj_val = 0;
  for (let i = 0; i < m; i++) {
    obj_val += c_B[i] * tableau_p2[i][num_vars_p2];
  }
  obj_row_p2[num_vars_p2] = -obj_val;

  // Run Phase 2
  const phase2Optimal = runSimplexIterations(tableau_p2, basis, n, m, num_vars_p2);

  if (!phase2Optimal) {
    return { status: 'unbounded', result: [] };
  }

  const result = Array<number>(n).fill(0);
  for (let i = 0; i < m; i++) {
    if (basis[i] < n) {
      result[basis[i]] = tableau_p2[i][num_vars_p2];
    }
  }

  const final_obj_val = -tableau_p2[m][num_vars_p2];
  return {
    status: 'optimal',
    result,
    objectiveValue: final_obj_val,
  };
}

function runSimplexIterations(tableau: number[][], basis: number[], _n: number, _m: number, num_vars: number): boolean {
  const m_rows = tableau.length - 1;
  const num_vars_full = tableau[0].length - 1;

  while (true) {
    const obj_row = tableau[m_rows];
    let pivot_col = -1;
    let max_val = TOLERANCE;

    for (let j = 0; j < num_vars; j++) {
      if (obj_row[j] > max_val) {
        max_val = obj_row[j];
        pivot_col = j;
      }
    }

    if (pivot_col === -1) {
      return true;
    }

    let pivot_row = -1;
    let min_ratio = Infinity;

    for (let i = 0; i < m_rows; i++) {
      if (tableau[i][pivot_col] > TOLERANCE) {
        const ratio = tableau[i][num_vars_full] / tableau[i][pivot_col];
        if (ratio < min_ratio) {
          min_ratio = ratio;
          pivot_row = i;
        }
      }
    }

    if (pivot_row === -1) {
      return false;
    }

    const pivot_val = tableau[pivot_row][pivot_col];
    for (let j = 0; j <= num_vars_full; j++) {
      tableau[pivot_row][j] /= pivot_val;
    }

    for (let i = 0; i < m_rows + 1; i++) {
      if (i !== pivot_row) {
        const multiplier = tableau[i][pivot_col];
        for (let j = 0; j <= num_vars_full; j++) {
          tableau[i][j] -= multiplier * tableau[pivot_row][j];
        }
      }
    }

    basis[pivot_row] = pivot_col;
  }
}

export interface SolveOpartMaximizeParams {
  dropMatrix: number[][];
  apCosts: number[];
  neededAmounts: number[];
  opartDropRates: number[];
}

export function solveOpartMaximize({ dropMatrix, apCosts, neededAmounts, opartDropRates }: SolveOpartMaximizeParams): number[] {
  const numStages = apCosts.length;
  const numItems = neededAmounts.length;

  // Find opart stage (first with non-zero opartDropRate)
  const opartStageIdx = opartDropRates.findIndex((r) => r > TOLERANCE);
  if (opartStageIdx === -1) {
    return Array<number>(numStages).fill(0);
  }

  const opartItemDrops = dropMatrix[opartStageIdx];

  // Calculate max single drop per item across all stages
  const maxSingleDrop = Array(numItems)
    .fill(0)
    .map((_, j) => Math.max(...dropMatrix.map((row) => row[j])));

  // Non-opart stage indices
  const nonOpartIndices = Array.from({ length: numStages }, (_, i) => i).filter((i) => i !== opartStageIdx);

  // Step 1: Calculate x_opart greedy (min ceil(need[j] / opart_drop[j]))
  const validItems = opartItemDrops.map((d, j) => (d > TOLERANCE ? Math.ceil(neededAmounts[j] / d) : Infinity)).filter((v) => isFinite(v));

  if (validItems.length === 0) {
    return Array<number>(numStages).fill(0);
  }

  const x_opart_greedy = Math.min(...validItems);

  // Hard limit: floor((need[j] + maxDrop[j]) / opart_drop[j])
  const x_opart_hard_limit = Math.min(...opartItemDrops.map((d, j) => (d > TOLERANCE ? Math.floor((neededAmounts[j] + maxSingleDrop[j]) / d) : Infinity)).filter((v) => isFinite(v)));

  const x_start = Math.min(x_opart_greedy, x_opart_hard_limit);

  // Step 2: Try LP for a given x_opart value
  function tryLP(x_opart: number): number[] | null {
    const deficit = neededAmounts.map((n, j) => Math.max(0, n - x_opart * opartItemDrops[j]));
    const upperRoom = neededAmounts.map((n, j) => n + maxSingleDrop[j] - x_opart * opartItemDrops[j]);

    // Check if already over-farming
    if (upperRoom.some((u) => u < -TOLERANCE)) {
      return null;
    }

    // Build LP for non-opart stages only
    const nonOpartDrops = nonOpartIndices.map((i) => dropMatrix[i]);
    const nonOpartCosts = nonOpartIndices.map((i) => apCosts[i]);

    const A_rows: number[][] = [];
    const b_rows: number[] = [];

    // Add deficit constraints (b >= 0)
    for (let j = 0; j < numItems; j++) {
      if (deficit[j] > TOLERANCE) {
        A_rows.push(nonOpartDrops.map((row) => row[j]));
        b_rows.push(deficit[j]);
      }
    }

    // Add upper-room constraints (b <= 0, negated form)
    for (let j = 0; j < numItems; j++) {
      if (upperRoom[j] < Infinity) {
        A_rows.push(nonOpartDrops.map((row) => -row[j]));
        b_rows.push(-upperRoom[j]);
      }
    }

    // Solve LP
    if (A_rows.length === 0) {
      // No constraints, return zeros for non-opart stages
      return Array<number>(nonOpartIndices.length).fill(0);
    }

    const sol = extendedSimplexSolver(nonOpartCosts, A_rows, b_rows);
    return sol.status === 'optimal' ? sol.result : null;
  }

  // Step 3: Find maximum feasible x_opart using exponential search then binary refinement
  let bestX = 0;
  let bestLP: number[] | null = null;

  // First try x_start
  let result = tryLP(x_start);
  if (result !== null) {
    bestX = x_start;
    bestLP = result;
  } else {
    // Exponential search downward to find a feasible value
    let searchPoint = Math.floor(x_start / 2);
    let feasibleFound = false;

    while (searchPoint > 0 && !feasibleFound) {
      result = tryLP(searchPoint);
      if (result !== null) {
        bestX = searchPoint;
        bestLP = result;
        feasibleFound = true;
      } else {
        searchPoint = Math.floor(searchPoint / 2);
      }
    }

    // If still not found, try x = 0
    if (!feasibleFound) {
      result = tryLP(0);
      if (result !== null) {
        bestX = 0;
        bestLP = result;
      }
    }

    // Binary search to refine: if we found a feasible point, try to find higher ones
    if (bestLP !== null) {
      let lo = bestX + 1;
      let hi = x_start;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const midResult = tryLP(mid);

        if (midResult !== null) {
          bestX = mid;
          bestLP = midResult;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
    }
  }

  // If still no solution, return zeros
  if (bestLP === null) {
    return Array<number>(numStages).fill(0);
  }

  // Step 4: Combine results
  const finalRuns = Array<number>(numStages).fill(0);
  finalRuns[opartStageIdx] = bestX;

  nonOpartIndices.forEach((stageIdx, k) => {
    finalRuns[stageIdx] = Math.ceil(bestLP[k]);
  });

  return finalRuns;
}
