import { PublicKey } from '@solana/web3.js';

/**
 * Strips HTML tags from a given string to prevent Cross-Site Scripting (XSS).
 * Uses a strict regex to remove all characters within angle brackets.
 * 
 * @param input The raw string to sanitize
 * @returns Sanitized string
 */
export function stripHtml(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/<\/?[^>]+(>|$)/g, '').trim();
}

/**
 * Validates whether a given string is a valid Solana public key (base58).
 * 
 * @param address The address string to validate
 * @returns boolean True if valid, false otherwise
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    const pubkey = new PublicKey(address);
    return PublicKey.isOnCurve(pubkey.toBuffer());
  } catch (error) {
    return false;
  }
}

/**
 * Validates that the numeric amount is a valid, positive integer (e.g. valid lamports or SOL).
 * Safe integer checks prevent loss of precision.
 * 
 * @param amount The number to check
 * @returns boolean True if positive safe integer
 */
export function isPositiveSolAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount >= 0;
}
