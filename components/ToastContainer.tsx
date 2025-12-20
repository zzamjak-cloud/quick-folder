import React from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-3 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] text-[var(--qf-text)] rounded-lg shadow-xl shadow-black/50 animate-in slide-in-from-bottom-5 duration-300"
        >
          {toast.type === 'success' && <CheckCircle size={18} className="text-green-500" />}
          {toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}
          {toast.type === 'info' && <Info size={18} className="text-[var(--qf-accent)]" />}
          
          <span className="text-sm font-medium">{toast.message}</span>
          
          <button 
            onClick={() => removeToast(toast.id)}
            className="ml-4 text-[var(--qf-muted)] hover:text-[var(--qf-text)]"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};