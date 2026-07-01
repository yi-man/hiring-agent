/** @jest-environment node */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('CI workflow', () => {
  it('uses a PostgreSQL service image with pgvector installed', async () => {
    const workflow = await readFile(
      path.resolve(process.cwd(), '.github/workflows/ci.yml'),
      'utf8',
    );
    const postgresService = workflow.match(/\n      postgres:\n(?<block>(?:        .+\n)+)/)?.groups
      ?.block;

    expect(postgresService).toContain('image: pgvector/pgvector:pg16');
  });

  it('excludes real LLM integration tests from pull request Jest runs', async () => {
    const workflow = await readFile(
      path.resolve(process.cwd(), '.github/workflows/ci.yml'),
      'utf8',
    );

    expect(workflow).toContain(
      '--testPathIgnorePatterns tests/integration/chat/real-deps.e2e.test.ts',
    );
    expect(workflow).toContain(
      '--testPathIgnorePatterns tests/integration/candidate-communication/communication-flow.e2e.test.ts',
    );
  });
});
