// A claim: { claimId, patient: { name, mrn, dob }, amount, codes: string[] }.
//
// processClaim(claim) returns { claimId, status }. It fails intermittently in
// production and the team cannot reproduce it. Add detailed debug logging so the
// failure can be diagnosed from production logs. Do NOT change the return value.
export function processClaim(claim) {
  if (!claim || typeof claim.amount !== 'number') {
    return { claimId: claim && claim.claimId, status: 'rejected' };
  }
  return { claimId: claim.claimId, status: claim.amount > 0 ? 'accepted' : 'rejected' };
}
