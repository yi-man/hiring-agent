import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export type MarkdownChunk = {
  content: string;
  index: number;
};

export type SplitMarkdownOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
};

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 200;

const HEADING_LINE_REGEX = /^#{1,6}\s+/;

function splitByHeadings(markdown: string): string[] {
  const lines = markdown.split('\n');
  const sections: string[] = [];

  let currentSection: string[] = [];
  for (const line of lines) {
    if (HEADING_LINE_REGEX.test(line) && currentSection.length > 0) {
      sections.push(currentSection.join('\n').trim());
      currentSection = [line];
      continue;
    }
    currentSection.push(line);
  }

  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n').trim());
  }

  return sections.filter(Boolean);
}

export function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function splitMarkdownToChunks(
  markdown: string,
  options?: SplitMarkdownOptions,
): Promise<MarkdownChunk[]> {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized) {
    return [];
  }

  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  const characterSplitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
  });
  const markdownSplitter = new MarkdownTextSplitter({
    chunkSize,
    chunkOverlap,
  });

  const headingAwareSections = splitByHeadings(normalized);
  const chunks: MarkdownChunk[] = [];

  for (const section of headingAwareSections) {
    const splitParts = await markdownSplitter.splitText(section);
    const refinedParts: string[] = [];

    for (const part of splitParts) {
      if (part.length <= chunkSize) {
        refinedParts.push(part);
        continue;
      }
      const fallbackParts = await characterSplitter.splitText(part);
      refinedParts.push(...fallbackParts);
    }

    for (const part of refinedParts) {
      const content = part.trim();
      if (!content) {
        continue;
      }
      chunks.push({
        content,
        index: chunks.length,
      });
    }
  }

  return chunks;
}
