/**
 * True for same-origin app paths like "/dashboard/teacher/classes/123".
 *
 * Rejects absolute URLs ("https://evil.example"), protocol-relative URLs
 * ("//evil.example"), backslash tricks ("/\evil.example") and schemes such as
 * "javascript:". Use it for any user-supplied link that is later navigated to,
 * e.g. notification action URLs.
 */
export function isSafeInternalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 2048 &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    !/[\u0000-\u001f]/.test(value)
  );
}
