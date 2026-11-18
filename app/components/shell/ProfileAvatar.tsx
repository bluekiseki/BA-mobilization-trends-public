import { SheetIcon } from '~/components/common/SheetIcon';

/** Student whose portrait is shown when a profile has no avatar set (display-only; DB stays null). */
const DEFAULT_AVATAR_STUDENT_ID = 13003;

interface ProfileAvatarProps {
  /** Chosen student id, or null to show the default student's portrait. */
  studentId: number | null;
  /** Profile name — used for the first-letter placeholder while the portrait loads. */
  name: string;
  className?: string;
}

/**
 * Profile picture: the chosen student's portrait, or student DEFAULT_AVATAR_STUDENT_ID
 * when unset. Shows a first-letter placeholder until the (shared, lazily loaded) icon
 * sheet resolves.
 */
export function ProfileAvatar({ studentId, name, className = 'h-9 w-9' }: ProfileAvatarProps) {
  const id = studentId ?? DEFAULT_AVATAR_STUDENT_ID;

  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-md`} title={name}>
      <SheetIcon
        sheet="student"
        id={id}
        alt={name}
        fallback={<div className="flex h-full w-full items-center justify-center bg-neutral-200 text-xs font-bold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">{name[0]}</div>}
      />
    </div>
  );
}
