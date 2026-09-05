/**
 * Room codes use an unambiguous alphabet — no O/0, I/1/L — because
 * students read them off a projector and type them on a phone.
 * 32^6 ≈ 1.07e9 combinations; uniqueness is still enforced by the
 * database, not by assuming collisions won't happen.
 */
import { randomInt } from 'crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
