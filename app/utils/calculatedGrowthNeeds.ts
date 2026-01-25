import {
  affectionExpToNextLevel,
  CREDIT_ID,
  ELIGMA_ID,
  equipmentBlueprintId,
  equipmentLevelUpCost,
  equipmentReinforcementExp,
  equipmentTierUpgradeCost,
  exSkillLevelUpCredit,
  levelGrowthData,
  potentialLevelCost,
  reportExp,
  reportItemIds,
  SECRET_TECH_NOTE_ID,
  skillLevelUpCredit,
  starGrowthCost,
  TIER_MAX_LEVEL,
  uwGrowthCost,
  uwLevelGrowthData,
  WB_ATK_ID,
  WB_HEAL_ID,
  WB_HP_ID,
  weaponEnhancementExp,
  weaponEnhancementItemIds,
} from '~/data/growthData';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student, StudentData } from '~/types/plannerData';

export const calculateAffectionExp = (currentLevel: number, targetLevel: number): number => {
  if (targetLevel <= currentLevel) return 0;

  let totalNeededExp = 0;
  for (let i = currentLevel; i <= targetLevel; i++) {
    const expToNext = affectionExpToNextLevel[i as keyof typeof affectionExpToNextLevel];
    if (expToNext) {
      totalNeededExp += expToNext;
    }
  }
  return totalNeededExp;
};

/** 2. Calculate the cost of growing equipment and add it to the needs object. */
const calculateEquipmentCost = (currentEquip: [number, number, number], targetEquip: [number, number, number], studentInfo: Student, needs: Record<string, number>) => {
  let totalExp = 0;

  for (let i = 0; i < 3; i++) {
    const currentTier = currentEquip[i];
    const targetTier = targetEquip[i];
    if (targetTier <= currentTier) continue;

    for (let tier = currentTier + 1; tier <= targetTier; tier++) {
      // (1) Cost of strengthening the current tier to the maximum level (always starting at level 1 as it is initialized to level 1 on promotion)
      const maxLevel = TIER_MAX_LEVEL[tier];
      for (let lv = 1; lv <= maxLevel; lv++) {
        totalExp += equipmentLevelUpCost[lv as keyof typeof equipmentLevelUpCost].exp;
        needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + equipmentLevelUpCost[lv as keyof typeof equipmentLevelUpCost].credits;
      }

      // (2) Cost of promotion to the next tier
      const upgradeCost = equipmentTierUpgradeCost[(tier + 1) as keyof typeof equipmentTierUpgradeCost];
      if (upgradeCost) {
        needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + upgradeCost.credits;
        upgradeCost.blueprints.forEach((bp) => {
          const blueprintKey = `Equipment_${equipmentBlueprintId[studentInfo.Equipment[i] as keyof typeof equipmentBlueprintId][bp.tier - 1]}`;
          needs[blueprintKey] = (needs[blueprintKey] || 0) + bp.amount;
        });
      }
    }
  }

  // Converts accumulated total experience value to tempered stone
  if (totalExp > 0) {
    for (let i = 3; i >= 0; i--) {
      // From purple
      const exp = equipmentReinforcementExp[i as keyof typeof equipmentReinforcementExp];
      const count = Math.floor(totalExp / exp);
      if (count > 0) {
        const reinforcementKey = `Equipment_${i + 1}`;
        needs[reinforcementKey] = (needs[reinforcementKey] || 0) + count;
        totalExp -= count * exp;
      }
    }
    if (totalExp > 0) {
      needs[`Equipment_1`] = (needs[`Equipment_1`] || 0) + Math.ceil(totalExp / equipmentReinforcementExp[0]);
    }
  }
};

const calculatePotentialCost = (currentPot: GrowthPlan['current']['potential'], targetPot: GrowthPlan['target']['potential'], studentInfo: Student, needs: Record<string, number>) => {
  const stats: Array<keyof typeof currentPot> = ['hp', 'atk', 'heal'];

  for (const stat of stats) {
    const currentLevel = currentPot[stat];
    const targetLevel = targetPot[stat];

    for (let lv = currentLevel + 1; lv <= targetLevel; lv++) {
      const level = lv;
      const costTier = potentialLevelCost.find((c) => level >= c.start && level <= c.end);
      if (costTier) {
        needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + costTier.credits;

        const wbKey = `Item_${{ hp: WB_HP_ID, atk: WB_ATK_ID, heal: WB_HEAL_ID }[stat]}`;
        needs[wbKey] = (needs[wbKey] || 0) + costTier.wb;

        const opartId = studentInfo.PotentialMaterial + costTier.opartTier;
        needs[`Item_${opartId}`] = (needs[`Item_${opartId}`] || 0) + costTier.opartAmount;
      }
    }
  }
};

const calculateEligmaCost = (needed: number, startPrice: number): number => {
  let cost = 0;
  let remainingEleph = needed;
  let currentPrice = startPrice;
  while (remainingEleph > 0) {
    const buyableAmount = 20;
    const amountToBuy = Math.min(remainingEleph, buyableAmount);
    cost += amountToBuy * currentPrice;
    remainingEleph -= amountToBuy;
    if (currentPrice < 5) {
      currentPrice++;
    }
  }
  return cost;
};

export const calculatedGrowthNeeds = (plansForThisEvent: GrowthPlan[], allStudents: StudentData) => {
  const needs: Record<string, number> = {};
  for (const plan of plansForThisEvent) {
    if (!plan.studentId) continue;
    const studentInfo = allStudents[plan.studentId];
    if (!studentInfo) continue;

    const { current, target } = plan;

    let neededXp = 0;
    for (let i = current.level + 1; i <= target.level; i++) {
      const cost = levelGrowthData[i];
      if (cost) {
        neededXp += cost.xp;
        needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + cost.credit;
      }
    }
    if (neededXp > 0) {
      for (let i = 4; i >= 1; i--) {
        const reportId = reportItemIds[i as keyof typeof reportItemIds];
        const exp = reportExp[i as keyof typeof reportExp];
        const count = Math.floor(neededXp / exp);
        if (count > 0) {
          needs[`Item_${reportId}`] = (needs[`Item_${reportId}`] || 0) + count;
          neededXp -= count * exp;
        }
      }
      if (neededXp > 0) needs[`Item_${reportItemIds[1]}`] = (needs[`Item_${reportItemIds[1]}`] || 0) + Math.ceil(neededXp / reportExp[1]);
    }

    let neededUwXp = 0;
    for (let i = current.uwLevel + 1; i <= target.uwLevel; i++) {
      const cost = uwLevelGrowthData[i];
      if (cost) {
        neededUwXp += cost.xp;
        needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + cost.xp * 180;
      }
    }
    if (neededUwXp > 0) {
      for (let i = 3; i >= 1; i--) {
        const enhancementId = weaponEnhancementItemIds[i as keyof typeof weaponEnhancementItemIds];
        const exp = weaponEnhancementExp[i as keyof typeof weaponEnhancementExp];
        const count = Math.floor(neededUwXp / exp);
        if (count > 0) {
          needs[`Item_${enhancementId}`] = (needs[`Item_${enhancementId}`] || 0) + count;
          neededUwXp -= count * exp;
        }
      }
      if (neededUwXp > 0) needs[`Item_${weaponEnhancementItemIds[1]}`] = (needs[`Item_${weaponEnhancementItemIds[1]}`] || 0) + Math.ceil(neededUwXp / weaponEnhancementExp[1]);
    }

    let neededEleph = 0;
    for (let i = current.star + 1; i <= target.star; i++) {
      const cost = starGrowthCost[i];
      if (cost) {
        neededEleph += cost.eleph;
        needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + cost.credit;
      }
    }
    for (let i = current.uw + 1; i <= target.uw; i++) {
      const cost = uwGrowthCost[i];
      if (cost) {
        neededEleph += cost.eleph;
        needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + cost.credit;
      }
    }

    const elephDeficit = neededEleph - current.eleph;
    if (elephDeficit > 0) {
      if (plan.useEligmaForStar) {
        const eligmaCost = calculateEligmaCost(elephDeficit, plan.eligmaInfo?.price || 1);
        needs[`Item_${ELIGMA_ID}`] = (needs[`Item_${ELIGMA_ID}`] || 0) + eligmaCost;
      } else {
        const pieceId = plan.studentId;
        needs[`Item_${pieceId}`] = (needs[`Item_${pieceId}`] || 0) + elephDeficit;
      }
    }

    const calculateSkillCost = (start: number, end: number, material: number[][], amount: number[][], needsObj: Record<string, number>, skillType: 'EX' | 'Normal') => {
      for (let i = start; i < end; i++) {
        // 1. Add credit cost
        const levelUpIndex = i - 1;
        if (skillType === 'EX') {
          if (exSkillLevelUpCredit[levelUpIndex]) {
            needsObj[`Currency_${CREDIT_ID}`] = (needsObj[`Currency_${CREDIT_ID}`] || 0) + exSkillLevelUpCredit[levelUpIndex];
          }
        } else {
          // 'Normal', 'Passive', 'Sub'
          if (skillLevelUpCredit[levelUpIndex]) {
            needsObj[`Currency_${CREDIT_ID}`] = (needsObj[`Currency_${CREDIT_ID}`] || 0) + skillLevelUpCredit[levelUpIndex];
          }
          // 2. Add Vision Note Cost (at 10 levels)
          if (i + 1 === 10) {
            needsObj[`Item_${SECRET_TECH_NOTE_ID}`] = (needsObj[`Item_${SECRET_TECH_NOTE_ID}`] || 0) + 1;
          }
        }

        const matIds = material[i - 1];
        const matAmounts = amount[i - 1];
        if (!matIds || !matAmounts) continue;
        matIds.forEach((id, index) => {
          needsObj[`Item_${id}`] = (needsObj[`Item_${id}`] || 0) + matAmounts[index];
        });
      }
    };
    calculateSkillCost(current.ex, target.ex, studentInfo.SkillExMaterial, studentInfo.SkillExMaterialAmount, needs, 'EX');
    calculateSkillCost(current.normal, target.normal, studentInfo.SkillMaterial, studentInfo.SkillMaterialAmount, needs, 'Normal');
    calculateSkillCost(current.passive, target.passive, studentInfo.SkillMaterial, studentInfo.SkillMaterialAmount, needs, 'Normal');
    calculateSkillCost(current.sub, target.sub, studentInfo.SkillMaterial, studentInfo.SkillMaterialAmount, needs, 'Normal');

    //1. Relationship rank (calculates experience as requested and does not add to needs objects)
    calculateAffectionExp(current.affection, target.affection);
    // 2. equipment growth
    calculateEquipmentCost(current.equipment, target.equipment, studentInfo, needs);
    // 3.
    calculatePotentialCost(current.potential, target.potential, studentInfo, needs);
  }
  return needs;
};
