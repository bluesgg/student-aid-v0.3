/**
 * Generates a SHA-256 hash of PDF text content for deduplication.
 */

import { createHash } from 'crypto'

/**
 * Generate a SHA-256 hash of the text content.
 * Used for deduplication and detecting if content has changed.
 * @param textContent - Text extracted from PDF
 * @returns SHA-256 hash as hex string
 */
export function generateContentHash(textContent: string): string {
  // Normalize whitespace before hashing
  const normalized = textContent.replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(normalized).digest('hex')
}

/**
 * Check if a content hash matches another.
 * @param hash1 - First hash
 * @param hash2 - Second hash
 * @returns true if hashes match
 */
export function hashesMatch(hash1: string, hash2: string): boolean {
  return hash1.toLowerCase() === hash2.toLowerCase()
}
