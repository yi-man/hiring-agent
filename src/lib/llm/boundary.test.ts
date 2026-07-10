import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function productionFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return productionFilesUnder(fullPath);
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) {
      return [];
    }
    return [fullPath];
  });
}

describe('llm package boundary', () => {
  it('keeps LLM runtime wrappers inside src/lib/llm', () => {
    const chatFiles = productionFilesUnder(path.join(process.cwd(), 'src/lib/chat'));
    const disallowedRuntimeImports =
      /(?:@\/lib\/llm(?:\/|')|@\/lib\/llm-observability\/|@langchain\/openai|@langchain\/core\/runnables)/;

    for (const file of chatFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(disallowedRuntimeImports);
    }
  });

  it('exposes LLM runtime wrappers through the package entrypoint', () => {
    const sourceFiles = productionFilesUnder(path.join(process.cwd(), 'src'));
    const disallowedInternalLlmImports =
      /@\/lib\/llm\/(?:openai-chat|chat-stream|langchain)(?:'|")/;

    for (const file of sourceFiles) {
      if (file.includes(`${path.sep}src${path.sep}lib${path.sep}llm${path.sep}`)) {
        continue;
      }

      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(disallowedInternalLlmImports);
    }
  });

  it('keeps the package entrypoint focused on supported runtime APIs', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/lib/llm/index.ts'), 'utf8');
    const internalExports =
      /(?:buildChatChain|buildStandaloneMessages|getConfiguredLlmProviders|getOpenAiChatCompletionsEndpoint|getConfiguredLlmChatCompletionsEndpoint|getConfiguredLlmModel|getConfiguredLlmProvider)/;

    expect(source).not.toMatch(internalExports);
  });
});
