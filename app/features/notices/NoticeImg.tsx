import { useEffect, useState } from 'react';
import { archiveImageUrl, isArchivable } from '~/utils/archiveImage';

interface NoticeImgProps {
  src: string;
  className?: string;
}

/** Shows the original image and falls back to the archived copy once if it fails to load. */
export function NoticeImg({ src, className }: NoticeImgProps) {
  const [current, setCurrent] = useState(src);
  const [fellBack, setFellBack] = useState(false);

  useEffect(() => {
    setCurrent(src);
    setFellBack(false);
  }, [src]);

  const handleError = () => {
    if (fellBack || !isArchivable(src)) return;
    setFellBack(true);
    archiveImageUrl(src).then(setCurrent);
  };

  return <img src={current} alt="" className={className} onError={handleError} />;
}
