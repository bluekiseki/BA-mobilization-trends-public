import { useEffect, useRef, useState } from 'react';
import { useRouteLoaderData } from 'react-router';
import type { loader } from '~/root';

interface Props {
  onToken: (token: string | null) => void;
  /** Called when the challenge errors or its script cannot load (e.g. blocked by an extension). */
  onError?: () => void;
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

export function TurnstileWidget({ onToken, onError }: Props) {
  const data = useRouteLoaderData<typeof loader>('root');
  const SITE_KEY = (data?.env || import.meta.env).VITE_TURNSTILE_SITE_KEY as string | undefined;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [scale, setScale] = useState(1);
  // interaction-only keeps the widget hidden unless a visible challenge is needed, so reserve space only for what is rendered
  const [widgetHeight, setWidgetHeight] = useState(0);

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
    if (!widgetRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidgetHeight(entry.target.scrollHeight));
    observer.observe(widgetRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const render = () => {
      if (!widgetRef.current || widgetId.current) return;
      widgetId.current =
        window?.turnstile?.render(widgetRef.current, {
          sitekey: SITE_KEY,
          theme: 'auto',
          appearance: 'interaction-only',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => {
            onToken(null);
            onError?.();
          },
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
      script.addEventListener('error', () => onError?.(), { once: true });
    }

    return () => {
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  return (
    <div ref={wrapperRef} style={{ height: `${widgetHeight * scale}px`, overflow: 'hidden' }}>
      <div ref={widgetRef} style={{ transformOrigin: 'left top', transform: `scale(${scale})` }} />
    </div>
  );
}
