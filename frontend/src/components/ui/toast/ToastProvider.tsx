'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast, ToastVariant } from './Toast';

interface ToastData {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  txHash?: string;
  duration?: number;
}

interface ToastContextType {
  addToast: (toast: Omit<ToastData, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    ({ duration = 5000, ...toastData }: Omit<ToastData, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, duration, ...toastData }]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Above modals, so a transaction result is visible while its dialog is still open. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-toast flex flex-col items-center gap-3 p-4 sm:items-end sm:p-6">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
