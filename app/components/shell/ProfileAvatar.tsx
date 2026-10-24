import { useEffect, useState } from 'react';
import { DEFAULT_AVATAR_STUDENT_ID, loadPortraitMap } from '~/utils/studentPortraitMap';

interface ProfileAvatarProps {
  /** Chosen student id, or null to show the default student's portrait. */
  studentId: number | null;
  /** Profile name — used for the first-letter placeholder while the portrait loads. */
  name: string;
  className?: string;
}

/**
 * Profile picture: the chosen student's portrait, or student DEFAULT_AVATAR_STUDENT_ID
 * when unset. Shows a first-letter placeholder until the (shared, lazily loaded) portrait
 * map resolves.
 */
export function ProfileAvatar({ studentId, name, className = 'h-9 w-9' }: ProfileAvatarProps) {
  const [portraits, setPortraits] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPortraitMap()
      .then((m) => alive && setPortraits(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const id = studentId ?? DEFAULT_AVATAR_STUDENT_ID;
  const portrait = portraits?.[id];

  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-md`} title={name}>
      {portrait ? (
        <img src={`data:image/webp;base64,${portrait}`} alt={name} className="h-full w-full object-cover object-top" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-200 text-xs font-bold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">{name[0]}</div>
      )}
    </div>
  );
}
