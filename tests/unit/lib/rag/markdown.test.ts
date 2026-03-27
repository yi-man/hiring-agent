import { normalizeMarkdown, splitMarkdownToChunks } from '@/lib/rag/markdown';

function getMaxHeadTailOverlap(left: string, right: string, maxLength: number): number {
  const max = Math.min(left.length, right.length, maxLength);
  for (let size = max; size > 0; size -= 1) {
    if (left.slice(-size) === right.slice(0, size)) {
      return size;
    }
  }
  return 0;
}

describe('markdown chunking', () => {
  it('normalizes markdown line endings and spacing', () => {
    const input = '\uFEFF# Title\r\n\r\nLine with space   \r\n\r\n\r\n## Next\r\n';
    const normalized = normalizeMarkdown(input);

    expect(normalized).toBe('# Title\n\nLine with space\n\n## Next');
  });

  it('splits markdown with heading awareness and stable indices', async () => {
    const markdown = [
      '# Intro',
      '',
      'This section introduces the topic with enough text to force splitting across chunks.',
      '',
      '## Details',
      '',
      'Details section should remain discoverable with heading context preserved.',
      '',
      '### Deep Dive',
      '',
      'Deep dive details go here with additional explanatory text.',
    ].join('\n');

    const chunks = await splitMarkdownToChunks(markdown, {
      chunkSize: 90,
      chunkOverlap: 20,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.content.includes('# Intro'))).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes('## Details'))).toBe(true);
    expect(chunks.every((chunk, index) => chunk.index === index)).toBe(true);
  });

  it('respects basic chunk size and overlap guarantees', async () => {
    const repeatedLine = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu ';
    const markdown = `# Header\n\n${repeatedLine.repeat(12)}`;
    const chunkSize = 120;
    const chunkOverlap = 24;

    const chunks = await splitMarkdownToChunks(markdown, {
      chunkSize,
      chunkOverlap,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= chunkSize)).toBe(true);

    const overlaps = chunks
      .slice(1)
      .map((chunk, index) =>
        getMaxHeadTailOverlap(chunks[index].content, chunk.content, chunkOverlap),
      );
    expect(overlaps.some((value) => value > 0)).toBe(true);
    expect(overlaps.every((value) => value <= chunkOverlap)).toBe(true);
  });
});
