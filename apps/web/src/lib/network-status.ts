type NetworkStatusListener = (online: boolean) => void;

const listeners = new Set<NetworkStatusListener>();

function notifyListeners(online: boolean) {
  listeners.forEach((listener) => {
    try {
      listener(online);
    } catch {
      // ignore listener errors
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => notifyListeners(true));
  window.addEventListener('offline', () => notifyListeners(false));
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function subscribeNetworkStatus(listener: NetworkStatusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNetworkStatus(): { isOnline: boolean; subscribe: (listener: NetworkStatusListener) => () => void } {
  return {
    isOnline: isOnline(),
    subscribe: subscribeNetworkStatus,
  };
}
