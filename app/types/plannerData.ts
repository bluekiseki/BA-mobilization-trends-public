// app/types/plannerData.ts
import type { Student as StudentBase } from './data'
// src/types/student.ts
export interface Student extends StudentBase {
  PieceId?: any;
  Name: string;
  SearchTags: string[];
  // Position: "Back" | "Front" | "Middle";
  // SquadType: "Main" | "Support";
  // TacticRole: "DamageDealer" | "Healer" | "Supporter" | "Tanker" | "Vehicle";
  School: string;
  BulletType: 'Explosion' | 'Mystic' | 'Pierce' | 'Sonic';
  PotentialMaterial: number
  SkillExMaterial: number[][]
  SkillExMaterialAmount: number[][]
  SkillMaterial: number[][]
  SkillMaterialAmount: number[][]
  StarGrade: number
  Skills: Skills
  Equipment: ["Hat" | "Shoes" | "Gloves", "Hairpin" | "Bag" | "Badge", "Watch" | "Charm" | "Necklace:"]
  FavorItemTags: string[]
  FavorItemUniqueTags: string[]
}

export type ImageMap = Record<string, string>;


// Use Student ID as Key
export type StudentData = Record<string, Student>;

// Student Portrait Data (ID: Base64 Webp String)
export type StudentPortraitData = Record<number, string>;

// Icon image data (Type: {ID: Base64 Webp string })
export type IconData = Record<string, Record<string, string>>;

interface ShopInfo {
  CategoryType: number;
  CostParcelId: number[];
}


// ===================================================================
// Full structure of the event JSON file (event.xxx.json)
// ===================================================================


export interface EventData {
  season: EventSeason;
  bonus: Record<string, EventBonus>; // key: student ID
  currency: EventCurrency[];
  stage: {
    stage: Stage[];
    story: Stage[];
    challenge: Stage[];
  };
  shop: Record<string, ShopItem[]>; // key: shop ID
  icons: IconInfos;
  shop_info: ShopInfo[];
  mission: Mission[];
  card_shop?: CardShopItem[];
  treasure?: {
    info: any[];
    round: TreasureRound[];
    reward: Record<string, TreasureReward>;
    cell_reward: Record<string, CellReward>;
  };
  box_gacha?: {
    shop: BoxGachaShopItem[];
    manage: BoxGachaManage[];
  };

  fortune_gacha?: {
    shop: FortuneGachaShopItem[];
    modify: FortuneGachaModify[];
  }
  total_reward?: TotalRewardItem[];
  dice_race?: {
    info: DiceRaceInfo[];
    porb: any[]; // 'porb'
    total_reward: DiceRaceTotalReward[];
    race_node: DiceRaceNode[];
  };
  minigame_mission?: MinigameMission[];
  minigame_dream?: MinigameDreamData
  minigame_ccg?: MinigameCCG;
  concentration?: MinigameConcentration

}

export interface IconInfos {
  Item: Record<string, IconInfo>; // key: Item ID
  Equipment: Record<string, IconInfo>; // key: Item ID
  Furniture?: Record<string, IconInfo>; // key: Item ID
  Currency: Record<string, IconInfo>; // key: Item ID
  Emblem?: Record<string, IconInfo>;
  GachaGroup?: Record<string, GachaGroupInfo>;
}

// About the duration of the event
interface EventSeason {
  Name: string;
  EventContentOpenTime: string;
  EventContentCloseTime: string;
  ExtensionTime: string
  EventContentTypeStr: string[]
}

// Bonus information for each student
interface EventBonus {
  EventContentItemType: number[];
  BonusPercentage: number[];
}

// Event Goods Information
interface EventCurrency {
  ItemUniqueId: number;
  EventContentItemType: number;
  UseShortCutContentType?: string
}

// Stage common structure
export interface Stage {
  Id: number;
  Name: string;
  StageEnterCostAmount: number;
  EventContentStageReward: StageReward[];
  RecommandLevel: number;
  BattleDuration: number;
  StageHintStr?: {
    DescriptionKr: string;
    DescriptionJp: string
    NameKr: string;
  };

}

// Stage compensation information
interface StageReward {
  RewardId: number;
  RewardAmount: number;
  RewardTagStr: string; // 'Event', 'Default', 'FirstClear_etc', etc.
  RewardParcelTypeStr: string
  RewardProb: number

}

// Shop Item Information
interface ShopItem {
  Id: number;
  PurchaseCountLimit: number;
  LocalizeEtc: LocalizeEtc;
  Goods?: GoodsInfo[]; // Items may be missing Goods
}

// Goods and rewards information for store items
interface GoodsInfo {
  ConsumeParcelId: number[];
  ConsumeParcelAmount: number[];
  ConsumeParcelTypeStr: string[];
  ParcelId: number[];
  ParcelAmount: number[];
  ParcelTypeStr: string[];
}

export interface LocalizeEtc {
  NameEn: string;
  NameKr: string;
  NameJp: string;
  NameTw: string;
  DescriptionEn: string;
  DescriptionKr: string;
  DescriptionJp: string;
  DescriptionTw: string;
}

// Icon metadata (name, etc.)
export interface IconInfo {
  Icon?: string;
  ItemCategory?: number;
  LocalizeEtc?: LocalizeEtc;
  TagsStr: string[]
  Rarity: number
}

export interface GachaElement {
  GachaGroupId: number;
  Id: number;
  ParcelAmountMax: number;
  ParcelAmountMin: number;
  ParcelId: number;
  ParcelType: number;
  Prob: number;
  Rarity?: number; // Optional based on data
  State: number;
  ParcelTypeStr: string;
}

export interface GachaGroupInfo {
  GroupType: number;
  Id: number;
  IsRecursive: boolean;
  GachaElement?: GachaElement[]; // Optional for recursive groups
  GachaElementRecursive?: GachaElement[]; // Optional for non-recursive groups
}

export interface Mission {
  Id: number;
  Description: {
    Kr: string;
    Jp: string;
    En: string;
    Tw: string
  };
  MissionRewardParcelType: number[];
  MissionRewardParcelId: number[];
  MissionRewardAmount: number[];
  MissionRewardParcelTypeStr: string[]
  CompleteConditionCount: number
  CompleteConditionParameter: number[]
  CategoryStr: string
}



export interface CardShopCostGoods {
  ConsumeParcelId: number[];
  ConsumeExtraAmount: number[];// [The cost of the first round, the cost of the second round...]
}


export interface CardShopItem {
  Id: number;
  Rarity: number; // 0: N, 1: R, 2: SR, 3: UR
  Prob: number;
  CostGoodsId: number;
  RewardParcelType: number[]; // parcelType[]
  RewardParcelTypeStr: string[]; // parcelType[]
  RewardParcelId: number[];
  RewardParcelAmount: number[];
  RefreshGroup: number
  CostGoods: CardShopCostGoods;
}


export interface TreasureRound {
  TreasureRound: number;
  TreasureRoundSize: [number, number]; // [width, height]
  CellCheckGoodsId: number;
  CellRewardId: number;
  RewardId: number[]; // List of treasure IDs included in this round
  RewardAmount: number[]; // the number of treasures each
  CellCheckGoods: GoodsInfo
}

export interface TreasureReward {
  Id: number;
  CellUnderImageWidth: number;
  CellUnderImageHeight: number;
  RewardParcelTypeStr: string[];
  RewardParcelId: number[];
  RewardParcelAmount: number[];
  LocalizeCodeId: string
  TreasureSizeIconPath: string
  TreasureSmallImagePath: string
}

export interface CellReward {
  Id: number;
  RewardParcelTypeStr: string[];
  RewardParcelId: number[];
  RewardParcelAmount: number[];
}

export interface BoxGachaShopItem {
  Round: number;
  IsPrize: boolean;
  GroupElementAmount: number;
  Goods: GoodsInfo[];
}

export interface BoxGachaManage {
  Round: number;
  IsLoop: boolean;
  Goods: GoodsInfo;
}


export interface Skill {
  Name: string;
  Desc: string;
  Parameters: string[][];
  Icon: string;
  Cost?: number[];
  Effects: any[]; // simplified to any[]
}

export interface EXSkill extends Skill {
  ExtraSkills?: Skill[]
}

// Define the type for the student's overall skill object
export interface Skills {
  Ex: EXSkill;
  Public: Skill;
  Passive: Skill;
  ExtraPassive: Skill;
  WeaponPassive: Skill;
  GearPublic?: Skill
}


export interface FortuneGachaGroup {
  FortuneGachaGroupId: number;
  LocalizeEtc: LocalizeEtc;
}

export interface FortuneGachaShopItem {
  Grade: number;
  Id: number;
  Prob: number;
  ProbModifyLimit: number;
  ProbModifyValue: number;
  RewardParcelAmount: number[];
  RewardParcelId: number[];
  RewardParcelType: number[];
  RewardParcelTypeStr: string[];
  CostGoods: GoodsInfo;
  FortuneGachaGroup: FortuneGachaGroup;
}

export interface FortuneGachaModify {
  ProbModifyStartCount: number;
  TargetGrade: number;
}


export interface TotalRewardItem {
  Id: number;
  RequiredEventItemAmount: number;
  RewardParcelAmount: number[];
  RewardParcelId: number[];
  RewardParcelType: number[];
  RewardParcelTypeStr: string[];
}


export interface DiceRaceNode {
  NodeId: number;
  EventContentDiceRaceNodeType: number; //0: Completion, 1: Reward, 2: Movement, 3: Special reward
  MoveForwardTypeArg?: number;
  RewardParcelTypeStr?: string[];
  RewardParcelId?: number[];
  RewardAmount?: number[];
}


export interface DiceRaceTotalReward {
  RequiredLapFinishCount: number;
  RewardParcelTypeStr: string[];
  RewardParcelId: number[];
  RewardParcelAmount: number[];
}

export interface DiceRaceInfo {
  DiceCostGoods: GoodsInfo
}

// MinigameDream Types
export interface MinigameDreamDailyPoint {
  UniqueId: number;
  TotalParameterMin: number;
  TotalParameterMax: number;
  DailyPointCoefficient: number;
  DailyPointCorrectionValue: number;
}

export interface MinigameDreamEnding {
  EndingId: number;
  DreamMakerEndingType: number; // 1: Normal, 2: Special
  DreamMakerEndingTypeStr: string;
  EndingCondition?: number[]; // Parameter types (1, 2, 3, 4)
  EndingConditionValue?: number[]; // Required values
  Order: number;
}

export interface MinigameDreamEndingReward {
  EndingId: number;
  DreamMakerEndingType: number; // 1: Normal, 2: Special
  DreamMakerEndingTypeStr: string;
  DreamMakerEndingRewardType: number; // 1: First, 2: Loop
  DreamMakerEndingRewardTypeStr: string;
  RewardParcelType: number[];
  RewardParcelId: number[];
  RewardParcelAmount: number[];
  RewardParcelTypeStr: string[];
  LocalizeEtc?: { Kr: string, Jp: string, En: string };
}

export interface MinigameDreamInfo {
  DreamMakerDays: number;
  DreamMakerActionPoint: number;
  DreamMakerParcelId: number; // Event Point Item ID
  DreamMakerParcelTypeStr: string;
  DreamMakerDailyPointId: number; // Daily Point Item ID (?) - May not be relevant for planner
  DreamMakerDailyPointParcelTypeStr: string;
  DreamMakerParameterTransfer: number; // Carryover percentage * 100 (e.g., 4000 = 40%)
  ScheduleCostGoodsId: number;
  ScheduleCostGoods: {
    ConsumeParcelId: number[];
    ConsumeParcelAmount: number[];
    ConsumeParcelTypeStr: string[];
  };
}

export interface MinigameDreamParameter {
  Id: number;
  ParameterType: number; // 1: Perf, 2: Sense, 3: Team, 4: Cond
  ParameterMin: number;
  ParameterMax: number;
  ParameterBase: number; // Initial value for first run
  ParameterBaseMax: number; // Carryover Cap (relevant for Condition)
  IconPath: string;
  LocalizeEtc?: { Kr: string, Jp: string, En: string };
}

export interface MinigameDreamSchedule {
  DreamMakerScheduleGroupId: number; // Links to schedule_result
  IconPath: string;
  LocalizeEtc?: { Kr: string, Jp: string, En: string };
}

export interface MinigameDreamScheduleResult {
  Id: number;
  DreamMakerScheduleGroup: number;
  DreamMakerResult: number;
  DreamMakerResultStr: string;
  Prob: number;
  RewardParameter: number[];
  RewardParameterAmount: number[];
  RewardParameterOperationType: number[];
  RewardParameterOperationTypeStr: string[];
  RewardParcelType?: number;
  RewardParcelId?: number;
  RewardParcelAmount?: number;
  RewardParcelTypeStr?: string;
}

export interface MinigameDreamData {
  daily_point: MinigameDreamDailyPoint[];
  ending: MinigameDreamEnding[];
  ending_reward: MinigameDreamEndingReward[];
  info: MinigameDreamInfo[];
  parameter: MinigameDreamParameter[];
  schedule: MinigameDreamSchedule[];
  schedule_result: MinigameDreamScheduleResult[];
}

export interface MinigameMission {
  Id: number;
  Category: number;
  CompleteConditionCount: number;
  CompleteConditionParameter: number[]; // [?, ParameterId]
  MissionRewardAmount: number[];
  MissionRewardParcelId: number[];
  MissionRewardParcelType: number[];
  MissionRewardParcelTypeStr: string[];
  DescriptionStr: {
    Kr: string;
    Jp: string;
    En: string;

  };
  CategoryStr: string;
}

export interface MinigameCCGInfo {
  CostParcelId: number;
  CostParcelTypeStr: string;
  CostParcelAmount: number;
}

export interface MinigameCCGRewardItem {
  MinPoint: number; // Stage number (e.g., 21 for 3-7)
  RewardParcelId: number;
  RewardParcelTypeStr: string;
  RewardParcelAmount: number;
}

export interface MinigameCCG {
  info: MinigameCCGInfo[];
  reward_item: MinigameCCGRewardItem[];
}

export interface ConcentrationInfo {
  BackImagePath: string;
  CardBoardPrefabs: string;
  CostGoodsId: number;
  InstantClearRound: number; // e.g. 10
  MaxCardOpenCount: number; // e.g. 12 (Max attempts)
  MaxCardPairCount: number; // e.g. 6
  CostGoods: {
    ConsumeParcelId: number[];
    ConsumeParcelAmount: number[];
    ConsumeParcelTypeStr: string[];
    // ... other fields if needed
  };
}

export interface ConcentrationCard {
  CardId: number;
  ImagePath: string;
  Rarity: number; // 0:N, 1:R, 2:SR, 3:SSR
}

export interface ConcentrationReward {
  UniqueId: number;
  Round: number;
  IsLoop: boolean;
  Rarity: number;
  RewardParcelType: number[];
  RewardParcelId: number[];
  RewardParcelAmount: number[];
  RewardParcelTypeStr: string[];
  ConcentrationRewardTypeStr: string; // 'PairMatch' | 'RoundRenewal'
}

export interface MinigameConcentration {
  info: ConcentrationInfo[];
  card: ConcentrationCard[];
  reward: ConcentrationReward[];
}

export type TransactionEntry = {
  source: string; // ex: 'shop_cost', 'farming', 'studentGrowth_cost'
  items: Record<string, { amount: number; isBonusApplied: boolean }>;
};


export interface CampaignReward {
  GroupId: number;
  IsDisplayed: boolean;
  RewardTag: number;
  StageRewardAmount: number;
  StageRewardId: number;
  StageRewardParcelType: number;
  StageRewardProb: number;
  RewardTagStr: "Default" | "Rare" | string; // 'Default', 'Rare', etc.
  StageRewardParcelTypeStr: "Equipment" | "GachaGroup" | "Item" | "Currency" | string;
}

export interface CampaignStage {
  Type: "Normal" | "Hard";
  Chapter: number;
  Stage: number;
  Name: string;
  RecommandLevel: number;
  StageEnterCostTypeStr: "Currency" | string;
  AP: number;
  Reward: CampaignReward[];
}

/**
 * Overall structure of the campaigns.json file.
 * Key: Stage ID (string)
 * Value: CampaignStage
 */
export type CampaignData = Record<string, CampaignStage>;