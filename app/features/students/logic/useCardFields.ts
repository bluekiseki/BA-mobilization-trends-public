import { useCallback, useEffect, useState } from 'react';
import { CARD_FIELDS, CARD_FIELDS_STORAGE_KEY, DEFAULT_CARD_FIELDS, parseCardFields, type CardField } from './cardFields';

/** Which fields the student cards show. Saved per browser; the defaults render on the server and until the saved list is read. */
export function useCardFields() {
  const [fields, setFields] = useState<readonly CardField[]>(DEFAULT_CARD_FIELDS);

  useEffect(() => {
    try {
      setFields(parseCardFields(localStorage.getItem(CARD_FIELDS_STORAGE_KEY)));
    } catch {
      // Storage can be blocked; the defaults stay
    }
  }, []);

  const toggle = useCallback((field: CardField) => {
    setFields((current) => {
      const next = CARD_FIELDS.filter((candidate) => (candidate === field ? !current.includes(candidate) : current.includes(candidate)));
      try {
        localStorage.setItem(CARD_FIELDS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The choice still applies until the page is closed
      }
      return next;
    });
  }, []);

  return { fields, toggle };
}
