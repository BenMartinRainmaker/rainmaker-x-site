/* ==============================================================
   Rainmaker X · boot
   The only place that knows the file list and load order. Scripts
   are classic scripts sharing one scope, so ORDER MATTERS:
   config → data (helpers, catalog, state, API) → app (helpers,
   components, views, router). Each URL carries a timestamp so a
   plain reload always picks up edits (no build step, no cache).
   ============================================================== */
'use strict';

(function boot() {
  const FILES = [
    'config.js',
    // data layer → window.Data
    'data/util.js',
    'data/catalog.js',
    'data/generators.js',
    'data/staff-session.js',
    'data/state.js',
    'data/api-market.js',
    'data/api-trading.js',
    'data/api-messages.js',
    'data/api-settlements.js',
    'data/api-matches.js',
    'data/api-account.js',
    'data/api-membership.js',
    'data/api-staff.js',
    'data/api-exports.js',
    // app layer (rendering)
    'app/util.js',
    'app/charts.js',
    'app/components.js',
    'app/components-trade.js',
    'app/navigator.js',
    'app/header.js',
    'app/views-home.js',
    'app/views-market.js',
    'app/views-orders.js',
    'app/views-matches.js',
    'app/views-account.js',
    'app/views-messages.js',
    'app/views-products.js',
    'app/views-staff.js',
    'app/router.js',
  ];
  const stamp = Date.now();

  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'styles.css?v=' + stamp;
  document.head.appendChild(css);

  // Scripts go in once the DOM exists (the router renders into #main on load).
  // async = false keeps execution in list order even though the tags are injected dynamically.
  document.addEventListener('DOMContentLoaded', () => {
    FILES.forEach(src => {
      const s = document.createElement('script');
      s.src = src + '?v=' + stamp; s.async = false;
      document.head.appendChild(s);
    });
  });
})();
