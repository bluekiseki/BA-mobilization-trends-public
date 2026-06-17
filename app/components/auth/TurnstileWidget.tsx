import { useEffect, useRef, useState } from 'react';
import { useRouteLoaderData } from 'react-router';
import type { loader } from '~/root';

interface Props {
  onToken: (token: string | null) => void;
}

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, options: Record<string, unknown>): string;
      remove(widgetId: string): void;
    };
  }
}

const WIDGET_W = 300;
const WIDGET_H = 65;

export function TurnstileWidget({ onToken }: Props) {
  const data = useRouteLoaderData<typeof loader>('root');
  const SITE_KEY = (data?.env || import.meta.env).VITE_TURNSTILE_SITE_KEY as string | undefined;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width;
      setScale(Math.min(1, available / WIDGET_W));
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const render = () => {
      if (!widgetRef.current || widgetId.current) return;
      widgetId.current =
        window?.turnstile?.render(widgetRef.current, {
          sitekey: SITE_KEY,
          theme: 'auto',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        }) || null;
    };

    if (window.turnstile) {
      render();
    } else {
      let script = document.getElementById('cf-turnstile-script') as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = 'cf-turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', render, { once: true });
    }

    return () => {
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  return (
    <div ref={wrapperRef} style={{ height: `${WIDGET_H * scale}px`, overflow: 'hidden' }}>
      <div ref={widgetRef} style={{ transformOrigin: 'left top', transform: `scale(${scale})` }} />
    </div>
  );
}
