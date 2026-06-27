/** Legal age gate: 만 14세 미만 차단 (spec §9). */
export const MIN_AGE = 14 as const;

/** Full years between `birthdate` (YYYY-MM-DD) and `today` (default: now). */
export function ageFromBirthdate(birthdate: string, today: Date = new Date()): number {
  const b = new Date(`${birthdate}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return Number.NaN;
  let age = today.getUTCFullYear() - b.getUTCFullYear();
  const m = today.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
}

/** True iff the person is at least MIN_AGE years old (and birthdate parses). */
export function isAgeAllowed(birthdate: string, today: Date = new Date()): boolean {
  const age = ageFromBirthdate(birthdate, today);
  return Number.isFinite(age) && age >= MIN_AGE;
}
