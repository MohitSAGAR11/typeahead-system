import { BatchWriter } from '../jobs/BatchWriter';
jest.mock('../repositories/SearchQueryRepository', () => ({
  searchQueryRepo: {
    batchUpsert: jest.fn().mockResolvedValue(undefined),
    recordRecentEvent: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../cache/CacheManager', () => ({
  getCacheManager: () => ({
    invalidate: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('../utils/metrics', () => ({
  metrics: {
    recordBatchFlush: jest.fn(),
    recordDbWrite: jest.fn(),
  },
}));
describe('BatchWriter', () => {
  let bw: BatchWriter;
  beforeEach(() => {
    bw = new BatchWriter(5, 60000); 
  });
  afterEach(() => {
    bw.stop();
  });
  it('buffers entries without flushing', () => {
    bw.add('react');
    bw.add('python');
    const stats = bw.getStats();
    expect(stats.bufferSize).toBe(2);
    expect(stats.pendingUpdates).toBe(2);
  });
  it('aggregates duplicate queries', () => {
    bw.add('react');
    bw.add('react');
    bw.add('react');
    const stats = bw.getStats();
    expect(stats.bufferSize).toBe(1); 
    expect(stats.pendingUpdates).toBe(3); 
  });
  it('auto-flushes when batch size threshold is reached', async () => {
    bw.add('a'); bw.add('b'); bw.add('c'); bw.add('d'); bw.add('e');
    await new Promise(r => setTimeout(r, 50)); 
    const stats = bw.getStats();
    expect(stats.bufferSize).toBe(0); 
  });
  it('tracks write savings correctly', async () => {
    bw.add('react'); bw.add('react'); bw.add('react');
    bw.add('python'); bw.add('python'); 
    await bw.flush('test');
    const stats = bw.getStats();
    expect(stats.totalFlushes).toBe(1);
    expect(stats.totalWritesSaved).toBe(3);
  });
  it('clears buffer after flush', async () => {
    bw.add('react');
    bw.add('python');
    await bw.flush('test');
    expect(bw.getStats().bufferSize).toBe(0);
  });
  it('peekBuffer returns current state', () => {
    bw.add('react');
    bw.add('react');
    bw.add('java');
    const peek = bw.peekBuffer();
    expect(peek.find(e => e.query === 'react')?.delta).toBe(2);
    expect(peek.find(e => e.query === 'java')?.delta).toBe(1);
  });
});
