// app/components/planner/common/StudentAvatar.tsx

interface StudentAvatarProps {
  name: string;
  portrait?: string;
  className?: string;
}

// Small circular student portrait with a first-letter fallback — shared by any panel that lists
// students by avatar (per-student material needs, gift affection groups, resource groupings).
export function StudentAvatar({ name, portrait, className = 'w-8 h-8' }: StudentAvatarProps) {
  return (
    <div className={`relative ${className} rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 ring-2 ring-white dark:ring-neutral-800 shrink-0`} title={name}>
      {portrait ? (
        <img src={`data:image/webp;base64,${portrait}`} className="w-full h-full object-cover" alt={name} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-neutral-500">{name[0]}</div>
      )}
    </div>
  );
}
