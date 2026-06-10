import { csvEscape, rowToCsv, createCsvStream, EXPORT_COLUMNS } from '../src/csv-stream';

describe('csv-stream', () => {
  describe('csvEscape', () => {
    it('returns empty string for null/undefined', () => {
      expect(csvEscape(null)).toBe('');
      expect(csvEscape(undefined)).toBe('');
    });

    it('returns string as-is when no special chars', () => {
      expect(csvEscape('hello')).toBe('hello');
      expect(csvEscape(42)).toBe('42');
    });

    it('wraps in quotes when value contains comma', () => {
      expect(csvEscape('a,b')).toBe('"a,b"');
    });

    it('wraps in quotes and doubles quotes', () => {
      expect(csvEscape('say "hello"')).toBe('"say ""hello"""');
    });

    it('wraps in quotes when value contains newline', () => {
      expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    });

    it('serializes objects as JSON', () => {
      const result = csvEscape({ a: 1 });
      expect(result).toBe('"{""a"":1}"');
    });
  });

  describe('rowToCsv', () => {
    it('converts a record to CSV row', () => {
      const row = { id: '1', name: 'Alice', age: 30 };
      expect(rowToCsv(row, ['id', 'name', 'age'])).toBe('1,Alice,30');
    });

    it('handles missing columns', () => {
      const row = { id: '1' };
      expect(rowToCsv(row, ['id', 'name'])).toBe('1,');
    });
  });

  describe('createCsvStream', () => {
    it('streams CSV with header and rows', async () => {
      async function* generate() {
        yield { id: '1', firstName: 'Alice' };
        yield { id: '2', firstName: 'Bob' };
      }

      const stream = createCsvStream(generate(), ['id', 'firstName']);
      const chunks: string[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk.toString());
      }

      const output = chunks.join('');
      expect(output).toContain('id,firstName\n');
      expect(output).toContain('1,Alice\n');
      expect(output).toContain('2,Bob\n');
    });

    it('handles empty iterable', async () => {
      async function* generate() {
        // empty
      }

      const stream = createCsvStream(generate(), ['id']);
      const chunks: string[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk.toString());
      }

      // No header emitted if no rows
      const output = chunks.join('');
      expect(output).toBe('');
    });
  });

  describe('EXPORT_COLUMNS', () => {
    it('has columns for all entities', () => {
      expect(EXPORT_COLUMNS.members).toBeDefined();
      expect(EXPORT_COLUMNS.transactions).toBeDefined();
      expect(EXPORT_COLUMNS.ledger).toBeDefined();
      expect(EXPORT_COLUMNS.redemptions).toBeDefined();
    });
  });
});
