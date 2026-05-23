// Pre-paint theme bootstrap. Runs synchronously from <script src> in
// <head> before any other resource. Sets the `.dark` class on <html>
// from localStorage so the first paint already reflects the user's
// chosen mode — no FOUC, no flash.
//
// Key: `qr-mode` = "light" | "dark" | "system".
// Anything else (or null) is treated as "system" and follows
// prefers-color-scheme.
(function () {
  try {
    var k = 'qr-mode';
    var mode = localStorage.getItem(k);
    var dark =
      mode === 'dark' ||
      (mode !== 'light' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (_) {
    // localStorage blocked — accept system default
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      document.documentElement.classList.add('dark');
    }
  }
})();
