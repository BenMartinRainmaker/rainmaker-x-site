/* ==============================================================
   Rainmaker X · data · low-level helpers
   Seeded random numbers, string hashing and the "now" the sample data is anchored to.
   ============================================================== */
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const DAY = 86400000;
const NOW = new Date(); NOW.setMinutes(0, 0, 0);
const NOW_T = NOW.getTime();

// ---------------- company catalogue ----------------
// Real late-stage private companies: names, sectors, descriptions, last-round data and investors are from public reporting (approximate, mid-2026).
