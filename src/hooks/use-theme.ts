import { useSyncExternalStore, useCallback, useEffect } from 'react';

export type Mode = 'light' | 'dark' | 'system';
export type ResolvedMode = 'light' | 'dark';

const MODE_KEY = 'qr-mode';

function resolveMode(stored: string | null): ResolvedMode {
  if (stored === 'light' || stored === 'dark') return stored;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getModeSnapshot(): Mode {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(MODE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

function getResolvedModeSnapshot(): ResolvedMode {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(MODE_KEY);
  return resolveMode(stored === 'system' ? null : stored);
}

function getServerSnapshot(): Mode {
  return 'system';
}
function getServerResolvedSnapshot(): ResolvedMode {
  return 'light';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener('qr-mode-change', callback);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('qr-mode-change', callback);
    mq.removeEventListener('change', callback);
  };
}

function applyMode(resolved: ResolvedMode) {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

function withViewTransition(fn: () => void) {
  if (typeof document !== 'undefined' && document.startViewTransition) {
    document.startViewTransition(fn).finished.catch(() => {});
  } else {
    fn();
  }
}

export function useTheme() {
  const mode = useSyncExternalStore(subscribe, getModeSnapshot, getServerSnapshot);
  const resolvedMode = useSyncExternalStore(
    subscribe,
    getResolvedModeSnapshot,
    getServerResolvedSnapshot,
  );

  useEffect(() => {
    applyMode(resolvedMode);
  }, [resolvedMode]);

  const setMode = useCallback((next: Mode) => {
    withViewTransition(() => {
      localStorage.setItem(MODE_KEY, next);
      // Same-tab storage events don't fire; this custom event drives
      // the in-tab subscribers. Cross-tab still uses the native event.
      window.dispatchEvent(new Event('qr-mode-change'));
    });
  }, []);

  const toggleMode = useCallback(() => {
    const current = getResolvedModeSnapshot();
    setMode(current === 'dark' ? 'light' : 'dark');
  }, [setMode]);

  return { mode, resolvedMode, setMode, toggleMode };
}
