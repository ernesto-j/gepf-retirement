/**
 * Applies values extracted from a GEPF benefit statement to a profile.
 * Pure: returns a new Profile and never mutates the input.
 */
import type { GepfMembership, GepfStatementValues, Profile } from './types'

function nonNegativeFinite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * Fills the membership inputs from the statement where the statement carries them, stores a
 * copy of the statement block and switches `useStatementValues` on so that
 * `gepfBenefitsAtExit` prefers the statement's benefit values.
 *
 * - `pensionableServiceYears`  -> `gepf.pensionableServiceYearsNow`
 * - `finalSalaryAnnual`        -> `gepf.pensionableSalaryAnnual`
 * Missing, negative or non-numeric values leave the existing profile values untouched.
 *
 * SIMPLIFICATIONS: the statement's service is copied as-is even if the statement is a few
 * months old (the member can edit the field); the statement's "final salary" is a 24-month
 * average, which slightly understates the current pensionable salary. Two-pot components,
 * benefit values and dates are consumed by the engine via the stored statement block.
 */
export function applyStatement(profile: Profile, values: GepfStatementValues): Profile {
  const statement: GepfStatementValues = { ...values }
  if (values.uncertainFields) statement.uncertainFields = [...values.uncertainFields]

  const gepf: GepfMembership = { ...profile.gepf, statement, useStatementValues: true }
  if (nonNegativeFinite(values.pensionableServiceYears)) gepf.pensionableServiceYearsNow = values.pensionableServiceYears
  if (nonNegativeFinite(values.finalSalaryAnnual)) gepf.pensionableSalaryAnnual = values.finalSalaryAnnual

  return { ...profile, gepf }
}
