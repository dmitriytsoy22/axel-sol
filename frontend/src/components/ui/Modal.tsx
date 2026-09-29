'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  closeLabel?: string;
  /**
   * The dialog's action, kept in view under the content when that scrolls, as the purchase
   * button does in a phone's bottom sheet. Outside the scroller, so nothing slides under it.
   */
  footer?: React.ReactNode;
}

/* What Tab can reach inside the dialog: enabled controls and links. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function tabStops(root: HTMLElement | null, scope = ''): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(scope ? `${scope} :is(${FOCUSABLE})` : FOCUSABLE),
  ).filter((element) => element.getClientRects().length > 0);
}

/* A dialog on paper. Below sm it is a bottom sheet, so the action sits in thumb reach. */
export function Modal({
  isOpen,
  onClose,
  children,
  title,
  closeLabel = 'Close',
  footer,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  // Callers pass a new onClose on every render; the dialog must not refocus on each of them.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      // The dialog moves focus itself rather than letting the browser step and catching it at
      // the ends: Safari's Tab skips links, and WebKit left the purchase dialog for the page
      // when its last control was disabled, so the ends the trap watched were never reached.
      e.preventDefault();
      const stops = tabStops(modalRef.current);
      if (stops.length === 0) return;
      const at = stops.findIndex((stop) => stop === document.activeElement);
      const step = e.shiftKey ? -1 : 1;
      // From the dialog itself, or from outside it, Tab starts at the first stop and
      // Shift+Tab at the last.
      const next = at === -1 ? (e.shiftKey ? stops.length - 1 : 0) : at + step;
      stops[(next + stops.length) % stops.length].focus();
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus the first control inside the content, not the close button.
    const [firstInBody] = tabStops(modalRef.current, '[data-modal-body]');
    (firstInBody ?? modalRef.current)?.focus();

    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      // Back to the control that opened the dialog, when it is still on the page.
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-950/50 motion-reduce:animate-none"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={title ? 'modal-title' : undefined}
        // A column capped by the screen: with a footer, the content is what gives way.
        className="relative flex max-h-[calc(100svh-2rem)] w-full max-w-md animate-fade-in flex-col rounded-t-panel border border-border bg-popover px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-popover-foreground shadow-lg outline-none motion-reduce:animate-none sm:max-h-[calc(100svh-3rem)] sm:rounded-panel sm:pb-6"
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
          {title && (
            <h2 id="modal-title" className="text-title font-semibold text-foreground">
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className="-mr-3 ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors duration-fast ease-move hover:bg-secondary hover:text-foreground"
            aria-label={closeLabel}
          >
            <X aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        <div data-modal-body className="max-h-[75svh] min-h-0 overflow-y-auto">
          {children}
        </div>
        {footer && <div className="shrink-0 border-t border-border pt-4">{footer}</div>}
      </div>
    </div>
  );
}
