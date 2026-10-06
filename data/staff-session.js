/* ==============================================================
   Rainmaker X · data · staff session
   Passcode gate for staff roles: sessionStorage only, idle lock, everything audited.
   ============================================================== */
'use strict';

// ---------------- staff access (session-only, idle lock, audited) ----------------
// Staff mode never touches localStorage: the role lives in sessionStorage for this tab only, expires after
// STAFF_IDLE minutes without activity, and every entry, lock and denied access is written to the audit log.
// This is prototype-level protection. In production the console must be served only to authenticated staff
// (server-side auth + MFA + role checks) and staff data must never be shipped to a member's browser.
const STAFF_KEY = RX_CONFIG.storage.staffSessionKey;
const STAFF_IDLE = RX_CONFIG.staff.idleMs;
const hash53 = (str, seed = 0x5f3759df) => { let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed; for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16); };
const STAFF_PASS_HASH = hash53(RX_CONFIG.staff.demoPasscode); // only the hash is compared; real identity is server-side
function readStaff() { try { return JSON.parse(sessionStorage.getItem(STAFF_KEY)) || null; } catch (e) { return null; } }
function staffSession() { const s_ = readStaff(); if (!s_ || !s_.role) return null; if (Date.now() - s_.last > STAFF_IDLE) { sessionStorage.removeItem(STAFF_KEY); audit('staff.lock', s_.role + ' · idle timeout', 'system'); save(); return null; } return s_; }
