import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Length of a code issued to a new ticket. 62^12 ≈ 3.2 × 10^21 — not guessable. */
export const SHORT_CODE_LENGTH = 12;

/**
 * The code in a ticket's short public link, /t/[code].
 *
 * Random, like the share token it stands beside, so a link opens only the
 * ticket it was issued for; it is only shorter, for a WhatsApp message. Bytes
 * of 248 and above are skipped so every letter is equally likely (248 is the
 * largest multiple of 62 that fits in a byte).
 */
export function newPublicShortCode(length = SHORT_CODE_LENGTH): string {
  let code = "";
  while (code.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= 248) continue;
      code += ALPHABET[byte % 62];
      if (code.length === length) break;
    }
  }
  return code;
}
