import { useMemo } from 'react';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';
import type { AggregationType, TreemapSourceEntry } from './EmblemCounter';
import type { TooltipContentProps } from 'recharts';
import { useTranslation } from 'react-i18next';
import { cdn } from '~/utils/cdn';
import type { TFunction } from 'i18next';

interface EmblemTreemapProps {
  data: TreemapSourceEntry[];
  totalCount: number;
  t_s: TFunction<'club'>;
  portraitData: Record<number, string>;
  aggregationType: AggregationType;
}

interface CustomTooltipProps extends Partial<TooltipContentProps<number, string>> {
  totalCount?: number;
}

const CustomTooltip = ({ active, payload, totalCount = 0 }: CustomTooltipProps) => {
  const { t } = useTranslation('emblemCounter');
  if (active && payload && payload.length) {
    const item = payload[0].payload as Record<string, number | string>;
    const value = Number(payload[0].value ?? 0);
    const path = payload
      .slice(1)
      .map((p) => String(p.name ?? ''))
      .reverse()
      .join(' > ');
    const percentage = totalCount > 0 ? (value / totalCount) * 100 : 0;

    const countDisplay = item.count ? Number(item.count).toLocaleString() : value.toLocaleString();

    return (
      <div className="bg-white dark:bg-neutral-800 p-3 border border-neutral-300 dark:border-neutral-600 rounded shadow-lg text-sm">
        <p className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">{String(item.name ?? '')}</p>
        {path && <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">{path}</p>}
        <p className="text-neutral-700 dark:text-neutral-300">
          {t('count', 'Count')}: <span className="font-medium">{countDisplay}</span>
        </p>
        <p className="text-neutral-600 dark:text-neutral-400">
          {t('percentage', 'Percentage')}: {percentage.toFixed(2)}% ({t('ofTotal', 'of total')})
        </p>
      </div>
    );
  }
  return null;
};

const SCHOOL_COLORS = [
  '#E6194B',
  '#3CB44B',
  '#FFE119',
  '#4363D8',
  '#F58231',
  '#911EB4',
  '#42D4F4',
  '#F032E6',
  '#BCF60C',
  '#FABEBE',
  '#008080',
  '#E6BEFF',
  '#9A6324',
  '#FFFAC8',
  '#800000',
  '#AAFFC3',
  '#808000',
  '#FFD8B1',
  '#000075',
  '#A9A9A9',
];

interface CustomizedContentProps {
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  schoolColor?: string;
  iconId?: number;
  portraitData?: Record<number, string>;
  children?: unknown;
}

const CustomizedContent = (props: CustomizedContentProps) => {
  const { depth, x, y, width, height, name, schoolColor, iconId, portraitData, children } = props;

  if (width < 2 || height < 2) return null;

  const fill = schoolColor || '#cccccc';

  // let fillOpacity = 1.0;
  let stroke = '#fff';
  let strokeWidth = 1;
  let strokeOpacity = 0.3;

  // (Depth styling logic follows the user-modified version)
  switch (depth) {
    case 1: // School
      // fillOpacity = 0.8;
      stroke = '#fff';
      strokeWidth = 2;
      strokeOpacity = 0.5;
      break;
    case 2: // Club
      // fillOpacity = 0.6;
      stroke = '#000';
      strokeWidth = 3;
      strokeOpacity = 0.6; // (Adjusted from 1.0 to 0.6)
      break;
    case 3: // BaseName (Student Base)
      // fillOpacity = 0.4;
      stroke = '#fff';
      strokeWidth = 0.5;
      strokeOpacity = 0.2;
      break;
    case 4: // Seasonal (Seasonal Student)
      // fillOpacity = 0.25;
      stroke = '#fff';
      strokeWidth = 0.5;
      strokeOpacity = 0.2;
      break;
    default: // depth 0 (root)
      // fillOpacity = 0.1;
      strokeWidth = 0;
  }

  const isLeaf = !children || (Array.isArray(children) && children.length === 0);
  const portraitBase64 = isLeaf && iconId && portraitData ? portraitData[iconId] : null;

  // (Label position calculation logic follows the user-modified version)
  let labelX = x + 6,
    labelY = y + 18,
    labelSize = 14;
  if (depth === 2) {
    // Club
    labelX = x + 10;
    labelY = y + 34;
    labelSize = 12;
  } else if (depth === 3) {
    // Student
    labelX = x + 14;
    labelY = y + 50;
    labelSize = 11;
  }

  // let imageSize; //, imageX, imageY;
  // const NATURAL_IMAGE_SIZE = 250;

  // 2. Limit image size to the *smaller* of 'cell size' and 'original size' (prevent distortion)
  // (However, use smaller of width/height to maintain aspect ratio)
  // const maxImageSize = Math.max(width, height);
  // imageSize = Math.min(maxImageSize, NATURAL_IMAGE_SIZE);

  // const useHighRes = width * height > 150 * 150; // High-res condition requested by user
  const useHighRes = Math.max(width, height) > 100 || width * height > 5_000; // High-res condition requested by user
  const highResPath = cdn(`/img/portrait/${iconId}.webp`);
  const lowResPath = `data:image/webp;base64,${portraitBase64}`;

  // Default path is lowResPath. If high-res is available, use highResPath.
  const initialHref = useHighRes ? highResPath : lowResPath;

  // 4. Error Handler (On high-res loading failure)
  const handleImageError = (e: React.SyntheticEvent<SVGImageElement>) => {
    // If current href ends with .png (high-res path) and fallback (lowResPath) exists
    if (e.currentTarget.href.baseVal.endsWith('.webp') && lowResPath) {
      // Replace href with lowResPath (base64)
      e.currentTarget.setAttribute('href', lowResPath);
    }
  };

  return (
    <g>
      {/* 1. Basic Rectangle */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: fill,
          // fillOpacity: canRenderImage ? 0.0 : fillOpacity, // Transparent background when displaying image
          stroke: stroke,
          strokeWidth: strokeWidth,
          strokeOpacity: strokeOpacity,
        }}
      />

      {/* 2. Render Portrait Image (isLeaf && canRenderImage) */}
      {iconId ? (
        <image
          href={initialHref}
          x={x}
          y={y}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid slice"
          onError={handleImageError} // Connect Error Handler
        />
      ) : null}

      {/* 3. Render Label (depth 1, 2, 3) */}
      {false && depth < 4 ? (
        <text
          x={labelX}
          y={labelY}
          fill="#ffffff"
          fontSize={labelSize}
          fontWeight={depth === 1 ? 600 : 400}
          style={{
            pointerEvents: 'none',
            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
          }}
        >
          {name}
        </text>
      ) : null}
    </g>
  );
};

/**
 * 5. Treemap Chart Component
 */
const EmblemTreemap: React.FC<EmblemTreemapProps> = ({
  data,
  totalCount,
  t_s,
  portraitData,
  aggregationType, // Receive prop
}) => {
  const { t } = useTranslation('emblemCounter');

  /**
   * 6. Generate Hierarchical Data (useMemo)
   * Dynamically changes depth and leaf nodes based on aggregationType.
   */
  const hierarchyData = useMemo(() => {
    // Define Aggregate Node Type
    type SeasonalLeaf = { name: string; count: number; iconId: number };
    type BaseNameNode = {
      name: string;
      children: SeasonalLeaf[];
      totalCount: number;
      maxCount: number;
      topStudentId: number | null;
    };
    type ClubNode = {
      name: string;
      children: Map<string, BaseNameNode>;
      totalCount: number;
      maxCount: number;
      topStudentId: number | null;
    };
    type SchoolNode = {
      name: string;
      color: string;
      children: Map<string, ClubNode>;
      totalCount: number;
      maxCount: number;
      topStudentId: number | null;
    };

    const root = new Map<string, SchoolNode>();
    let schoolIndex = 0;

    if (!data || data.length === 0) return [];

    // 1. Iterate data and generate *full* hierarchy and *aggregate* info
    for (const item of data) {
      const { school, club, baseName, seasonalName, count, iconId } = item;

      const schoolName = school;
      const clubName = club;
      const baseNameTranslated = baseName;
      const seasonalNameTranslated = seasonalName;

      if (!root.has(schoolName)) {
        const schoolColor = SCHOOL_COLORS[schoolIndex % SCHOOL_COLORS.length];
        schoolIndex++;
        root.set(schoolName, {
          name: schoolName,
          color: schoolColor,
          children: new Map(),
          totalCount: 0,
          maxCount: 0,
          topStudentId: null,
        });
      }
      const schoolNode = root.get(schoolName);
      if (!schoolNode) continue;

      schoolNode.totalCount += count;
      if (count > schoolNode.maxCount) {
        schoolNode.maxCount = count;
        schoolNode.topStudentId = iconId;
      }

      if (!schoolNode.children.has(clubName)) {
        schoolNode.children.set(clubName, {
          name: clubName,
          children: new Map(),
          totalCount: 0,
          maxCount: 0,
          topStudentId: null,
        });
      }
      const clubNode = schoolNode.children.get(clubName);
      if (!clubNode) continue;

      clubNode.totalCount += count;
      if (count > clubNode.maxCount) {
        clubNode.maxCount = count;
        clubNode.topStudentId = iconId;
      }

      if (!clubNode.children.has(baseNameTranslated)) {
        clubNode.children.set(baseNameTranslated, {
          name: baseNameTranslated,
          children: [],
          totalCount: 0,
          maxCount: 0,
          topStudentId: null,
        });
      }
      const baseNameNode = clubNode.children.get(baseNameTranslated);
      if (!baseNameNode) continue;
      // Update Student (Base) node aggregation
      baseNameNode.totalCount += count;
      if (count > baseNameNode.maxCount) {
        baseNameNode.maxCount = count;
        baseNameNode.topStudentId = iconId;
      }

      // 4. Add Seasonal Student (Leaf) Node
      baseNameNode.children.push({
        name: seasonalNameTranslated,
        count: count,
        iconId: iconId,
      });
    }

    // 2. Modify returned data structure based on aggregationType
    switch (aggregationType) {
      // School (Depth 1)
      case 'school':
        return Array.from(root.values()).map((s) => ({
          name: s.name,
          schoolColor: s.color,
          count: s.totalCount, // Size of leaf node (School)
          iconId: s.topStudentId, // Icon of leaf node (School)
        }));

      // Club (Depth 2)
      case 'club':
        return Array.from(root.values()).map((s) => ({
          name: s.name,
          schoolColor: s.color,
          children: Array.from(s.children.values()).map((c) => ({
            name: c.name,
            schoolColor: s.color,
            count: c.totalCount, // Size of leaf node (Club)
            iconId: c.topStudentId, // Icon of leaf node (Club)
          })),
        }));

      // Student (Integrated) (Depth 3)
      case 'student_combined':
        return Array.from(root.values()).map((s) => ({
          name: s.name,
          schoolColor: s.color,
          children: Array.from(s.children.values()).map((c) => ({
            name: c.name,
            schoolColor: s.color,
            children: Array.from(c.children.values()).map((b) => ({
              name: b.name,
              schoolColor: s.color,
              count: b.totalCount, // Size of leaf node (Student)
              iconId: b.topStudentId, // Icon of leaf node (Student)
            })),
          })),
        }));

      // Student (Individual) (Depth 4) - Default
      case 'student_separate':
      default:
        return Array.from(root.values()).map((s) => ({
          name: s.name,
          schoolColor: s.color,
          children: Array.from(s.children.values()).map((c) => ({
            name: c.name,
            schoolColor: s.color,
            children: Array.from(c.children.values()).map((b) => ({
              name: b.name,
              schoolColor: s.color,
              // No count or iconId as it is not a leaf node
              children: b.children.map((leaf) => ({
                // Leaf Node (Seasonal)
                ...leaf,
                schoolColor: s.color, // (count, iconId included in ...leaf)
              })),
            })),
          })),
        }));
    }
  }, [data, t, t_s, aggregationType]); // Add aggregationType dependency

  if (hierarchyData.length === 0) {
    return null;
  }

  return (
    // (Keep user-modified height of 600px)
    <div className="w-full h-96 md:h-[600px] mb-6">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap data={hierarchyData} dataKey="count" nameKey="name" isAnimationActive={false} content={(props) => <CustomizedContent {...props} portraitData={portraitData} />}>
          <Tooltip content={<CustomTooltip totalCount={totalCount} />} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
};

export default EmblemTreemap;
