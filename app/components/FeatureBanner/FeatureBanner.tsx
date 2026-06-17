import { useState, useEffect, useMemo, useRef } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';

import bannerDataAll from './bannerData.json';
import { localeLink } from '~/utils/localeLink';

const STORAGE_KEY = 'hideInlinePromoUntil';

export default function InlinePromoBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language as Locale;

  const [hideForDay, setHideForDay] = useState(true);

  const [shuffledBanners, setShuffledBanners] = useState<typeof bannerDataAll.ko>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowAmount, setOverflowAmount] = useState(0);

  const bannerData = useMemo(() => {
    return bannerDataAll[locale] || [];
  }, [locale]);

  // 1. Shuffle on initial load
  useEffect(() => {
    const hideUntil = localStorage.getItem(STORAGE_KEY);
    const hideSession = sessionStorage.getItem('hideInlinePromoSession');
    const now = new Date().getTime();

    if ((!hideUntil || now > parseInt(hideUntil, 10)) && !hideSession) {
      const shuffled = [...bannerData].sort(() => Math.random() - 0.5);
      setShuffledBanners(shuffled);
      setCurrentIndex(0);
      setIsVisible(true);
    }
  }, [bannerData]);

  // 2. 10-second timer
  useEffect(() => {
    if (!isVisible || shuffledBanners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % shuffledBanners.length);
    }, 10000); // Change every 10 seconds
    return () => clearInterval(timer);
  }, [isVisible, shuffledBanners.length]);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const textWidth = textRef.current.scrollWidth;

      if (textWidth > containerWidth) {
        setOverflowAmount(textWidth - containerWidth + 20);
      } else {
        setOverflowAmount(0);
      }
    }
  }, [currentIndex, shuffledBanners]); // Recalculate whenever the banner changes

  const promo = shuffledBanners[currentIndex];

  if (!isVisible || !promo) return null;

  const handleClose = () => {
    if (hideForDay) {
      const hideUntil = new Date().getTime() + 7 * 24 * 60 * 60 * 1000; // 7 days
      localStorage.setItem(STORAGE_KEY, hideUntil.toString());
    } else {
      sessionStorage.setItem('hideInlinePromoSession', 'true');
    }
    setIsVisible(false);
  };

  return (
    <div className="relative w-full px-2 py-1 bg-neutral-50/50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-700/50 rounded text-xs text-neutral-500 dark:text-neutral-400 overflow-hidden">
      <style>{`
        @keyframes slideUpFade {
          0% { transform: translateY(15px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes scrollLeft {
          0%, 20% { transform: translateX(0); } /* Wait for the first 2 seconds */
          80%, 100% { transform: translateX(var(--scroll-dist)); } /* Scroll for 6 seconds, then wait for the final 2 seconds */
        }
      `}</style>

      <div className="flex items-center justify-between w-full max-w-7xl mx-auto h-[18px]">
        {/* Left: Headline container */}
        <div className="flex-1 overflow-hidden h-full flex items-center pr-4" ref={containerRef}>
          <Link
            key={currentIndex}
            to={localeLink(locale, promo.link)}
            state={
              promo.type === 'tour'
                ? {
                    tourKey: String(promo.tourCategory) + (promo.tourKey ? `.${promo.tourKey}` : ''),
                    tourIndex: promo.tourIndex,
                  }
                : undefined
            }
            className="animate-slide-up whitespace-nowrap flex items-center hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
            style={
              overflowAmount > 0
                ? ({
                    // Add scroll animation only for long text
                    animation: `slideUpFade 0.6s ease-out forwards, scrollLeft 10s linear forwards`,
                    '--scroll-dist': `-${overflowAmount}px`,
                  } as React.CSSProperties)
                : {}
            }
          >
            <span ref={textRef} className="inline-flex items-center">
              {promo.title}
              <FaExternalLinkAlt className="inline-block ml-1.5 mb-px text-[10px] opacity-70 shrink-0" />
            </span>
          </Link>
        </div>

        {/* Right: Checkbox and close button */}
        <div className="flex items-center gap-3 ml-0 md:ml-3 shrink-0 bg-neutral-50 dark:bg-neutral-800/0 relative z-10 pl-2">
          <label className="hidden md:flex items-center gap-1 cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
            <input
              type="checkbox"
              className="w-3 h-3 rounded border-neutral-300 text-neutral-600 focus:ring-neutral-500 dark:border-neutral-600 dark:bg-neutral-600"
              checked={hideForDay}
              onChange={(e) => setHideForDay(e.target.checked)}
            />
            <span className="select-none">{t('promoBanner.noMoreThisWeek')}</span>
          </label>

          <button onClick={handleClose} className="hover:text-neutral-900 dark:hover:text-white transition-colors" aria-label="close">
            <HiOutlineXMark className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
