// app/utils/solveFarmingHeuristic.ts

interface SolveOptimalRunsParams {
  /** [stages x items] matrix: Item(j) drop quantity per stage(i) */
  dropMatrix: number[][];
  /** [stages] array: AP cost per stage(i) */
  apCosts: number[];
  /** [items] array: Required quantity for each item(j) */
  neededAmounts: number[];
  /** [stages] array: Whether stage(i) is a priority */
  priorities: boolean[];
  log?: boolean;
}
/**
 * Calculates the minimum AP consumption plan to acquire all necessary items under given conditions.
 * @returns An array containing the number of runs to execute for each stage.
 */
export const solveOptimalRuns = ({ dropMatrix, apCosts, neededAmounts, priorities, log = false }: SolveOptimalRunsParams): number[] => {
  const numStages = apCosts.length;
  const numItems = neededAmounts.length;

  log && console.log('dropMatrix');
  log && console.log(dropMatrix.map((v) => v.join('\t')).join('\n'));
  log && console.log('apCosts', apCosts);
  log && console.log('neededAmounts', neededAmounts);
  log && console.log('priorities', priorities);
  let remainingNeeded = [...neededAmounts];
  const totalRuns = Array(numStages).fill(0);
  /**
   * Core function to calculate the optimal number of runs for a specific stage group and required item amounts.
   * Internally uses the Two-Phase Simplex algorithm to solve the linear programming problem.
   * @param stageIndices - Array of stage indices to include in the calculation
   * @param needed - Array of required item amounts
   * @returns An array of calculated runs per stage for this step
   */
  const solvePhase = (stageIndices: number[], needed: number[], log: boolean = false): number[] => {
    // 1. Filter valid variables and constraints
    log && console.log('solvePhase', 'stageIndices', stageIndices);
    log && console.log('solvePhase', 'needed', needed);
    const decisionVarsIndices = stageIndices.filter((i) => apCosts[i] > 0);
    const constraints: { matrixRow: number[]; rhs: number }[] = [];
    needed.forEach((amount, itemIndex) => {
      if (amount > 0) {
        constraints.push({
          matrixRow: decisionVarsIndices.map((stageIndex) => dropMatrix[stageIndex][itemIndex]),
          rhs: amount,
        });
      }
    });
    log && console.log('constraints', constraints);
    if (decisionVarsIndices.length === 0 || constraints.length === 0) {
      return Array(numStages).fill(0);
    }
    // 2. Define simplex problem
    // Objective: Minimize total AP (Maximize: -Total AP)
    const objectiveCoeffs = decisionVarsIndices.map((i) => apCosts[i]);
    const constraintMatrix = constraints.map((c) => c.matrixRow);
    const rhsVector = constraints.map((c) => c.rhs);
    // 3. Run simplex solver
    const solution = simplexSolver(objectiveCoeffs, constraintMatrix, rhsVector);
    log && console.log('simplexSolver', objectiveCoeffs, constraintMatrix, rhsVector, solution);
    // 4. Process results
    const phaseRuns = Array(numStages).fill(0);
    if (solution.status === 'optimal') {
      decisionVarsIndices.forEach((originalStageIndex, i) => {
        // Round up fractional results to meet requirements
        phaseRuns[originalStageIndex] = Math.ceil(solution.result[i]);
      });
    } else {
      log && console.warn(`[solvePhase] No optimal solution found. Status: ${solution.status}`);
    }
    return phaseRuns;
  };
  // Phase 1: Attempt to solve using only priority stages
  const priorityIndices = priorities.map((p, i) => (p ? i : -1)).filter((i) => i !== -1);
  if (priorityIndices.length > 0) {
    const priorityRuns = solvePhase(priorityIndices, remainingNeeded);
    log && console.log('priorityRuns', priorityRuns);
    for (let i = 0; i < numStages; i++) {
      if (priorityRuns[i] > 0) {
        totalRuns[i] += priorityRuns[i];
        for (let j = 0; j < numItems; j++) {
          remainingNeeded[j] -= dropMatrix[i][j] * priorityRuns[i];
        }
      }
    }
  }
  // Adjust remaining needed quantities to not go below 0
  remainingNeeded = remainingNeeded.map((v) => Math.max(0, v));
  // Phase 2: If materials are still needed, solve using all stages
  if (remainingNeeded.some((v) => v > 0)) {
    const allIndices = Array.from({ length: numStages }, (_, i) => i);
    const remainingRuns = solvePhase(allIndices, remainingNeeded);
    log && console.log('remainingRuns', remainingRuns);
    for (let i = 0; i < numStages; i++) {
      totalRuns[i] += remainingRuns[i];
    }
  }
  return totalRuns;
};

type SimplexSolution = {
  status: 'optimal' | 'infeasible' | 'unbounded';
  result: number[];
  objectiveValue?: number; // Objective function value of the optimal solution
};

const TOLERANCE = 1e-9;

/**
 * Solves a linear programming problem using the Two-Phase Simplex Method.
 * @param c - Objective function coefficients (Minimize c'x)
 * @param A - Constraint matrix (Ax >= b)
 * @param b - Right-hand side of constraints (b >= 0)
 */
function simplexSolver(c: number[], A: number[][], b: number[], log: boolean = false): SimplexSolution {
  const m = A.length; // Number of constraints
  const n = c.length; // Number of variables

  // console.log('simplexSolver>A')
  // console.log(A.map(v=>v.join('\t')).join('\n'))
  // console.log('simplexSolver>b',b)
  // console.log('simplexSolver>c',c)
  // type SimplexSolution = {
  //   status: 'optimal' | 'infeasible' | 'unbounded';
  //   result: number[];
  //   objectiveValue?: number; // Objective function value of the optimal solution
  // };

  const TOLERANCE = 1e-9;

  // console.log("--- Simplex Algorithm Start ---");
  // console.log("Objective (Minimize): c =", c);
  // console.log("Constraints Matrix: A =", A);
  // console.log("Constraints RHS: b =", b);

  // --- Phase 1: Find initial feasible solution ---
  log && console.log('\n--- Phase 1: Finding an initial feasible solution ---');

  // Phase 1 Tableau setup
  // Columns: x_vars(n) + surplus_vars(m) + artificial_vars(m) + RHS(1)
  const num_vars_p1 = n + 2 * m;
  const tableau_p1 = Array(m + 1)
    .fill(0)
    .map(() => Array(num_vars_p1 + 1).fill(0));
  let basis: number[] = []; // Basic variable index for each row

  // Fill tableau: Ax - s + r = b
  for (let i = 0; i < m; i++) {
    // x variable coefficients
    for (let j = 0; j < n; j++) {
      tableau_p1[i][j] = A[i][j];
    }
    // Surplus variable (-s_i)
    tableau_p1[i][n + i] = -1;
    // Artificial variable (+r_i)
    tableau_p1[i][n + m + i] = 1;
    // RHS
    tableau_p1[i][num_vars_p1] = b[i];
    // Initial basic variables are artificial variables
    basis[i] = n + m + i;
  }

  // Set Phase 1 objective function (min w = sum(r_i)).
  // Objective function row holds z_j - c_j values.
  // Where z_j = c_B' * P_j, and initial c_B = [1,1,...,1].
  const obj_row_p1 = tableau_p1[m];
  for (let i = 0; i < m; i++) {
    // Add each constraint row to the objective row to calculate z_j
    for (let j = 0; j < num_vars_p1 + 1; j++) {
      obj_row_p1[j] += tableau_p1[i][j];
    }
  }
  // Subtract c_j (c_j for artificial variables is 1)
  // z_j for artificial var column is 1. So (z_j - c_j) becomes 1-1=0.
  for (let i = 0; i < m; i++) {
    obj_row_p1[n + m + i] -= 1;
  }

  printTableau(tableau_p1, basis, n, m, 'Initial Phase 1 Tableau');

  // Run Phase 1 Simplex
  solvePhase(tableau_p1, basis, n, m, 1);

  printTableau(tableau_p1, basis, n, m, 'Final Phase 1 Tableau');

  // Check Phase 1 optimum: If objective value &gt; 0, solution is infeasible
  const num_vars_p1_rhs_idx = num_vars_p1;
  if (tableau_p1[m][num_vars_p1_rhs_idx] > TOLERANCE) {
    log && console.log(`Phase 1 Result: Infeasible. Final objective value is ${tableau_p1[m][num_vars_p1_rhs_idx].toFixed(3)}, which is > 0.`);
    return { status: 'infeasible', result: [] };
  }
  log && console.log('Phase 1 Result: Feasible solution found.');

  // --- Phase 2: Find optimal solution ---
  log && console.log('\n--- Phase 2: Finding the optimal solution ---');

  const num_vars_p2 = n + m;
  const tableau_p2 = Array(m + 1)
    .fill(0)
    .map(() => Array(num_vars_p2 + 1).fill(0));

  // Copy Phase 1 tableau excluding artificial variable columns
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < num_vars_p2; j++) {
      tableau_p2[i][j] = tableau_p1[i][j];
    }
    tableau_p2[i][num_vars_p2] = tableau_p1[i][num_vars_p1];
  }

  // Set Phase 2 objective function (min z = c*x)
  const obj_row_p2 = tableau_p2[m];
  const rhs_col_p2 = num_vars_p2;

  // Calculate c_B (objective coefficients of basic variables)
  const c_B = basis.map((basis_idx) => (basis_idx < n ? c[basis_idx] : 0));

  // Calculate z_j - c_j for each column
  for (let j = 0; j < rhs_col_p2; j++) {
    let z_j = 0;
    for (let i = 0; i < m; i++) {
      z_j += c_B[i] * tableau_p2[i][j];
    }
    const c_j = j < n ? c[j] : 0;
    obj_row_p2[j] = z_j - c_j;
  }

  // Calculate current value of objective function (RHS)
  let obj_val = 0;
  for (let i = 0; i < m; i++) {
    obj_val += c_B[i] * tableau_p2[i][rhs_col_p2];
  }
  // Note: The objective function value must be calculated as negative (since z = c'x, it is stored as -z in the tableau)
  obj_row_p2[rhs_col_p2] = -obj_val;

  printTableau(tableau_p2, basis, n, m, 'Initial Phase 2 Tableau');

  // Run Phase 2 Simplex
  const phase2_status = solvePhase(tableau_p2, basis, n, m, 2);

  printTableau(tableau_p2, basis, n, m, 'Final Phase 2 Tableau');

  if (!phase2_status) {
    log && console.log('Phase 2 Result: Unbounded solution.');
    return { status: 'unbounded', result: [] };
  }

  // Extract optimal solution
  const result = Array(n).fill(0);
  for (let i = 0; i < m; i++) {
    if (basis[i] < n) {
      result[basis[i]] = tableau_p2[i][rhs_col_p2];
    }
  }

  log && console.log('\n--- Algorithm Finished ---');
  log && console.log('Final Status: optimal');
  log &&
    console.log(
      'Optimal Solution (x):',
      result.map((v) => parseFloat(v.toFixed(3))),
    );
  const final_obj_val = -tableau_p2[m][rhs_col_p2]; // Revert sign
  log && console.log('Optimal Objective Value (z):', parseFloat(final_obj_val.toFixed(3)));

  return {
    status: 'optimal',
    result: result,
    objectiveValue: final_obj_val,
  };
}

/**
 * Internal helper function to solve the simplex tableau
 * @param tableau Simplex tableau
 * @param basis Basis variable array
 * @returns true if not Unbounded, false if Unbounded
 */
function solvePhase(tableau: number[][], basis: number[], n: number, m: number, phase: number, log: boolean = false): boolean {
  const m_rows = tableau.length - 1;
  const num_vars = tableau[0].length - 1;
  let iteration = 0;

  while (true) {
    // 1. Select entering variable (Pivot Column) (Minimization problem: select j where z_j-c_j > 0)
    let pivot_col = -1;
    let max_val = TOLERANCE; // Find the largest positive value
    const obj_row = tableau[m_rows];

    for (let j = 0; j < num_vars; j++) {
      if (obj_row[j] > max_val) {
        max_val = obj_row[j];
        pivot_col = j;
      }
    }

    // Optimal solution reached (no more positive coefficients)
    if (pivot_col === -1) {
      log && console.log(`\n--- Phase ${phase}, Iteration ${iteration}: Optimal condition met for this phase. ---`);
      return true; // Optimal for this phase
    }

    iteration++;
    log && console.log(`\n--- Phase ${phase}, Iteration ${iteration} ---`);
    log && console.log(`Selected Pivot Column (Entering Variable): ${getVariableName(pivot_col, n, m)} (index: ${pivot_col})`);

    // 2. Select leaving variable (Pivot Row) (Minimum ratio test)
    let pivot_row = -1;
    let min_ratio = Infinity;

    for (let i = 0; i < m_rows; i++) {
      if (tableau[i][pivot_col] > TOLERANCE) {
        const ratio = tableau[i][num_vars] / tableau[i][pivot_col];
        if (ratio < min_ratio) {
          min_ratio = ratio;
          pivot_row = i;
        }
      }
    }

    // Unbounded Solution Check
    if (pivot_row === -1) {
      log && console.log('Unbounded solution detected. All coefficients in pivot column are non-positive.');
      return false;
    }

    log && console.log(`Selected Pivot Row (Leaving Variable): ${getVariableName(basis[pivot_row], n, m)} (row index: ${pivot_row})`);

    // 3. Pivot operation (Gauss-Jordan elimination)
    const pivot_val = tableau[pivot_row][pivot_col];
    // Normalize the pivot row (make the pivot element 1)
    for (let j = 0; j < num_vars + 1; j++) {
      tableau[pivot_row][j] /= pivot_val;
    }

    // Make other elements in the pivot column 0
    for (let i = 0; i < m_rows + 1; i++) {
      if (i !== pivot_row) {
        const multiplier = tableau[i][pivot_col];
        for (let j = 0; j < num_vars + 1; j++) {
          tableau[i][j] -= multiplier * tableau[pivot_row][j];
        }
      }
    }

    // 4. Update basis variable
    basis[pivot_row] = pivot_col;

    printTableau(tableau, basis, n, m, `Tableau after Iteration ${iteration}`);
  }
}

/**
 * Gets the variable name based on the variable index. (e.g., x1, s1, r1)
 * @param index Variable index
 * @param n Number of original variables
 * @param m Number of constraints
 */
function getVariableName(index: number, n: number, m: number): string {
  if (index < n) {
    return `x${index + 1}`;
  } else if (index < n + m) {
    return `s${index - n + 1}`;
  } else {
    return `r${index - (n + m) + 1}`;
  }
}

/**
 * Pretty-prints the simplex tableau to the console.
 * @param tableau Simplex tableau
 * @param basis Basis variable array
 * @param n Number of original variables
 * @param m Number of constraints
 * @param title Title of the table to print
 */
function printTableau(tableau: number[][], basis: number[], n: number, m: number, title: string, log: boolean = false) {
  log && console.log(`\n--- ${title} ---`);
  const m_rows = tableau.length - 1;
  const n_cols = tableau[0].length - 1;

  // Create header
  const header = ['Basis', ...Array.from({ length: n_cols }, (_, j) => getVariableName(j, n, m)), 'RHS'];

  const formattedData: any[] = [];

  // Constraint rows
  for (let i = 0; i < m_rows; i++) {
    const rowData: { [key: string]: string | number } = {
      Basis: getVariableName(basis[i], n, m),
    };
    for (let j = 0; j < n_cols + 1; j++) {
      rowData[header[j + 1]] = parseFloat(tableau[i][j].toFixed(3));
    }
    formattedData.push(rowData);
  }

  // Objective function row
  const objRowData: { [key: string]: string | number } = { Basis: 'z' };
  for (let j = 0; j < n_cols + 1; j++) {
    objRowData[header[j + 1]] = parseFloat(tableau[m_rows][j].toFixed(3));
  }
  formattedData.push(objRowData);
}
