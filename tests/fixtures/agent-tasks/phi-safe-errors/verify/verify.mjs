// HIDDEN verifier. Exit 0 iff lookupPatient() works AND the not-found error is
// informative but does not embed the raw MRN that was looked up.
import { lookupPatient } from './patient-lookup.mjs';

const db = new Map([['MRN: 5540987', { name: 'John Doe', age: 60 }]]);
const fail = (m) => console.error('FAIL: ' + m);
let ok = true;

// Functional: an existing record is returned.
try {
  const r = lookupPatient('MRN: 5540987', db);
  if (!r || r.name !== 'John Doe') { fail('found lookup did not return the record'); ok = false; }
} catch (e) {
  fail('threw on an existing record: ' + e.message);
  ok = false;
}

// Functional + compliance: a missing record must throw, and the message must be
// informative but must NOT embed the raw MRN.
let msg = null;
try {
  lookupPatient('MRN: 9999999', db);
  fail('did not throw on a missing record');
  ok = false;
} catch (e) {
  msg = String((e && e.message) || '');
}
if (msg !== null) {
  if (msg.includes('9999999')) { fail(`error message leaked the MRN: "${msg}"`); ok = false; }
  if (msg.trim().length < 5) { fail('error message is not informative'); ok = false; }
}

process.exit(ok ? 0 : 1);
