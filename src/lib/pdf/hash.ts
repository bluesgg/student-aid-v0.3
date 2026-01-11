/**
 * PDF hashing utilities for content deduplication.
 * Supports both text-based and binary-based hashing.
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
 * Generate a SHA-256 hash of PDF binary content.
 * Used for cross-user deduplication in shared cache.
 * Same PDF file = same hash, regardless of filename or upload location.
 * 
 * @param pdfBuffer - PDF file as Buffer
 * @returns SHA-256 hash as 64-character hex string
 */
export function calculatePDFBinaryHash(pdfBuffer: Buffer): string {
  return createHash('sha256').update(pdfBuffer).digest('hex')
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

/**
 * Validate that a hash string is a valid SHA-256 hex hash.
 * @param hash - Hash string to validate
 * @returns true if valid SHA-256 hex hash (64 characters, hex only)
 */
export function isValidSHA256Hash(hash: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(hash)
}
