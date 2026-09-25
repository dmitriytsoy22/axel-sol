'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  closeLabel?: string;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/* A dialog on paper. Below sm it is a bottom sheet, so the action sits in thumb reach. */
export function Modal({ isOpen, onClose, children, title, closeLabel = 'Close' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(FOCUSABLE);
        if (!focusableElements || focusableElements.length === 0) return;

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus the first control inside the content, not the close button.
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
      `[data-modal-body] :is(${FOCUSABLE})`,
    );
    focusable?.[0]?.focus();

    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

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
        aria-labelledby={title ? 'modal-title' : undefined}
        className="relative w-full max-w-md animate-fade-in rounded-t-panel border border-border bg-popover px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-popover-foreground shadow-lg motion-reduce:animate-none sm:rounded-panel sm:pb-6"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && (
            <h2 id="modal-title" className="text-title font-semibold text-foreground">
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className="-mr-3 ml-auto inline-flex h-11 w-11 items-center justify-center rounded-control text-muted-foreground transition-colors duration-fast ease-move hover:bg-secondary hover:text-foreground"
            aria-label={closeLabel}
          >
            <X aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        <div data-modal-body className="max-h-[75svh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
