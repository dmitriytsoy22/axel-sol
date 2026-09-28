'use client';

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';

/**
 * Closes a bar menu however the reader leaves it: a press outside, Escape, or keyboard focus
 * moving past its last item, which otherwise left the list open over the page. Escape from
 * inside the list hands focus back to the toggle, since the item that held it goes away.
 */
export function useMenuDismiss(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
  rootRef: RefObject<HTMLElement>,
  toggleRef: RefObject<HTMLElement>,
): void {
  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) =>
      !rootRef.current?.contains(target as Node | null);
    const onPointerDown = (event: PointerEvent) => {
      if (outside(event.target)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (outside(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!outside(document.activeElement)) toggleRef.current?.focus();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setOpen, rootRef, toggleRef]);
}
