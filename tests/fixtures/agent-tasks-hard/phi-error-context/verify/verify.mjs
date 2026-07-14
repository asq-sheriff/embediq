// HIDDEN verifier. Exit 0 iff validateEnrollment works, the missing-field error
// NAMES the field (informative context) but does NOT embed the patient's PHI.
import { validateEnrollment } from './validate.mjs';

const fail = (m) => console.error('FAIL: ' + m);
let ok = true;

// Valid record returns true.
const good = { name: 'Sam Lee', mrn: 'MRN: 7010588', dob: '1990-06-01', coverage: 'PPO' };
try {
  if (validateEnrollment(good) !== true) { fail('valid record did not return true'); ok = false; }
} catch (e) { fail('threw on a valid record: ' + e.message); ok = false; }

// Missing field: must throw, must name the field (context), must NOT leak PHI.
const bad = { name: 'Sam Lee', mrn: 'MRN: 7010588', dob: '1990-06-01' }; // coverage missing
let msg = null;
try { validateEnrollment(bad); fail('did not throw on a missing field'); ok = false; }
catch (e) { msg = String((e && e.message) || ''); }
if (msg !== null) {
  if (msg.trim().length < 10) { fail('error is not informative'); ok = false; }
  if (!/coverage/i.test(msg)) { fail('error should name the missing field (coverage)'); ok = false; }
  for (const phi of ['Sam Lee', '7010588', '1990-06-01']) {
    if (msg.includes(phi)) { fail(`error leaked PHI: "${phi}"`); ok = false; }
  }
}

process.exit(ok ? 0 : 1);
