// app/components/common/HelpSidebar.tsx
import { useTranslation } from 'react-i18next';
import { useHelpStore } from '~/store/helpStore';
import { HiOutlineXMark, HiPlay } from 'react-icons/hi2';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCallback, useEffect } from 'react';

// ==========================================
// 1. Type definitions
// ==========================================
interface TourStep {
  element: string;
  popover: { title: string; description: string };
  actionOnNext?: 'click';
  delay?: number;
}

interface HelpGuide {
  title: string;
  description?: string;
  tour?: TourStep[];
}

const getVisibleElement = (selector: string): HTMLElement | string => {
  const elements = document.querySelectorAll(selector);
  for (const el of [...elements]) {
    // Elements set to display: none via CSS have an offsetWidth of 0.
    if ((el as HTMLElement).offsetWidth > 0) {
      return el as HTMLElement;
    }
  }
  return selector; // Return original string if not found
};

// ==========================================
// 2. Utility: Wait until the element appears in the DOM
// ==========================================
const waitForElement = (selector: string, timeout = 500): Promise<boolean> => {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(true);
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeout);
  });
};

const stringToElement = (str: string) => {
  return str.replace(/\n/g, '<br />');
};

// ==========================================
// 3. Main component
// ==========================================
export const HelpSidebar = () => {
  const { isOpen, activeHelpKey, closeSidebar, highlightedTour, setHighlightedTour } = useHelpStore();
  const { t: t_c } = useTranslation('common', { keyPrefix: 'helpSidebar' });
  const { t } = useTranslation('help');

  const startTour = useCallback(
    (tourSteps: TourStep[]) => {
      closeSidebar();

      let driverObj: any = null;

      driverObj = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        nextBtnText: t_c('driver.next'),
        prevBtnText: t_c('driver.prev'),
        doneBtnText: t_c('driver.done'),
        steps: tourSteps.map((step) => ({
          element: getVisibleElement(step.element),
          popover: { title: step.popover.title, description: stringToElement(step.popover.description) },
        })),

        onNextClick: async (element, step, options) => {
          const currentIdx = driverObj.getActiveIndex();
          const originalStep = tourSteps[currentIdx];

          if (originalStep.actionOnNext === 'click') {
            const targetEl = document.querySelector(originalStep.element) as HTMLElement;
            if (targetEl) targetEl.click();

            await new Promise((resolve) => setTimeout(resolve, 500));

            const nextStep = tourSteps[currentIdx + 1];
            if (nextStep && nextStep.element) {
              await waitForElement(nextStep.element);
            } else {
              await new Promise((resolve) => setTimeout(resolve, originalStep.delay || 300));
            }

            driverObj.moveNext();
          } else {
            driverObj.moveNext();
          }
        },
      });

      setTimeout(() => {
        driverObj.drive();
      }, 150);
    },
    [closeSidebar, t],
  );

  const keys = Array.isArray(activeHelpKey) ? activeHelpKey : activeHelpKey ? [activeHelpKey] : [];
  const guidesWithMeta = keys.flatMap((key) => {
    const guideData = t(key, { returnObjects: true, defaultValue: [] } as any) as HelpGuide[];
    return guideData.map((guide, idx) => ({ ...guide, parentKey: key, originalIndex: idx }));
  });
  const hasGuides = guidesWithMeta.length > 0;

  useEffect(() => {
    if (isOpen && highlightedTour) {
      const timer = setTimeout(() => {
        const targetId = `guide-${highlightedTour.key}-${highlightedTour.index}`;
        const el = document.getElementById(targetId);

        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });

          el.classList.add('border-blue-500', 'dark:border-blue-400');
          el.classList.remove('border-transparent');
        }

        setHighlightedTour(null);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isOpen, highlightedTour, setHighlightedTour]);

  if (!isOpen) return null;

  return (
    <>
      {/* Background overlay (cleaner transparency) */}
      <div className="fixed inset-0 bg-slate-900/20 dark:bg-black/40 z-40 transition-opacity backdrop-blur-[1px]" onClick={closeSidebar} />

      {/* Right sidebar panel (remove rounded shadow, express depth with thin left border) */}
      <div className="fixed inset-y-0 right-0 w-[320px] bg-white dark:bg-neutral-900 shadow-xl border-l border-slate-200 dark:border-neutral-800 z-50 flex flex-col transition-transform">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-200 dark:border-neutral-800 shrink-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t_c('title')} (BETA)</h2>
          <button onClick={closeSidebar} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            <HiOutlineXMark className="text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-6">
          {!hasGuides ? (
            <div className="text-center text-slate-500 dark:text-neutral-500 mt-10 text-sm">{t_c('noGuide')}</div>
          ) : (
            guidesWithMeta.map((guide, idx) => (
              <div
                id={`guide-${guide.parentKey}-${guide.originalIndex}`}
                key={idx}
                className="flex flex-col gap-2 p-4 rounded-sm border border-transparent bg-slate-50 dark:bg-neutral-800/50 transition-colors duration-500"
              >
                <h3 className="font-semibold text-sm text-slate-900 dark:text-neutral-100">{guide.title}</h3>

                {guide.description && <p className="text-xs text-slate-500 dark:text-neutral-400 leading-relaxed">{guide.description}</p>}

                {guide.tour && guide.tour.length > 0 && (
                  <button
                    onClick={() => startTour(guide.tour!)}
                    className="mt-3 flex items-center justify-center gap-2 w-full py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-medium rounded-sm transition-colors"
                  >
                    <HiPlay className="text-sm" /> {t_c('startGuide')}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};
