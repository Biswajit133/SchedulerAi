import React from 'react';
import Toast from './Toast';

export default function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast {...toast} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
}
