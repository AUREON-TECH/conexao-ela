export type SignupInput = {
  name: string
  email: string
  password: string
  confirmPassword: string
  acceptedTerms: boolean
}

export type SignupError =
  | 'name_required'
  | 'invalid_email'
  | 'invalid_password'
  | 'password_mismatch'
  | 'terms_required'

export type SignupValidation =
  | { valid: true }
  | { valid: false; error: SignupError }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateSignup(input: SignupInput): SignupValidation {
  if (!input.name.trim()) return { valid: false, error: 'name_required' }
  if (!EMAIL_PATTERN.test(input.email.trim())) return { valid: false, error: 'invalid_email' }
  if (input.password.length < 6 || input.password.length > 128) return { valid: false, error: 'invalid_password' }
  if (input.password !== input.confirmPassword) return { valid: false, error: 'password_mismatch' }
  if (!input.acceptedTerms) return { valid: false, error: 'terms_required' }
  return { valid: true }
}
