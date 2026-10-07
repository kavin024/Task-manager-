import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    const newToast = {
      id,
      type: 'info',
      title: '',
      message: '',
      duration: 4000,
      ...toast,
    };
    setToasts((prev) => [...prev, newToast]);
    
    if (newToast.duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, newToast.duration);
    }
    
    return id;
  }, []);

  const hideToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options) => {
    if (typeof options === 'string') {
      return showToast({ message: options });
    }
    return showToast(options);
  }, [showToast]);

  const success = useCallback((title, message, options = {}) => {
    return showToast({ type: 'success', title, message, ...options });
  }, [showToast]);

  const error = useCallback((title, message, options = {}) => {
    return showToast({ type: 'error', title, message, ...options });
  }, [showToast]);

  const warning = useCallback((title, message, options = {}) => {
    return showToast({ type: 'warning', title, message, ...options });
  }, [showToast]);

  const info = useCallback((title, message, options = {}) => {
    return showToast({ type: 'info', title, message, ...options });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ toasts, toast, success, error, warning, info, hideToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}