import BannerPlanner from '~/components/gacha/BannerPlanner'; // Reuse existing components
import type { BannerStrategy, StudentStrategyConfig } from '~/types/gacha';
import type { BannerPeriod } from '~/utils/gachaData';

interface Props {
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  portraitMap: Record<number, string>;
  onUpdateStrategy: (id: string, updates: Partial<BannerStrategy>) => void;
  onUpdateStudentConfig: (bid: string, sid: number, updates: Partial<StudentStrategyConfig>) => void;
  server: 'KR' | 'JP';
}

export default function StrategyTab(props: Props) {
  return (
    <div className="">
      <BannerPlanner
        banners={props.banners}
        strategies={props.strategies}
        portraitMap={props.portraitMap}
        onUpdateStrategy={props.onUpdateStrategy}
        onUpdateStudentConfig={props.onUpdateStudentConfig}
        currentServer={props.server}
      />
    </div>
  );
}
