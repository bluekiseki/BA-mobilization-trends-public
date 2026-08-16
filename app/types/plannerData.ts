// app/types/plannerData.ts
import type { Student as StudentBase } from './data';
// src/types/student.ts
export interface Student extends StudentBase {
  Name: string;
  SearchTags: string[];
  // Position: "Back" | "Front" | "Middle";
  // SquadType: "Main" | "Support";
  // TacticRole: "DamageDealer" | "Healer" | "Supporter" | "Tanker" | "Vehicle";
  School: string;
  Club: string;
  BulletType: 'Explosion' | 'Mystic' | 'Pierce' | 'Sonic' | 'Chemical';
  PotentialMaterial: number;
  SkillExMaterial: number[][];
  SkillExMaterialAmount: number[][];
  SkillMaterial: number[][];
  SkillMaterialAmount: number[][];
  StarGrade: number;
  Skills: Skills;
  Equipment: ['Hat' | 'Shoes' | 'Gloves', 'Hairpin' | 'Bag' | 'Badge', 'Watch' | 'Charm' | 'Necklace'];
  FavorItemTags: string[];
  FavorItemUniqueTags: string[];
  ArmorType: 'LightArmor' | 'HeavyArmor' | 'Unarmed' | 'ElasticArmor' | 'CompositeArmor';
  PathName: string;
  StreetBattleAdaptation: 0 | 1 | 2 | 3 | 4 | 5;
  OutdoorBattleAdaptation: 0 | 1 | 2 | 3 | 4 | 5;
  IndoorBattleAdaptation: 0 | 1 | 2 | 3 | 4 | 5;
  Gear:
    | Record<string, never>
    | {
        Name: string;
        Desc: string;
        TierUpMaterial: number[][];
        TierUpMaterialAmount: number[][];
      };
  WeaponType: 'AR' | 'FT' | 'GL' | 'HG' | 'MG' | 'MT' | 'RG' | 'RL' | 'SG' | 'SMG' | 'SR';
  // Only the terrain-adaptation-bonus fields are typed here (used by the student scanner's
  // matching pipeline); the raw SchaleDB data also carries Name/Desc/AttackPower/etc.
  Weapon?: { AdaptationType?: 'Street' | 'Outdoor' | 'Indoor'; AdaptationValue?: number } | null;
  StyleId?: number;
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
  bonus?: Record<string, EventBonus>; // key: student ID
  currency?: EventCurrency[];
  stage?: {
    stage?: Stage[];
    story?: Stage[];
    challenge?: Stage[];
  };
  shop?: Record<string, ShopItem[]>; // key: shop ID
  icons: IconInfos;
  shop_info?: ShopInfo[];
  mission?: Mission[];
  card_shop?: CardShopItem[];
  treasure?: {
    info: {
      LoopRound: number;
      TitleLocalize: string;
      TreasureBgimagePath: string;
      UsePrefabName: string;
    }[];
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
  };
  total_reward?: TotalRewardItem[];
  dice_race?: {
    info: DiceRaceInfo[];
    porb: {
      CostItemAmount: number;
      CostItemId: number;
      DiceResult: number;
      EventContentDiceRaceResultType: number;
      Prob: number;
    }[]; // 'porb'
    total_reward: DiceRaceTotalReward[];
    race_node: DiceRaceNode[];
  };
  minigame_mission?: MinigameMission[];
  minigame_dream?: MinigameDreamData;
  minigame_ccg?: MinigameCCG;
  concentration?: MinigameConcentration;
  minigame_defense?: MinigameDefense;
  clue?: ClueSearchData;
  field?: FieldEventData;
  interactive_world_raid?: {
    interactive_world_raid_stage: Record<string, InteractiveWorldRaidStage>;
    interactive_world_raid_boss_group: Record<string, InteractiveWorldRaidBossGroup>;
    world_raid_stage_reward: Record<string, WorldRaidStageReward[]>;
  };
  minigame_road_puzzle?: RoadPuzzleData;
  minigame_janken?: MinigameJanken;
}

export interface RoadPuzzleData {
  info: RoadPuzzleInfo[];
  road_round: RoadPuzzleRound[];
  reward?: RoadPuzzleRewardItem[];
  additional_reward?: RoadPuzzleAdditionalRewardItem[];
  rail_set_reward?: RoadPuzzleRewardItem[];
  rail_tile: RoadPuzzleRailTile[];
  map: RoadPuzzleMap[];
}

export interface RoadPuzzleInfo {
  EventUseCostId: number;
  InstantClearRound: number;
  RailSetRewardId: number;
  CostGoods: {
    ConsumeParcelId: number[];
    ConsumeParcelAmount: number[];
    ConsumeParcelTypeStr: string[];
  };
}

export interface RoadPuzzleRound {
  Round: number;
  MapGroupId: number;
  IsLoop: boolean;
  RoundReward: number;
  UniqueId: number;
  AdditionalRewardId?: number[];
  AdditionalRewardAmount?: number[];
}

export interface RoadPuzzleRewardItem {
  UniqueId: number;
  RewardParcelId: number[];
  RewardParcelAmount: number[];
  RewardParcelTypeStr: string[];
}

// additional_reward uses scalar fields (not arrays)
export interface RoadPuzzleAdditionalRewardItem {
  UniqueId: number;
  RewardParcelId: number;
  RewardParcelAmount: number;
  RewardParcelTypeStr: string;
}

export interface RoadPuzzleRailTile {
  UniqueId: number;
  RailTileType: 1 | 2 | 3;
  PrefabName: string;
  OriginalTile: boolean;
}

export interface RoadPuzzleMap {
  UniqueId: number;
  MapGroupId: number;
  Map: string;
  AvailableRailTile: number[];
  AvailableRailTileAmount: number[];
  // OriginalTileCount: number[];
  TrainSpeed: number;
}

type ParcelType = 'Currency' | 'Equipment' | 'Item' | 'GachaGroup' | 'Furniture' | 'Emblem';

export interface IconInfos {
  Item: Record<string, IconInfo>; // key: Item ID
  Equipment: Record<string, IconInfo>; // key: Item ID
  Furniture?: Record<string, IconInfo>; // key: Item ID
  Currency: Record<string, IconInfo>; // key: Item ID
  Emblem?: Record<string, IconInfo>;
  GachaGroup?: Record<string, GachaGroupInfo>;
}

// About the duration of the event
export interface EventSeason {
  Name: string;
  EventContentOpenTime: string;
  EventContentCloseTime: string;
  ExtensionTime: string;
  EventContentTypeStr: string[];
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
  UseShortCutContentType?: string;
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
    DescriptionJp: string;
    NameKr: string;
  };
}

// Stage compensation information
export interface StageReward {
  RewardId: number;
  RewardAmount: number;
  RewardTagStr: string; // 'Event', 'Default', 'FirstClear_etc', etc.
  RewardParcelTypeStr: string;
  RewardProb: number;
}

// Shop Item Information
interface ShopItem {
  Id: number;
  PurchaseCountLimit: number;
  LocalizeEtc: LocalizeEtc;
  Goods?: GoodsInfo[]; // Items may be missing Goods
  SalePeriodFrom?: string;
  SalePeriodTo?: string;
}

// Goods and rewards information for store items
export interface GoodsInfo {
  ConsumeParcelId: number[];
  ConsumeParcelAmount: number[];
  ConsumeParcelTypeStr: string[];
  ConsumeExtraStep?: number[];
  ConsumeExtraAmount?: number[];
  ParcelId: number[];
  ParcelAmount: number[];
  ParcelTypeStr: ParcelType[];
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
  TagsStr: string[];
  Rarity: number;
  UsingResultParcelTypeStr?: 'None' | 'GachaGroup';
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
    Tw: string;
  };
  MissionRewardParcelType: number[];
  MissionRewardParcelId: number[];
  MissionRewardAmount: number[];
  MissionRewardParcelTypeStr: string[];
  CompleteConditionCount: number;
  CompleteConditionParameter: (number | string)[];
  CategoryStr: string;
  CompleteConditionType: number;
}

export interface CardShopCostGoods {
  ConsumeParcelId: number[];
  ConsumeExtraAmount: number[]; // [The cost of the first round, the cost of the second round...]
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
  RefreshGroup: number;
  CostGoods: CardShopCostGoods;
}

export interface TreasureRound {
  TreasureRound: number;
  TreasureRoundSize: [number, number]; // [width, height]
  CellCheckGoodsId: number;
  CellRewardId: number;
  RewardId: number[]; // List of treasure IDs included in this round
  RewardAmount: number[]; // the number of treasures each
  CellCheckGoods: GoodsInfo;
}

export interface TreasureReward {
  Id: number;
  CellUnderImageWidth: number;
  CellUnderImageHeight: number;
  RewardParcelTypeStr: string[];
  RewardParcelId: number[];
  RewardParcelAmount: number[];
  LocalizeCodeId: string;
  TreasureSizeIconPath: string;
  TreasureSmallImagePath: string;
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
  Effects: {
    Type: string;
    Block: 0 | 1;
    CriticalCheck: string;
    Hits: number[];
    DescParamId: number;
    Scale: number[];
  }[]; // simplified to any[]
}

export interface EXSkill extends Skill {
  ExtraSkills?: Skill[];
}

// Define the type for the student's overall skill object
export interface Skills {
  Ex: EXSkill;
  Public: Skill;
  Passive: Skill;
  ExtraPassive: Skill;
  WeaponPassive: Skill;
  GearPublic?: Skill;
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

export type DiceRaceNode = {
  NodeId: number;
  EventContentDiceRaceNodeType: number;
  MoveForwardTypeArg: number;
} & (
  | {
      RewardParcelTypeStr: ParcelType[];
      RewardParcelId: number[];
      RewardAmount: number[];
    }
  | {
      RewardParcelTypeStr?: never;
      RewardParcelId?: never;
      RewardAmount?: never;
    }
);

export interface DiceRaceTotalReward {
  RequiredLapFinishCount: number;
  RewardParcelTypeStr: ParcelType[];
  RewardParcelId: number[];
  RewardParcelAmount: number[];
}

export interface DiceRaceInfo {
  DiceCostGoods: GoodsInfo;
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
  LocalizeEtc?: { Kr: string; Jp: string; En: string };
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
  LocalizeEtc?: { Kr: string; Jp: string; En: string };
}

export interface MinigameDreamSchedule {
  DreamMakerScheduleGroupId: number; // Links to schedule_result
  IconPath: string;
  LocalizeEtc?: { Kr: string; Jp: string; En: string };
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
  Description: number;
  DescriptionStr: {
    Kr: string;
    Jp: string;
    En: string;
    Tw: string;
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

export interface MinigameDefenseInfo {
  DefenseBattleMultiplierMax: number;
  DefenseBattleParcelId: number;
  DefenseBattleParcelType: number;
  DefenseBattleParcelTypeStr: string;
}

export interface MinigameDefenseStage {
  Id: number;
  Name: string;
  StageNumber: number;
  StageDisplay: number;
  StageDifficulty: number; // 1: Story, 2: Normal, 3: Challenge
  RecommandLevel: number;
  StageEnterCostId: number;
  StageEnterCostAmount: number;
  StageEnterCostType: number;
  EventContentStageReward: StageReward[];
  BattleDuration: number;
}

export interface MinigameDefense {
  info: MinigameDefenseInfo[];
  stage: MinigameDefenseStage[];
}

// MinigameJanken Types
export interface MinigameJankenInfo {
  CostParcelId: number;
  CostParcelType: number;
  CostParcelTypeStr: string;
  ChallengeMultipleUnlockScore: number;
  MultipleMax: number;
  ScoreMaxStack: number;
  EquipmentMaxTier: number;
  CostParcelEquipUpgradeId: number;
  CostParcelEquipUpgradeType: number;
  CostParcelEquipUpgradeTypeStr?: string;
  NeedItemAmountT2: number;
  NeedItemAmountT3: number;
  NeedItemAmountT4: number;
  NeedItemAmountT5: number;
}

export interface MinigameJankenStage {
  Id: number;
  Name: string;
  StageNumber: number;
  StageDisplay: number;
  JankenStageType: number; // 1: Story, 2: Normal, 3: Challenge
  StageEnterCostId: number;
  StageEnterCostAmount: number;
  StageEnterCostType: number;
  EventContentStageRewardId: number;
  EventContentStageReward?: StageReward[];
  StarGoal: number[];
  StarGoalAmount: number[];
  PrevStageId: number;
}

export interface MinigameJankenRewardScore {
  Id: number;
  ScoreRewardId: number[];
  StackedScore: number[];
}

export interface MinigameJankenRewardScoreItem {
  Id: number;
  ParcelUniqueId: number[];
  Amount: number[];
  ParcelType: number[];
  ParcelTypeStr: string[];
}

export interface MinigameJanken {
  info: MinigameJankenInfo[];
  stage: MinigameJankenStage[];
  reward_score: MinigameJankenRewardScore[];
  reward_score_item: MinigameJankenRewardScoreItem[];
}

// ClueSearch Types
export interface ClueSearchHintlocalize {
  DescriptionJp: string;
  DescriptionKr: string;
  DescriptionEn?: string | null;
  DescriptionTw?: string | null;
  Key: number;
  NameJp: string;
  NameKr: string;
  NameEn?: string | null;
  NameTw?: string | null;
}

export interface ClueSearchClue {
  ClueId: number;
  ClueImagePath: string;
  HintUse: boolean;
  Hintlocalizeid: number;
  RewardParcelAmount: number[];
  RewardParcelId: number[];
  RewardParcelType: number[];
  RewardParcelTypeStr: string[];
  SlotClueImagePath: string;
  Hintlocalize: ClueSearchHintlocalize;
  LocalizeEtc: ClueSearchHintlocalize & { Key: number };
}

export interface ClueSearchRoundReward {
  Id: number;
  RewardParcelAmount: number[];
  RewardParcelId: number[];
  RewardParcelType: number[];
  RewardParcelTypeStr: string[];
}

export interface ClueSearchRound {
  ClearPageImagePath: string;
  ClearlocalizeId: number;
  ClueCostAmount: number[];
  ClueId: number[];
  ClueSlotNumber: number[];
  HintlocalizeId: number;
  IsLoop: boolean;
  Localizeld: number;
  RewardId: number;
  Round: number;
  TargetImagePath: string;
  Reward: ClueSearchRoundReward;
}

export interface ClueSearchInfo {
  ClueBgimagePath: string;
  TitleLocalize: number;
  UsePrefabName: string;
}

export interface ClueSearchData {
  clue: ClueSearchClue[];
  info: ClueSearchInfo[];
  round: ClueSearchRound[];
}

// FieldEvent Types
interface FieldRewardItem {
  RewardProb: number;
  RewardParcelType: string;
  RewardId: number;
  RewardAmount: number;
}

interface FieldQuestNameKey {
  Jp: string;
  Kr: string;
  NameEn: string;
  NameTw: string;
  Key: number;
}

interface FieldQuestDescKey {
  Jp: string;
  Kr: string;
  DescriptionEn: string | null;
  DescriptionTw: string | null;
  Key: number;
}

export interface FieldQuestItem {
  UniqueId: number;
  FieldSeasonId: number;
  IsDaily: boolean;
  FieldDateId: number;
  QuestNamKeyData: FieldQuestNameKey;
  QuestDescKeyData: FieldQuestDescKey;
  Reward: FieldRewardItem[];
}

export interface FieldMasteryManageItem {
  FieldSeason: number;
  LevelId: number;
  LocalizeEtcData: {
    NameJp: string;
    NameKr: string;
    NameEn: string;
  };
}

export interface FieldMasteryLevelItem {
  Level: number;
  Id: number[];
  Exp: number[];
  TotalExp: number[];
  RewardId?: number[];
  Reward?: FieldRewardItem[];
}

export interface FieldContentStageRewardItem {
  RewardTag: string; // 'FirstClear' | 'Default' | 'ThreeStar' | etc.
  RewardProb: number; // 0~10000
  RewardParcelType: string;
  RewardId: number;
  RewardAmount: number;
}

export interface FieldEventData {
  FieldQuest: FieldQuestItem[];
  FieldMasteryManage: FieldMasteryManageItem[];
  FieldMasteryLevel: FieldMasteryLevelItem[];
  FieldContentStageReward: Record<string, FieldContentStageRewardItem[]>;
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
  RewardTagStr: 'Default' | 'Rare' | 'FirstClear' | 'EventBonus' | 'ThreeStar'; // 'Default', 'Rare', etc.
  StageRewardParcelTypeStr: ParcelType;
}

export interface CampaignStage {
  Type: 'Normal' | 'Hard';
  Chapter: number;
  Stage: number;
  Name: string;
  RecommandLevel: number;
  StageEnterCostTypeStr: 'Currency' | ParcelType;
  AP: number;
  Reward: CampaignReward[];
}

/**
 * Overall structure of the campaigns.json file.
 * Key: Stage ID (string)
 * Value: CampaignStage
 */
export type CampaignData = Record<string, CampaignStage>;

export interface ContentItem {
  id: string;
  type: 'raid' | 'eraid' | 'multifloor';
  prefix: string;
  season: number;
  typeLabel: string;
  bossTitle: string;
  date: string;
  endDate?: string;
}

// ===================================================================
// InteractiveWorldRaid Types
// ===================================================================

export interface WorldRaidStageReward {
  ClearStageRewardAmount: number;
  ClearStageRewardParcelType: number;
  ClearStageRewardParcelUniqueId: number;
  ClearStageRewardParcelTypeStr: string;
  ClearStageRewardProb: number;
  IsClearStageRewardHideInfo: boolean;
}

export interface InteractiveWorldRaidStage {
  Id: number;
  WorldRaidBossGroupId: number;
  WorldRaidDifficulty: number;
  IsRaidScenarioBattle: boolean;
  DamageToWorldBoss: number;
  RaidEnterAmount: number;
  ReEnterAmount: number;
  RaidBattleEndRewardGroupId: number;
  RaidRewardGroupId: number;
  PortraitPath: string;
}

export interface InteractiveWorldRaidBossGroup {
  Id: number;
  WorldRaidBossGroupId: number;
  WorldBossName: string;
  WorldBossHp: number;
  IsSeasonFinalBoss: boolean;
  WorldBossPopupPortrait: string;
  WorldBossPopupNameTexture: string;
}
