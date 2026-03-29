import { describe, it, expect } from 'vitest';
import { stripHtml, isValidSolanaAddress, isPositiveSolAmount } from '../sanitize';

describe('Sanitization Utilities', () => {
  describe('stripHtml', () => {
    it('removes basic HTML tags', () => {
      expect(stripHtml('<p>Hello</p>')).toBe('Hello');
      expect(stripHtml('<b>Bold</b> text')).toBe('Bold text');
    });

    it('removes embedded script tags (XSS)', () => {
      expect(stripHtml('<script>alert("xss")</script>Secure Account')).toBe('alert("xss")Secure Account');
      expect(stripHtml('<img src="x" onerror="alert(1)">')).toBe('');
    });

    it('handles strings without HTML', () => {
      expect(stripHtml('Just a regular string 123')).toBe('Just a regular string 123');
    });

    it('trims whitespace', () => {
      expect(stripHtml('  <p> Spaced </p>  ')).toBe('Spaced');
    });

    it('handles non-string inputs gracefully', () => {
      // @ts-expect-error Testing invalid runtime input
      expect(stripHtml(null)).toBe('');
      // @ts-expect-error Testing invalid runtime input
      expect(stripHtml(123)).toBe('');
    });
  });

  describe('isValidSolanaAddress', () => {
    it('returns true for a valid Solana public key', () => {
      // System Program ID
      expect(isValidSolanaAddress('11111111111111111111111111111111')).toBe(true);
      // USDC Mint
      expect(isValidSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true);
    });

    it('returns false for an invalid address format', () => {
      expect(isValidSolanaAddress('invalid_address_format')).toBe(false);
      expect(isValidSolanaAddress('')).toBe(false);
      expect(isValidSolanaAddress('111')).toBe(false);
    });

    it('returns false for missing input', () => {
      // @ts-expect-error Testing invalid runtime input
      expect(isValidSolanaAddress(null)).toBe(false);
    });
  });

  describe('isPositiveSolAmount', () => {
    it('returns true for positive integers', () => {
      expect(isPositiveSolAmount(100)).toBe(true);
      expect(isPositiveSolAmount(0)).toBe(true);
      expect(isPositiveSolAmount(1000000000)).toBe(true);
    });

    it('returns false for negative integers', () => {
      expect(isPositiveSolAmount(-1)).toBe(false);
      expect(isPositiveSolAmount(-1000)).toBe(false);
    });

    it('returns false for floats and non-safe integers', () => {
      expect(isPositiveSolAmount(1.5)).toBe(false);
      expect(isPositiveSolAmount(NaN)).toBe(false);
      expect(isPositiveSolAmount(Infinity)).toBe(false);
      expect(isPositiveSolAmount(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    });

    it('returns false for non-number inputs', () => {
      // @ts-expect-error Testing invalid runtime input
      expect(isPositiveSolAmount('100')).toBe(false);
      // @ts-expect-error Testing invalid runtime input
      expect(isPositiveSolAmount(null)).toBe(false);
    });
  });
});
