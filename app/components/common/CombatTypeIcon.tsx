const SRC = { attack: '/img/sword-centered.svg', defense: '/img/shield-centered.svg' } as const;

// In-game style attack (sword) / defense (shield) mark. Drawn as a CSS mask so it takes `currentColor` or an explicit color.
export function CombatTypeIcon({ kind, className = 'h-4 w-4', color, title }: { kind: keyof typeof SRC; className?: string; color?: string; title?: string }) {
  const mask = `url(${SRC[kind]}) center / contain no-repeat`;
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ mask, WebkitMask: mask, ...(color ? { backgroundColor: color } : {}) }}
    />
  );
}
