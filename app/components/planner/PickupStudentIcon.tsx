import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import type { Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';

const BULLET_COLORS: Record<string, string> = {
  Explosion: '#b62915',
  Pierce: '#bc8800',
  Mystic: '#206d9b',
  Sonic: '#9a46a8',
  Chemical: '#137973',
};

interface PickupStudentIconProps {
  portrait?: string;
  name: string;
  studentId: number;
  rerun?: boolean;
  fest?: boolean;
  limited?: boolean;
  bulletType?: 'Explosion' | 'Mystic' | 'Pierce' | 'Sonic' | 'Chemical';
  locale: Locale;
}

export function PickupStudentIcon({ portrait, name, studentId, rerun, fest, limited, bulletType, locale }: PickupStudentIconProps) {
  const { t: tc } = useTranslation('common');

  return (
    <Tooltip placement="top" overlay={<span className="text-xs font-bold">{name}</span>} mouseEnterDelay={0.05}>
      <Link to={localeLink(locale, '/charts/jp/heatmap')} state={{ studentId }} className="relative w-14 h-14 shrink-0 overflow-hidden rounded-lg block bg-neutral-100 dark:bg-neutral-800">
        {portrait && <img src={`data:image/webp;base64,${portrait}`} alt={name} className="w-full h-full object-cover object-top" />}
        {bulletType && <div className="h-1 w-full absolute bottom-0" style={{ backgroundColor: BULLET_COLORS[bulletType] }} />}
        <div className="absolute top-0 -left-0.5 -right-0.5 flex justify-between px-0.5 pointer-events-none">
          {rerun ? <span className="bg-blue-600/90 text-white text-[9px] font-black px-1 rounded-sm backdrop-blur-[1px] whitespace-nowrap">{tc('rerun')}</span> : <span />}
          <div className="flex gap-px">
            {fest && <span className="bg-amber-500/90 text-white text-[8px] font-black px-1 rounded-sm whitespace-nowrap">{tc('fest')}</span>}
            {!fest && limited && <span className="bg-pink-600/90 text-white text-[8px] font-black px-1 rounded-sm whitespace-nowrap">{tc('limited')}</span>}
          </div>
        </div>
      </Link>
    </Tooltip>
  );
}
