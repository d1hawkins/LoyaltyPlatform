import { generateCodes } from '../src/code-generator';

describe('generateCodes', () => {
  it('generates the requested number of unique codes', () => {
    const codes = generateCodes(100);
    expect(codes).toHaveLength(100);
    expect(new Set(codes).size).toBe(100);
  });

  it('generates codes with prefix', () => {
    const codes = generateCodes(10, 'SALE');
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^SALE-/);
    }
  });

  it('generates uppercase codes', () => {
    const codes = generateCodes(5);
    for (const code of codes) {
      expect(code).toBe(code.toUpperCase());
    }
  });

  it('generates codes of expected length', () => {
    const codes = generateCodes(5, undefined, 12);
    for (const code of codes) {
      expect(code.length).toBe(12);
    }
  });

  it('generates codes with prefix of expected length', () => {
    const codes = generateCodes(5, 'TST', 8);
    for (const code of codes) {
      // TST- (4 chars) + 8 random = 12
      expect(code.length).toBe(12);
    }
  });

  it('handles count of 1', () => {
    const codes = generateCodes(1);
    expect(codes).toHaveLength(1);
  });
});
