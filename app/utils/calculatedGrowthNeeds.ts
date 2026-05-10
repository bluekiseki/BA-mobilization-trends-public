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

export const calcEquipmentSlotNeeds = (currentTier: number, targetTier: number, equipType: string): Record<string, number> => {
  const needs: Record<string, number> = {};
  if (targetTier <= currentTier) return needs;
  let totalExp = 0;

  for (let tier = currentTier + 1; tier <= targetTier; tier++) {
    const maxLevel = TIER_MAX_LEVEL[tier];
    for (let lv = 1; lv <= maxLevel; lv++) {
      totalExp += equipmentLevelUpCost[lv as keyof typeof equipmentLevelUpCost].exp;
      needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + equipmentLevelUpCost[lv as keyof typeof equipmentLevelUpCost].credits;
    }
    const upgradeCost = equipmentTierUpgradeCost[(tier + 1) as keyof typeof equipmentTierUpgradeCost];
    if (upgradeCost) {
      needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + upgradeCost.credits;
      upgradeCost.blueprints.forEach((bp) => {
        const bpIds = equipmentBlueprintId[equipType as keyof typeof equipmentBlueprintId];
        if (bpIds) {
          needs[`Equipment_${bpIds[bp.tier - 1]}`] = (needs[`Equipment_${bpIds[bp.tier - 1]}`] || 0) + bp.amount;
        }
      });
    }
  }

  if (totalExp > 0) {
    for (let i = 3; i >= 0; i--) {
      const exp = equipmentReinforcementExp[i as keyof typeof equipmentReinforcementExp];
      const count = Math.floor(totalExp / exp);
      if (count > 0) {
        needs[`Equipment_${i + 1}`] = (needs[`Equipment_${i + 1}`] || 0) + count;
        totalExp -= count * exp;
      }
    }
    if (totalExp > 0) needs[`Equipment_1`] = (needs[`Equipment_1`] || 0) + Math.ceil(totalExp / equipmentReinforcementExp[0]);
  }
  return needs;
};

export const calcGearNeeds = (currentGear: number, targetGear: number, gearData: { TierUpMaterial: number[][]; TierUpMaterialAmount: number[][] }): Record<string, number> => {
  const needs: Record<string, number> = {};
  if (currentGear >= 2 || targetGear < 2 || !gearData?.TierUpMaterial) return needs;
  gearData.TierUpMaterial.forEach((matIds, i) => {
    matIds.forEach((matId, j) => {
      const amount = gearData.TierUpMaterialAmount[i][j] ?? 0;
      const key = matId === CREDIT_ID ? `Currency_${CREDIT_ID}` : `Item_${matId}`;
      needs[key] = (needs[key] || 0) + amount;
    });
  });
  return needs;
};

const calculateEquipmentCost = (currentEquip: [number, number, number], targetEquip: [number, number, number], studentInfo: Student, needs: Record<string, number>) => {
  for (let i = 0; i < 3; i++) {
    const slotNeeds = calcEquipmentSlotNeeds(currentEquip[i], targetEquip[i], studentInfo.Equipment[i]);
    for (const [k, v] of Object.entries(slotNeeds)) needs[k] = (needs[k] || 0) + v;
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

export const calcSkillCostNeeds = (start: number, end: number, material: number[][], amount: number[][], skillType: 'EX' | 'Normal'): Record<string, number> => {
  const needs: Record<string, number> = {};
  for (let i = start; i < end; i++) {
    const levelUpIndex = i - 1;
    if (skillType === 'EX') {
      if (exSkillLevelUpCredit[levelUpIndex]) {
        needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + exSkillLevelUpCredit[levelUpIndex];
      }
    } else {
      if (skillLevelUpCredit[levelUpIndex]) {
        needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + skillLevelUpCredit[levelUpIndex];
      }
      if (i + 1 === 10) {
        needs[`Item_${SECRET_TECH_NOTE_ID}`] = (needs[`Item_${SECRET_TECH_NOTE_ID}`] || 0) + 1;
      }
    }
    const matIds = material[i - 1];
    const matAmounts = amount[i - 1];
    if (!matIds || !matAmounts) continue;
    matIds.forEach((id, index) => {
      needs[`Item_${id}`] = (needs[`Item_${id}`] || 0) + matAmounts[index];
    });
  }
  return needs;
};

export const calcPotentialStatNeeds = (stat: 'hp' | 'atk' | 'heal', currentLevel: number, targetLevel: number, potentialMaterialBaseId: number): Record<string, number> => {
  const needs: Record<string, number> = {};
  const wbId = { hp: WB_HP_ID, atk: WB_ATK_ID, heal: WB_HEAL_ID }[stat];
  for (let lv = currentLevel + 1; lv <= targetLevel; lv++) {
    const costTier = potentialLevelCost.find((c) => lv >= c.start && lv <= c.end);
    if (costTier) {
      needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + costTier.credits;
      needs[`Item_${wbId}`] = (needs[`Item_${wbId}`] || 0) + costTier.wb;
      const opartId = potentialMaterialBaseId + costTier.opartTier;
      needs[`Item_${opartId}`] = (needs[`Item_${opartId}`] || 0) + costTier.opartAmount;
    }
  }
  return needs;
};

export const calcLevelNeeds = (currentLevel: number, targetLevel: number): Record<string, number> => {
  const needs: Record<string, number> = {};
  let neededXp = 0;
  for (let i = currentLevel + 1; i <= targetLevel; i++) {
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
  return needs;
};

export const calcUWLevelNeeds = (currentUWLevel: number, targetUWLevel: number): Record<string, number> => {
  const needs: Record<string, number> = {};
  let neededXp = 0;
  for (let i = currentUWLevel + 1; i <= targetUWLevel; i++) {
    const cost = uwLevelGrowthData[i];
    if (cost) {
      neededXp += cost.xp;
      needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + cost.xp * 180;
    }
  }
  if (neededXp > 0) {
    for (let i = 3; i >= 1; i--) {
      const enhancementId = weaponEnhancementItemIds[i as keyof typeof weaponEnhancementItemIds];
      const exp = weaponEnhancementExp[i as keyof typeof weaponEnhancementExp];
      const count = Math.floor(neededXp / exp);
      if (count > 0) {
        needs[`Equipment_${enhancementId}`] = (needs[`Equipment_${enhancementId}`] || 0) + count;
        neededXp -= count * exp;
      }
    }
    if (neededXp > 0) needs[`Equipment_${weaponEnhancementItemIds[1]}`] = (needs[`Equipment_${weaponEnhancementItemIds[1]}`] || 0) + Math.ceil(neededXp / weaponEnhancementExp[1]);
  }
  return needs;
};

export const calcRankNeeds = (currentStar: number, targetStar: number, currentUW: number, targetUW: number, studentId?: number): Record<string, number> => {
  const needs: Record<string, number> = {};
  let neededEleph = 0;
  for (let i = currentStar + 1; i <= targetStar; i++) {
    const cost = starGrowthCost[i];
    if (cost) {
      neededEleph += cost.eleph;
      needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + cost.credit;
    }
  }
  for (let i = currentUW + 1; i <= targetUW; i++) {
    const cost = uwGrowthCost[i];
    if (cost) {
      neededEleph += cost.eleph;
      needs[`Currency_${CREDIT_ID}`] = (needs[`Currency_${CREDIT_ID}`] || 0) + cost.credit;
    }
  }
  if (neededEleph > 0) {
    const key = studentId ? `Item_${studentId}` : `_eleph`;
    needs[key] = neededEleph;
  }
  return needs;
};

export const calculatedGrowthNeeds = (plansForThisEvent: GrowthPlan[], allStudents: StudentData) => {
  const needs: Record<string, number> = {};
  for (const plan of plansForThisEvent) {
    if (!plan.studentId) continue;
    const studentInfo = allStudents[plan.studentId];
    if (!studentInfo) continue;

    const { current, target } = plan;

    const levelNeeds = calcLevelNeeds(current.level, target.level);
    for (const [k, v] of Object.entries(levelNeeds)) needs[k] = (needs[k] || 0) + v;

    const uwLevelNeeds = calcUWLevelNeeds(current.uwLevel, target.uwLevel);
    for (const [k, v] of Object.entries(uwLevelNeeds)) needs[k] = (needs[k] || 0) + v;

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

    const skillNeeds = [
      calcSkillCostNeeds(current.ex, target.ex, studentInfo.SkillExMaterial, studentInfo.SkillExMaterialAmount, 'EX'),
      calcSkillCostNeeds(current.normal, target.normal, studentInfo.SkillMaterial, studentInfo.SkillMaterialAmount, 'Normal'),
      calcSkillCostNeeds(current.passive, target.passive, studentInfo.SkillMaterial, studentInfo.SkillMaterialAmount, 'Normal'),
      calcSkillCostNeeds(current.sub, target.sub, studentInfo.SkillMaterial, studentInfo.SkillMaterialAmount, 'Normal'),
    ];
    for (const sn of skillNeeds) for (const [k, v] of Object.entries(sn)) needs[k] = (needs[k] || 0) + v;

    calculateAffectionExp(current.affection, target.affection);
    calculateEquipmentCost(current.equipment, target.equipment, studentInfo, needs);

    const stats: Array<'hp' | 'atk' | 'heal'> = ['hp', 'atk', 'heal'];
    for (const stat of stats) {
      const potNeeds = calcPotentialStatNeeds(stat, current.potential[stat], target.potential[stat], studentInfo.PotentialMaterial);
      for (const [k, v] of Object.entries(potNeeds)) needs[k] = (needs[k] || 0) + v;
    }
    const gearData = studentInfo.Gear as { TierUpMaterial?: number[][]; TierUpMaterialAmount?: number[][] };
    if (gearData?.TierUpMaterial && gearData?.TierUpMaterialAmount) {
      const gearNeeds = calcGearNeeds(current.gear ?? 0, target.gear ?? 0, gearData as { TierUpMaterial: number[][]; TierUpMaterialAmount: number[][] });
      for (const [k, v] of Object.entries(gearNeeds)) needs[k] = (needs[k] || 0) + v;
    }
  }
  return needs;
};
