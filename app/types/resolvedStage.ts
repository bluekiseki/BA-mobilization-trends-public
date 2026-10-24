export interface ResolvedStage {
  id: number;
  type: 'Normal' | 'Hard';
  name: string;
  chapter: number;
  stageNum: number;
  ap: number;
  drops: Record<string, number>;
}
