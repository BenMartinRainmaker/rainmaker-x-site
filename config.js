/* ==============================================================
   Rainmaker X · configuration
   Every value someone might want to change without reading the
   code lives here: storage keys, staff session rules, broker fees,
   the demo member, support contact, logo services. Loaded first
   and frozen, so nothing can change it at runtime.
   Production note: secrets never belong in this file. The demo
   passcode is here only because the prototype prints it on the
   staff gate; real staff identity is server-side with MFA.
   ============================================================== */
'use strict';

// Freeze nested objects too, so a typo like RX_CONFIG.fees.buy = 1 throws instead of silently changing fees.
function deepFreeze(o) { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); }

const RX_CONFIG = deepFreeze({
  app: {
    name: 'Rainmaker X',
    version: '7.1',
    broker: 'Rainmaker Securities',
    site: 'rainmakersecurities.com',
  },

  // Browser storage. Bump the key when the saved shape changes so old data is discarded.
  storage: {
    key: 'exchange-prototype-v3',
    staffSessionKey: 'rx-staff-session',
    navKey: 'rx-nav-history',
    rainKey: 'rx-rain',   // sessionStorage: '1' once the member pressed "Make it rain" on the home hero (Ben, Oct 1 2026)          // in-app Back / Forward history (sessionStorage, per tab)
  },

  // Staff console gate (prototype). Session lives in sessionStorage and locks after idleMs.
  staff: {
    idleMs: 15 * 60 * 1000,
    demoPasscode: '1234',
  },

  // The member the prototype signs in as. Days are relative to the sample "now".
  demoMember: {
    name: 'Ben Martin',
    initials: 'BM',
    email: 'ben@rainmakerx.com',
    firm: 'Rainmaker X',
    rep: 'rep-2',
    investorType: 'accredited',
    basis: ['income'],
    memberSinceDays: 400,
    verifiedDays: 380,
  },

  // Broker fees: 3% buy side, 2% sell side, floor of $500. Staff can override per deal.
  fees: {
    buy: 0.03,
    sell: 0.02,
    brokerage: 0.03,
    brokerageMin: 500,
  },

  // Operations support channel (not a broker). Shown on Messages and the Contact panel.
  support: {
    name: 'Rainmaker Securities support',
    email: 'support@rainmakersecurities.com',
    phone: '+1 (212) 555-0100',
    hours: 'Mon–Fri 8am–7pm ET',
  },

  // "Give us feedback" section in the profile menu (Ben, Oct 8 2026): a 1-5 rating, a topic and free text, sent to support.
  feedback: {
    topics: { app: 'The app overall', orders: 'Placing and matching orders', account: 'Account and money', products: 'Funds, SPVs and Alternatives', idea: 'A feature idea', bug: 'Something is broken' },
    maxLength: 1500,
  },

  // Fill rules a member can put on any bid or ask (Ben, Sep 30 2026): match any amount, the entire quantity only, or chunks of at least N shares.
  fillRules: {
    partial: 'Partial fills accepted',
    aon: 'All-or-none',
    min: 'Minimum fill',
  },

  // Investor-class filter on the back-office Orders tab (Ben, Oct 1 2026): "qualified" = a verified accredited investor, QIB or institution.
  investorFilters: {
    all: 'All investors',
    qualified: 'Qualified investors only',
    institution: 'Institutions + QIBs',
    accredited: 'Accredited individuals',
    unverified: 'Not yet verified',
  },

  // Order-value buckets (shares × price, in dollars) for the Orders tab and Market activity filters (Ben, Oct 1 2026).
  orderValueBuckets: [
    ['all', 'Any order value', 0, Infinity],
    ['a', 'Under $100K', 0, 1e5],
    ['b', '$100K – $500K', 1e5, 5e5],
    ['c', '$500K – $1M', 5e5, 1e6],
    ['d', '$1M – $5M', 1e6, 5e6],
    ['e', '$5M – $25M', 5e6, 25e6],
    ['f', 'Over $25M', 25e6, Infinity],
  ],

  // Accreditation is valid for a year; members are nudged to renew this many days before.
  verification: {
    validDays: 365,
    renewalNoticeDays: 45,
  },

  products: {
    liquidSecuritySpread: 0.025,   // Liquid Security: standing Rainmaker bid at RX price less this spread
    spvBuybackSpread: 0.03,        // SPV units: when Rainmaker provides liquidity it buys units back at unit value less this spread
    spvMinUnits: 1,                // smallest SPV unit trade
  },

  // Company logos are fetched from public icon services by domain. Some domains only look right
  // from Google's favicon service, so they are pinned to it. Order = try first … last.
  logos: {
    pinnedToGoogle: ['databricks.com', 'revolut.com', 'anduril.com'],
    google: d => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`,
    unavatar: d => `https://unavatar.io/${d}?fallback=false`,
    iconHorse: d => `https://icon.horse/icon/${d}`,
  },

  // File-name prefix for CSV / JSON downloads.
  exports: {
    filePrefix: 'rainmaker-x',
  },
});
