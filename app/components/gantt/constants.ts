// app/components/gantt/constants.ts

// export const PIXELS_PER_HOUR = 1.4;
export const MS_PER_HOUR = 1000 * 60 * 60;
export const PREDICTION_STRIPE_CLASS = 'bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.1),rgba(255,255,255,0.1)_10px,transparent_10px,transparent_20px)]';

// Modern Flat Colors (Desaturated & Mature)
export const TRACK_COLORS: Record<string, string> = {
  event: 'bg-[#0284c7]', // Sky-600 like
  raid: 'bg-[#475569]', // Slate-600
  eraid: 'bg-[#6d28d9]', // Violet-700
  jointFiringDrill: 'bg-[#0f766e]', // Teal-700
  multifloor: 'bg-[#b45309]', // Amber-700
  pickup: 'bg-[#f43f5e]', // Rose-500 (Main Pickup Color)
  maintenance: 'bg-[#737373]', // Neutral-500
  mainstory: 'bg-[#4f46e5]', // Indigo-600
  ministory: 'bg-[#059669]', // Emerald-600
  patch: 'bg-[#6366f1]', // Indigo-500
  birthday: 'bg-[#facc15] text-black',
  'shop-reset': 'bg-[#65a30d]', // Lime-600
};

export const CAMPAIGN_COLORS: Record<string, string> = {
  Commission: 'bg-[#059669]',
  Schedule: 'bg-[#3b82f6]',
  Scrimmage: 'bg-[#d97706]',
  Normal: 'bg-[#f43f5e]',
  Hard: 'bg-[#7c3aed]',
  default: 'bg-[#9ca3af]',
};

export const STRIPE_PATTERN_STYLE = {
  backgroundImage: `linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)`,
  backgroundSize: '12px 12px',
};
