/**
 * HTML Sanitization utilities
 * Prevents XSS attacks by escaping HTML entities
 */

/**
 * Escape HTML entities to prevent XSS attacks
 * IMPORTANT: Escape ampersands first to avoid double-escaping
 */
export function escapeHtml(unsafe) {
  if (!unsafe) return '';

  return String(unsafe)
    .replace(/&/g, '&amp;')     // Must be first to avoid double-escaping
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\//g, '&#x2F;');  // Forward slash for attribute contexts
}

/**
 * Sanitize HTML content by escaping dangerous characters
 * Allows safe HTML tags if needed
 */
export function sanitizeHtml(html) {
  if (!html) return '';

  // For now, escape everything. In future, could use a library
  // like DOMPurify if we need to allow some HTML tags
  return escapeHtml(html);
}

/**
 * Sanitize user input for safe storage and display
 */
export function sanitizeInput(input) {
  if (!input) return '';

  // Remove any control characters and trim
  return String(input)
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim();
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email) {
  if (!email) return '';

  // Basic email sanitization
  return String(email)
    .toLowerCase()
    .trim()
    .replace(/[^\w.@+-]/g, ''); // Keep only valid email characters
}