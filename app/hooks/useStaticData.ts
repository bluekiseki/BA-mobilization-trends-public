import { useEffect, useState } from 'react';

/** Result of a cached static-data loader from `itemSourceData`, or `initial` until it resolves. The loader must be a stable reference. */
export function useStaticData<T>(load: () => Promise<T>, initial: T): T {
  const [data, setData] = useState<T>(initial);
  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) setData(result);
    });
    return () => {
      active = false;
    };
  }, [load]);
  return data;
}
