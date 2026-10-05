import { describe, expect, it } from 'vitest'
import { validateSignup } from './signup'

const valid = {
  name: 'Ana Silva',
  email: 'ana@example.test',
  password: '1234567890',
  confirmPassword: '1234567890',
  acceptedTerms: true,
}

describe('Conexão Ela signup validation', () => {
  it('accepts a complete valid signup', () => {
    expect(validateSignup(valid)).toEqual({ valid: true })
  })

  it('requires a name', () => {
    expect(validateSignup({ ...valid, name: '   ' })).toEqual({ valid: false, error: 'name_required' })
  })

  it('requires a valid email', () => {
    expect(validateSignup({ ...valid, email: 'email-invalido' })).toEqual({ valid: false, error: 'invalid_email' })
  })

  it('requires a password between 6 and 128 characters', () => {
    expect(validateSignup({ ...valid, password: '12345', confirmPassword: '12345' })).toEqual({ valid: false, error: 'invalid_password' })
  })

  it('requires matching password confirmation', () => {
    expect(validateSignup({ ...valid, confirmPassword: 'abcdefghij' })).toEqual({ valid: false, error: 'password_mismatch' })
  })

  it('requires terms acceptance', () => {
    expect(validateSignup({ ...valid, acceptedTerms: false })).toEqual({ valid: false, error: 'terms_required' })
  })
})
