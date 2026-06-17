// app/components/planner/common/Icon.tsx
import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { EventData, GachaElement, GachaGroupInfo, IconData, IconInfo, StudentData, StudentPortraitData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { getlocaleMethond, getLocalizeEtcName } from './locale';
import { useIsDarkState } from '~/store/isDarkState';
import { calculateExpectedContents } from './gachaIcon';
import { GiftStudentSheet, type GiftEntry, buildGiftToStudentsMap } from '../StudentGrowth/GiftStudentSheet';

const rarityColors: Record<'dark' | 'light', Record<number, string>> = {
  light: {
    0: 'rgb(189, 197, 208)',
    1: 'rgb(144, 186, 236)',
    2: 'rgb(214, 173, 129)',
    3: 'rgb(168, 138, 236)',
  },
  dark: {
    0: '#8c939e',
    1: '#658dbf',
    2: '#a87d51',
    3: '#7a5bbe',
  },
};

export interface ItemIconProps {
  type: string;
  itemId: string;
  amount: number | string;
  size: number;
  eventData: EventData;
  iconData: IconData;
  label?: string | null;
  labelColor?: string; //Label Background Color (Tailwind CSS Class)
  allStudents?: StudentData;
  studentPortraits?: StudentPortraitData;
  forceDecimal?: boolean;
  decimalPlaces?: number;
}

function roundTo(n: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

// numeric abbreviation helper
const formatAmount = (amount: number, forceDecimal: boolean = false, decimalPlaces?: number): string => {
  if (amount >= 10_000_000) {
    return (amount / 1_000_000).toFixed(0).replace(/\.0$/, '') + 'M';
  }
  if (amount >= 10_000) {
    return (amount / 1_000).toFixed(0).replace(/\.0$/, '') + 'k';
  }

  if (amount >= 1_000) return amount.toFixed(0);
  if (amount >= 1_00) return amount.toFixed(0);
  if (amount >= 1_0) return `${roundTo(amount, 1)}`;
  if (amount >= 1) return `${roundTo(amount, 2)}`;

  if (amount < 1 && forceDecimal) {
    return roundTo(amount, decimalPlaces ?? 2).toString();
  }

  if (amount < 1 && amount > 0.01) return `${roundTo(amount * 100, 1)}%`;
  return amount.toLocaleString();
};

interface GachaContentItem {
  iconSrc: string | undefined;
  name: string;
  expectedAmount: number;
  rarity: number;
}

interface TooltipContentProps {
  itemInfo: IconInfo | GachaGroupInfo;
  amount: number | string;
  style: CSSProperties;
  locale: Locale;
  gachaContents?: GachaContentItem[];
  forceDecimal?: boolean;
  decimalPlaces?: number;
}

// Use the props type in forwardRef and the function signature
const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>((props, ref) => {
  // Destructure props inside the function body
  const { itemInfo, amount, style, locale, gachaContents, forceDecimal = false, decimalPlaces } = props;

  const { isDark } = useIsDarkState();

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Define rarity colors locally or import them
  const rarityColors: Record<'dark' | 'light', Record<number, string>> = {
    light: {
      0: 'rgb(189, 197, 208)',
      1: 'rgb(144, 186, 236)',
      2: 'rgb(214, 173, 129)',
      3: 'rgb(168, 138, 236)',
    },
    dark: { 0: '#8c939e', 1: '#658dbf', 2: '#a87d51', 3: '#7a5bbe' },
  };
  const bgColor = isDark === 'dark' ? 'bg-neutral-900/90' : 'bg-neutral-800/90';

  if (!isClient) {
    return null;
  }

  return ReactDOM.createPortal(
    <div ref={ref} style={style} className={`fixed w-max max-w-xs ${bgColor} backdrop-blur-sm text-white text-xs rounded-md shadow-lg p-2 z-1000 pointer-events-none transition-opacity duration-150`}>
      {/* Main Item/Group Title */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold text-sm truncate">{getLocalizeEtcName((itemInfo as IconInfo).LocalizeEtc, locale) || `Group #${(itemInfo as GachaGroupInfo).Id}` || '???'}</p>
        <p className="text-amber-300 font-semibold whitespace-nowrap">x {amount?.toLocaleString()}</p>
      </div>

      {/* Conditional rendering for Gacha Contents */}
      {gachaContents && gachaContents.length > 0 ? (
        <div className="mt-1 border-t border-neutral-600 dark:border-neutral-700 pt-1 space-y-1">
          {/* <p className="font-semibold text-neutral-300 text-[11px] mb-1">Expected Contents:</p> */}
          {gachaContents.map((item, index) => (
            <div key={index} className="flex items-center gap-1.5">
              {item.iconSrc ? (
                <div className="relative w-5 h-5 shrink-0">
                  <div
                    className="absolute inset-0 rounded"
                    style={{
                      backgroundColor: rarityColors[isDark || 'light'][item.rarity] || rarityColors[isDark || 'light'][0],
                    }}
                  />
                  <img src={`data:image/webp;base64,${item.iconSrc}`} alt={item.name} className="relative w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-5 h-5 bg-neutral-500 rounded flex items-center justify-center text-[10px] shrink-0">?</div>
              )}
              <span className="grow truncate text-neutral-100">{item.name}</span>
              <span className="text-amber-300 font-medium whitespace-nowrap">x {formatAmount(item.expectedAmount, forceDecimal, decimalPlaces)}</span>
            </div>
          ))}
        </div>
      ) : // Original Description display
      ((itemInfo as IconInfo).LocalizeEtc as Record<string, string> | undefined)?.[getlocaleMethond('Description', 'Jp', locale)] || (itemInfo as IconInfo).LocalizeEtc?.DescriptionJp ? (
        <p className="mt-1 border-t border-neutral-600 dark:border-neutral-700 pt-1">
          {((itemInfo as IconInfo).LocalizeEtc as Record<string, string> | undefined)?.[getlocaleMethond('Description', 'Jp', locale)] || (itemInfo as IconInfo).LocalizeEtc?.DescriptionJp}
        </p>
      ) : null}
    </div>,
    document.body,
  );
});
TooltipContent.displayName = 'TooltipContent';

export const ItemIcon = ({
  type,
  itemId,
  amount,
  size,
  eventData,
  iconData,
  label,
  labelColor = 'bg-neutral-700',
  allStudents,
  studentPortraits,
  forceDecimal = false,
  decimalPlaces,
}: ItemIconProps) => {
  const [isHovering, setIsHovering] = useState(false);
  const [mousePosition, setMousePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [currentGachaIndex, setCurrentGachaIndex] = useState(0); // State for alternating display index
  const intervalRef = useRef<NodeJS.Timeout | null>(null); // Ref to store interval ID
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);

  const itemInfo = (eventData.icons[type as keyof typeof eventData.icons] as Record<string, IconInfo | GachaGroupInfo> | undefined)?.[itemId];
  const iconSrc = (iconData as Record<string, Record<string, string>>)[type]?.[itemId];

  const { i18n } = useTranslation('dashboard');
  const locale = i18n.language as Locale;
  const { isDark } = useIsDarkState();

  const isGift = (itemInfo as IconInfo)?.ItemCategory === 6 && type === 'Item';
  const giftToStudentsMap = useMemo(() => buildGiftToStudentsMap(allStudents, eventData), [allStudents, eventData]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isHovering) setIsHovering(true);
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  if (type == 'Character') return <ItemIcon type={'Item'} itemId={itemId} amount={1} size={size} eventData={eventData} iconData={iconData} label="First" labelColor="bg-yellow-500" />;

  useEffect(() => {
    if (isHovering && mousePosition && tooltipRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Default position: mouse cursor up, center
      let top = mousePosition.y - tooltipRect.height - 10;
      let left = mousePosition.x - tooltipRect.width / 2;

      // Verifying and Positioning Boundaries
      // Left Boundary
      if (left < 10) {
        left = 10;
      }
      // right boundary
      if (left + tooltipRect.width > viewportWidth - 10) {
        left = viewportWidth - tooltipRect.width - 10;
      }
      // Upper boundary (flip down cursor when over)
      if (top < 10) {
        top = mousePosition.y + 20;
      }
      // lower boundaries
      if (top + tooltipRect.height > viewportHeight - 10) {
        top = viewportHeight - tooltipRect.height - 10;
      }

      setTooltipStyle({ top: `${top}px`, left: `${left}px`, opacity: 1 });
    } else {
      // Transparent processing when invisible to prevent flickering
      setTooltipStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  }, [mousePosition, isHovering]);

  if (type === 'GachaGroup') {
    const gachaInfo = itemInfo;
    if (!gachaInfo) {
      return <div /* Fallback '?' div */>G?</div>;
    }

    const numericAmount = Number(amount) || 0;
    const elements: GachaElement[] = (gachaInfo as GachaGroupInfo).GachaElement || (gachaInfo as GachaGroupInfo).GachaElementRecursive || [];
    // const isRecursive = (gachaInfo as GachaGroupInfo).IsRecursive;

    // Effect for alternating display
    useEffect(() => {
      if (elements.length > 1) {
        intervalRef.current = setInterval(() => {
          setCurrentGachaIndex((prevIndex) => (prevIndex + 1) % elements.length);
        }, 500); // Change item every 1.5 seconds (adjust as needed)
      } else {
        setCurrentGachaIndex(0); // Only one item, stay at index 0
      }

      // Cleanup interval on component unmount or when elements change
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }, [elements]); // Rerun effect if elements change

    // --- Data for the currently displayed item ---
    const currentElement = elements[currentGachaIndex]; // Get the item for this "tick"
    // let currentItemIconSrc: string | undefined = undefined;
    let currentItemRarity = 0;
    let currentItemIsCurrencyOrSpecial = false;
    // let currentItemAltName = "GachaGroup"; // Fallback alt name

    if (currentElement) {
      let itemToDisplayType = currentElement.ParcelTypeStr;
      let itemToDisplayId = currentElement.ParcelId.toString();
      let itemToDisplayInfo = (eventData.icons[itemToDisplayType as keyof typeof eventData.icons] as Record<string, IconInfo | GachaGroupInfo> | undefined)?.[itemToDisplayId]; // Can be IconInfo or GachaGroupInfo

      // Recursive check (one level deep)
      if (itemToDisplayType === 'GachaGroup' && itemToDisplayInfo) {
        // It's a nested group. Look one level deeper for a representative icon.
        const nestedGroupInfo = itemToDisplayInfo as GachaGroupInfo;
        const firstNestedElement = nestedGroupInfo.GachaElement?.[(Math.random() * nestedGroupInfo.GachaElement.length) | 0] || nestedGroupInfo.GachaElementRecursive?.[0];

        if (firstNestedElement) {
          // Found a representative item inside the nested group
          itemToDisplayType = firstNestedElement.ParcelTypeStr;
          itemToDisplayId = firstNestedElement.ParcelId.toString();
          itemToDisplayInfo = (eventData.icons[itemToDisplayType as keyof typeof eventData.icons] as Record<string, IconInfo | GachaGroupInfo> | undefined)?.[itemToDisplayId];
        } else {
          // Nested group is empty or invalid, force fallback
          itemToDisplayType = 'GachaGroup'; // Reset type
          itemToDisplayInfo = gachaInfo; // Use top-level info for alt tag
        }
      }

      // Now, get the icon and info based on the final itemToDisplay
      if (itemToDisplayType === 'GachaGroup') {
        // Still a GachaGroup (e.g., empty nested group), show fallback
        // currentItemIconSrc = undefined;
        currentItemRarity = 0;
        currentItemIsCurrencyOrSpecial = false;
        // currentItemAltName = getLocalizeEtcName(itemToDisplayInfo.LocalizeEtc, locale) || `Group ${itemToDisplayId}`;
      } else {
        // This is a final item
        const finalItemInfo = itemToDisplayInfo as IconInfo | undefined; // Cast
        // currentItemIconSrc = (iconData as Record<string, Record<string, string>>)[itemToDisplayType]?.[itemToDisplayId];
        currentItemRarity = (finalItemInfo as IconInfo)?.Rarity ?? 0;
        // currentItemAltName = getLocalizeEtcName(finalItemInfo?.LocalizeEtc, locale) || `${itemToDisplayType} ${itemToDisplayId}`;

        if (itemToDisplayType === 'Currency' || (finalItemInfo as IconInfo)?.ItemCategory === 2 || [`Item-23`].includes(`${itemToDisplayType}-${itemToDisplayId}`)) {
          currentItemIsCurrencyOrSpecial = true;
        }
      }
    }
    // --- End: Data for currently displayed item ---

    // --- Prepare Gacha Tooltip Content (with Probability) ---
    const gachaContents: GachaContentItem[] = useMemo(() => {
      const finalExpectedMap = calculateExpectedContents(
        itemId, // Start with the top-level group ID
        numericAmount, // Total amount of top-level boxes
        eventData.icons,
        iconData,
        locale,
      );

      // Convert map to array for TooltipContent component
      return Object.values(finalExpectedMap)
        .map((content) => ({
          iconSrc: content.iconSrc,
          name: getLocalizeEtcName((content.itemInfo as IconInfo)?.LocalizeEtc, locale) || `${content.type} ${content.id}`,
          expectedAmount: content.expectedAmount,
          rarity: content.rarity,
        }))
        .sort((a, b) => b.rarity - a.rarity || b.expectedAmount - a.expectedAmount); // Sort for better display
    }, [itemId, numericAmount, eventData.icons, iconData, locale]);
    // --- End: Prepare Gacha Tooltip Content ---

    // Define background color based on the *currently displayed item*

    const representativeElements = elements.slice(0, 4);
    let layoutClass = 'grid grid-cols-2 grid-rows-2 p-0.5 gap-0.5'; // Default 2x2
    if (representativeElements.length === 1) {
      layoutClass = 'flex items-center justify-center p-1';
    } else if (representativeElements.length === 2) {
      layoutClass = 'grid grid-cols-2 p-0.5 gap-0.5';
    }

    const backgroundColor = currentItemIsCurrencyOrSpecial ? (isDark === 'dark' ? '#00000000' : '#eee') : rarityColors[isDark || 'light'][currentItemRarity] || rarityColors[isDark || 'light'][0];

    // --- Render Placeholder and Tooltip for GachaGroup ---
    return (
      <>
        <div className="relative" style={{ width: `${size * 0.25}rem`, height: `${size * 0.25}rem` }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} title={`GachaGroup-${itemId}`}>
          {/* Background */}
          <div className="absolute inset-0 rounded-md transition-colors duration-300" style={{ backgroundColor }} />

          <div className={`absolute inset-0 ${layoutClass}`}>
            {representativeElements.map((el, index) => {
              let elItemId = el.ParcelId.toString();
              let elItemType = el.ParcelTypeStr;
              let elIconSrc: string | undefined = (iconData as Record<string, Record<string, string>>)[elItemType]?.[elItemId];
              let elItemInfo = (eventData.icons[elItemType as keyof typeof eventData.icons] as Record<string, IconInfo | GachaGroupInfo> | undefined)?.[elItemId];
              let isNestedBox = false; // Flag to indicate if we should render 'BOX'

              // Handle nested GachaGroup for display icon
              if (elItemType === 'GachaGroup') {
                const nestedGroupInfo = elItemInfo as GachaGroupInfo | undefined;
                const firstNestedElement = nestedGroupInfo?.GachaElement?.[(Math.random() * nestedGroupInfo?.GachaElement.length) | 0] || nestedGroupInfo?.GachaElementRecursive?.[0];

                if (firstNestedElement && firstNestedElement.ParcelTypeStr !== 'GachaGroup') {
                  // Use the first item from the nested group for display
                  elItemId = firstNestedElement.ParcelId.toString();
                  elItemType = firstNestedElement.ParcelTypeStr;
                  elIconSrc = (iconData as Record<string, Record<string, string>>)[elItemType]?.[elItemId];
                  elItemInfo = (eventData.icons[elItemType as keyof typeof eventData.icons] as Record<string, IconInfo | GachaGroupInfo> | undefined)?.[elItemId];
                } else {
                  // Cannot find a representative item in the nested group, render 'BOX'
                  isNestedBox = true;
                  elIconSrc = undefined; // Ensure icon source is undefined
                }
              }

              if (isNestedBox) {
                // Render 'BOX' text for unresolvable nested groups
                return (
                  <div key={index} className="w-full h-full flex items-center justify-center text-neutral-500 text-[9px] font-bold bg-neutral-300 dark:bg-neutral-600 rounded-sm">
                    BOX
                  </div>
                );
              } else if (elIconSrc) {
                // Render the found icon (either direct or from nested group)
                const elRarity = (elItemInfo as IconInfo)?.Rarity ?? 0;
                // Determine background: No special background for Currency or Category 2 items within the grid
                const elBG =
                  elItemType !== 'Currency' && (elItemInfo as IconInfo)?.ItemCategory !== 2 && ![`Item-23`].includes(`${elItemType}-${elItemId}`)
                    ? rarityColors[isDark || 'light'][elRarity] || rarityColors[isDark || 'light'][0]
                    : 'transparent'; // Use transparent for Currency/Special within grid

                return (
                  <div key={index} className="relative w-full h-full rounded-sm overflow-hidden" style={{ backgroundColor: elBG }}>
                    <img
                      src={elIconSrc.startsWith('blob:') ? elIconSrc : `data:image/webp;base64,${elIconSrc}`}
                      alt="" // Alt text not crucial for small grid items
                      className="w-full h-full object-cover"
                      loading="lazy" // Lazy loading
                    />
                  </div>
                );
              }
              // Fallback for empty cell if something unexpected happens
              return <div key={index} className="w-full h-full bg-neutral-100 dark:bg-neutral-700 rounded-sm" />;
            })}
          </div>

          {/* Label (if provided) */}
          {label && <span className={`absolute top-0 left-0 ${labelColor} text-white text-[10px] font-bold px-1 py-0.5 rounded-br-md rounded-tl-md leading-none z-10`}>{label}</span>}

          {/* Amount: Expected value of child item if 1 child, otherwise group count */}
          {amount != 0 && (
            <span
              className="absolute bottom-0.5 right-1 text-black text-xs font-bold leading-none z-10"
              style={{
                textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff, 0 1px 0 #fff, 0 -1px 0 #fff',
              }}
            >
              {representativeElements.length === 1 && gachaContents.length > 0
                ? `×${formatAmount(gachaContents[0].expectedAmount, forceDecimal, decimalPlaces)}`
                : typeof amount == 'number' && amount > 0
                  ? `×${formatAmount(amount, forceDecimal, decimalPlaces)}`
                  : amount}
            </span>
          )}
        </div>
        {/* Tooltip with Gacha Content */}
        {isHovering && <TooltipContent ref={tooltipRef} style={tooltipStyle} itemInfo={itemInfo} amount={amount} locale={locale} gachaContents={gachaContents} />}
      </>
    );
  }

  if (!itemInfo || !iconSrc) {
    return (
      <div
        title={`${type}-${itemId}`}
        style={{ width: `${size * 0.25}rem`, height: `${size * 0.25}rem` }}
        className="bg-neutral-200 rounded-md flex items-center justify-center text-xs text-neutral-500"
      >
        ?
      </div>
    );
  }

  let rarity = (itemInfo as IconInfo).Rarity || 0;

  const key = `${type}-${itemId}`;
  if (type == 'Emblem') rarity = 3;

  let backgroundColor = rarityColors[isDark || 'light'][rarity] || rarityColors[isDark || 'light'][0];

  const nonRarityColors = isDark == 'light' ? '#eee' : '#00000000';
  if (type == 'Currency') backgroundColor = nonRarityColors;
  // if (type == 'Equipment') backgroundColor = nonRarityColors;
  else if ((itemInfo as IconInfo)?.ItemCategory == 2) backgroundColor = nonRarityColors;
  else if (['Item-23'].includes(key))
    backgroundColor = nonRarityColors; // Eligma
  else if ((itemInfo as IconInfo & { ExpiryChangeParcelTypeStr?: string })?.ExpiryChangeParcelTypeStr == 'Currency') backgroundColor = nonRarityColors;

  return (
    <>
      <div
        className={`relative ${isGift && allStudents ? 'cursor-pointer' : ''}`}
        style={{ width: `${size * 0.25}rem`, height: `${size * 0.25}rem` }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={() => isGift && allStudents && setSelectedGiftId(itemId)}
        title={key}
      >
        <div className="absolute inset-0 rounded-md" style={{ backgroundColor }} />

        <div className="absolute inset-0 flex items-center justify-center">
          <img src={iconSrc.startsWith('blob:') ? iconSrc : `data:image/webp;base64,${iconSrc}`} alt={(itemInfo as IconInfo).LocalizeEtc?.['NameKr']} className="max-w-full max-h-full object-cover" />
        </div>

        {label && <span className={`absolute top-0 left-0 ${labelColor} text-white text-[10px] font-bold px-1 py-0.5 rounded-br-md rounded-tl-md leading-none z-10`}>{label}</span>}

        {amount != 0 && (
          <span
            className="absolute bottom-0.5 right-0.5 text-black text-xs font-bold leading-none z-10"
            style={{
              textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff, 0 1px 0 #fff, 0 -1px 0 #fff',
            }}
          >
            {typeof amount == 'number' && amount > 0 ? `×${formatAmount(amount, forceDecimal, decimalPlaces)}` : amount}
          </span>
        )}
      </div>
      {isHovering && <TooltipContent ref={tooltipRef} style={tooltipStyle} itemInfo={itemInfo} amount={amount} locale={locale} />}

      {isGift &&
        selectedGiftId === itemId &&
        allStudents &&
        (() => {
          const gift: GiftEntry = {
            id: itemId,
            type: 'Item',
            rarity: (itemInfo as IconInfo)?.Rarity || 0,
            affectionPoints: (itemInfo as IconInfo & { AffectionExp?: number })?.AffectionExp || 0,
            preferenceLevel: 0,
          };
          const students = giftToStudentsMap[itemId] ?? [];
          return <GiftStudentSheet gift={gift} students={students} studentPortraits={studentPortraits} eventData={eventData} iconData={iconData} onClose={() => setSelectedGiftId(null)} />;
        })()}
    </>
  );
};
