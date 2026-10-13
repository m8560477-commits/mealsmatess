export function pollingChannel() {
  const callbacks: Array<() => void> = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  const channel = {
    on: (_event: string, _filter: unknown, callback: () => void) => { callbacks.push(callback); return channel; },
    subscribe: () => {
      timer = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        for (const callback of callbacks) callback();
      }, 30000);
      return channel;
    },
    unsubscribe: () => { if (timer) clearInterval(timer); },
  };
  return channel;
}
