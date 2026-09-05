/* ============================================================
   Input limits shared with the API's validators. Keep these in
   step with the DTOs — the server is the authority, the browser
   just stops the obvious mistakes before a round trip.
   ============================================================ */

/** Most questions one AI generation may produce — quiz draft or exam paper. */
export const MAX_QUESTIONS = 50;

/** Ceiling for any single mark value: an assignment total, a quiz question, a paper subpart. */
export const MAX_MARKS = 100;

/**
 * A display name is letters only — any script, with spaces, apostrophes,
 * hyphens and dots between them. Digits are rejected. HTML `pattern` is
 * compiled with the `v` flag, so the hyphen must be escaped in the class.
 */
export const NAME_PATTERN = "\\p{L}[\\p{L} '.\\-]*";
/** The same rule for forms that validate in code rather than through the browser. */
export const NAME_RULE = /^\p{L}[\p{L} '.-]*$/u;
export const NAME_HINT = 'Use letters only; numbers are not allowed in a name.';
