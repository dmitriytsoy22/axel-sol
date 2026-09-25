'use client';

import React, { useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load'));
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error('Turnstile did not load'));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

/**
 * Cloudflare Turnstile, the bot check the access route asks for when the deployment sets
 * TURNSTILE_SECRET. It reports a token once solved, and null when the token expires. The
 * widget follows the browser's language.
 */
export function Turnstile({
  siteKey,
  onToken,
  onError,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  onError: () => void;
}): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };

  useEffect(() => {
    let widget: string | null = null;
    let active = true;
    loadTurnstile().then(
      (turnstile) => {
        if (!active || !container.current) return;
        widget = turnstile.render(container.current, {
          sitekey: siteKey,
          callback: (token) => callbacks.current.onToken(token),
          'expired-callback': () => callbacks.current.onToken(null),
          'error-callback': () => callbacks.current.onError(),
        });
      },
      () => callbacks.current.onError(),
    );
    return () => {
      active = false;
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey]);

  return <div ref={container} className="min-h-[65px]" />;
}
