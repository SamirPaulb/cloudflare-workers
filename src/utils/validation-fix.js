/**
 * Sanitize HTML input to prevent XSS - FIXED VERSION
 * Important: Ampersand must be escaped FIRST, before other entities
 */
export function sanitizeHtml(input) {
  if (!input) return '';

  return input
    // CRITICAL: Must escape & first, otherwise double-escaping occurs
    .replace(/&(?!(lt|gt|quot|#39|amp);)/g, '&amp;')
    // Then escape other special characters
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
