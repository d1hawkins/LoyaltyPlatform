import { csvEscape, rowToCsv, streamCsv } from '../src/csv';
import { partitionBulk, BULK_MAX_IDS } from '../src/bulk';
import { PassThrough } from 'stream';
import type { Response } from 'express';

describe('csv helpers', () => {
  it('escapes commas, quotes, newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape('a\nb')).toBe('"a\nb"');
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(42)).toBe('42');
  });

  it('rowToCsv joins escaped values', () => {
    expect(rowToCsv(['a', 'b,c', 42])).toBe('a,"b,c",42');
  });

  it('streamCsv writes header + rows to response', async () => {
    const chunks: Buffer[] = [];
    const pass = new PassThrough();
    pass.on('data', (c) => chunks.push(c as Buffer));
    const res = {
      setHeader: jest.fn(),
      write: (chunk: string) => pass.write(chunk),
      end: () => pass.end(),
    } as unknown as Response;
    const rows = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bo,b' },
    ];
    await streamCsv(res, 'out.csv', ['id', 'name'], rows);
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text).toBe('id,name\n1,Alice\n2,"Bo,b"\n');
  });
});

describe('bulk partitioner', () => {
  it('partitions into chunks', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `m${i}`);
    const p = partitionBulk(ids, 100);
    expect(p.total).toBe(250);
    expect(p.chunks).toHaveLength(3);
    expect(p.chunks[0]).toHaveLength(100);
    expect(p.chunks[2]).toHaveLength(50);
  });

  it('rejects > max', () => {
    const ids = Array.from({ length: BULK_MAX_IDS + 1 }, (_, i) => `m${i}`);
    expect(() => partitionBulk(ids)).toThrow(/exceeds maximum/);
  });

  it('empty input = no chunks', () => {
    expect(partitionBulk([]).chunks).toEqual([]);
  });
});
