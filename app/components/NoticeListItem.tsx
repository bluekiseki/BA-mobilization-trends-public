import { Link } from 'react-router';
import { RiFileLine, RiVideoLine } from 'react-icons/ri';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import { getRelativeTime } from '~/utils/time';
import { decodeHtmlEntities } from '~/utils/decodeHtmlEntities';
import type { Notice } from '~/types/notices';

export const REGION_COLORS: Record<string, string> = {
  KR: 'text-rose-600 dark:text-rose-400',
  JP: 'text-violet-600 dark:text-violet-400',
  Global: 'text-blue-600 dark:text-blue-400',
  TW: 'text-amber-600 dark:text-amber-400',
};

interface NoticeListItemProps {
  post: Notice;
  to: string;
  sort: string;
  locale: Locale;
  variant?: 'widget' | 'list';
}

export function NoticeListItem({ post, to, sort, locale, variant = 'list' }: NoticeListItemProps) {
  const { t } = useTranslation('notices');
  const isWidget = variant === 'widget';

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 transition-colors group ${
        isWidget ? 'px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-700/60' : 'py-2.5 -mx-2 px-2 hover:bg-neutral-50 dark:hover:bg-neutral-900/30'
      }`}
    >
      <div className={`relative shrink-0 rounded-lg overflow-hidden ${isWidget ? 'w-14 h-14 bg-neutral-100 dark:bg-neutral-700' : 'w-12 h-12 bg-neutral-100 dark:bg-neutral-900'}`}>
        {post.thumbnail ? (
          <img src={post.thumbnail} className="w-full h-full object-cover" alt="" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <RiFileLine size={isWidget ? 14 : 18} className="text-neutral-300 dark:text-neutral-700" />
          </div>
        )}
        {post.type === 'VIDEO' && (
          <div className={`absolute bottom-1 right-1 bg-black/70 rounded ${isWidget ? 'px-0.5 py-0.5' : 'px-1 py-0.5'}`}>
            <RiVideoLine size={isWidget ? 8 : 10} className="text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className={`flex items-baseline ${isWidget ? 'gap-1.5' : 'gap-2'}`}>
          <span className={`font-black uppercase shrink-0 ${isWidget ? 'text-xs' : 'text-[10px]'} ${REGION_COLORS[post.region] ?? 'text-neutral-400'}`}>{post.region.slice(0, 2)}</span>
          <h3
            className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
            title={decodeHtmlEntities(post.title)}
          >
            {decodeHtmlEntities(post.title)}
          </h3>
        </div>
        <div className="flex items-center mt-0.5 justify-between sm:justify-start">
          <p className={`text-neutral-400 dark:text-neutral-600 truncate ${isWidget ? 'text-xs' : 'text-[11px]'}`} title={post.category}>
            {post.category}
          </p>
          <p className="sm:hidden shrink-0 ml-2 text-[11px] font-bold text-neutral-400 dark:text-neutral-500 tabular-nums whitespace-nowrap">
            {sort === 'new' ? getRelativeTime(post.api_create_date, locale) : getRelativeTime(post.api_modify_date, locale)}
          </p>
        </div>
      </div>

      <div className="shrink-0 text-right hidden sm:block">
        <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 tabular-nums whitespace-nowrap">
          {sort === 'new' ? getRelativeTime(post.api_create_date, locale) : getRelativeTime(post.api_modify_date, locale)}
        </p>
        <p className="text-[10px] text-neutral-300 dark:text-neutral-700">{sort === 'new' ? t('postedAt') : t('modifiedAt')}</p>
      </div>
    </Link>
  );
}
