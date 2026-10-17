import { useState, useEffect } from 'react';

export interface UseNetworkStatusOptions {
  onStatusChange?: (isOffline: boolean) => void;
}

export function useNetworkStatus(options?: UseNetworkStatusOptions) {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      options?.onStatusChange?.(false);
    };

    const handleOffline = () => {
      setIsOffline(true);
      options?.onStatusChange?.(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [options]);

  return { isOffline };
}
