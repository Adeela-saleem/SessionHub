import type { Role } from './types';

/** Every role has exactly one home, and the API enforces the same split. */
export function homeFor(role: Role) {
  return role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/student';
}
