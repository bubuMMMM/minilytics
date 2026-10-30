/*! Minilytics widgets — https://minilytics-six.vercel.app
 * <div data-minilytics-widget="live" data-token="w…" data-theme="auto"></div>
 * <script async src="https://minilytics-six.vercel.app/js/widget.js"></script>
 * Options (data-*): theme auto|light|dark · accent (hex, sans #) · size sm|md|lg · period today|24h|7d|30d|90d|12m|all
 *                   transparent 1 · locale fr|en · logo 0 · width (CSS, ex. 320px)
 */
(function () {
  var s = document.currentScript;
  var origin = s ? new URL(s.src, location.href).origin : 'https://minilytics-six.vercel.app';
  var KEYS = ['theme', 'accent', 'size', 'period', 'transparent', 'locale', 'logo'];
  var H = { live: 40, counter: 156, chart: 214, pages: 258, map: 240 };
  var frames = {};
  addEventListener('message', function (e) {
    var d = e.data;
    if (e.origin !== origin || !d || d.minilytics !== 'widget' || !frames[d.id]) return;
    var f = frames[d.id];
    if (d.h) f.style.height = d.h + 'px';
    if (f.getAttribute('data-auto-width') && d.w) f.style.width = d.w + 'px';
  });
  function mount(el) {
    if (el.getAttribute('data-ml-mounted')) return;
    var type = el.getAttribute('data-minilytics-widget') || 'live';
    var token = el.getAttribute('data-token');
    if (!token) return;
    el.setAttribute('data-ml-mounted', '1');
    var p = new URLSearchParams();
    p.set('type', type);
    KEYS.forEach(function (k) { var v = el.getAttribute('data-' + k); if (v != null && v !== '') p.set(k, String(v).replace(/^#/, '')); });
    var id = 'mlw' + Math.random().toString(36).slice(2, 10);
    p.set('wid', id);
    var f = document.createElement('iframe');
    f.src = origin + '/api/widget/' + encodeURIComponent(token) + '/embed?' + p.toString();
    f.title = el.getAttribute('data-title') || 'Statistiques Minilytics';
    f.loading = 'lazy';
    f.setAttribute('allowtransparency', 'true');
    f.setAttribute('scrolling', 'no');
    var w = el.getAttribute('data-width');
    if (type === 'live' && !w) f.setAttribute('data-auto-width', '1');
    f.style.cssText = 'border:0;display:block;background:transparent;overflow:hidden;max-width:100%;height:' + (H[type] || 140) + 'px;width:' + (w || (type === 'live' ? '240px' : '100%'));
    frames[id] = f;
    el.appendChild(f);
  }
  function scan() { var n = document.querySelectorAll('[data-minilytics-widget]'); for (var i = 0; i < n.length; i++) mount(n[i]); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  window.minilyticsWidgets = { scan: scan };
})();
