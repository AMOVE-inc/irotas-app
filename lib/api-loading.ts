let activeRequests = 0;
const listeners = new Set<(loading: boolean) => void>();

function emit() {
  const loading = activeRequests > 0;
  listeners.forEach((listener) => listener(loading));
}

export function beginApiLoading() { activeRequests += 1; emit(); }
export function endApiLoading() { activeRequests = Math.max(0, activeRequests - 1); emit(); }
export function subscribeApiLoading(listener: (loading: boolean) => void) {
  listeners.add(listener);
  listener(activeRequests > 0);
  return () => { listeners.delete(listener); };
}
