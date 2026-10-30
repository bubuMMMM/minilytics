// Applies the saved / system colour scheme before first paint (no flash). Kept tiny and CSP-friendly ('self').
(function () {
  try {
    var t = localStorage.getItem('ml-theme');
    var dark = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var d = document.documentElement;
    d.classList.toggle('dark', dark);
    d.style.colorScheme = dark ? 'dark' : 'light';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0a0a0b' : '#ffffff');
  } catch (e) {}
})();
