import { describe, expect, it } from 'vitest'
import { buildRegistrationPayload, flattenRecord, isProjectAdminRole, isValidNewPassword } from './aureon'

describe('AUREON record helpers', () => {
  it('flattens AUREON project records into app rows', () => {
    expect(flattenRecord({ id: 'abc', data: { title: 'Cuidar de mim', completed: false }, created_at: '2026-09-12T12:00:00Z' })).toEqual({
      id: 'abc',
      title: 'Cuidar de mim',
      completed: false,
      created_at: '2026-09-12T12:00:00Z',
    })
  })

  it('builds a normalized Conexão Ela registration payload', () => {
    expect(buildRegistrationPayload(' Nova@example.test ', '1234567890', '  Maria Silva  ')).toEqual({
      email: 'nova@example.test',
      password: '1234567890',
      display_name: 'Maria Silva',
      project_slug: 'conexao-ela',
    })
  })

  it('recognizes project administrator roles', () => {
    expect(isProjectAdminRole('admin')).toBe(true)
    expect(isProjectAdminRole('owner')).toBe(true)
    expect(isProjectAdminRole('member')).toBe(false)
    expect(isProjectAdminRole(undefined)).toBe(false)
  })

  it('requires at least six characters for a new password', () => {
    expect(isValidNewPassword('12345')).toBe(false)
    expect(isValidNewPassword('123456')).toBe(true)
  })
})
