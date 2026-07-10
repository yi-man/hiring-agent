import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, 'src');
const llmRoot = path.join(srcRoot, 'lib/llm');
const llmObservabilityRoot = path.join(srcRoot, 'lib/llm-observability');
const internalLlmModules = ['openai-chat', 'chat-stream', 'langchain'];

function productionFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return productionFilesUnder(fullPath);
    }
    if (
      (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) ||
      entry.endsWith('.test.ts') ||
      entry.endsWith('.test.tsx')
    ) {
      return [];
    }
    return [fullPath];
  });
}

function moduleSpecifiersIn(source: string): string[] {
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((pattern) =>
    Array.from(source.matchAll(pattern)).map((match) => match[1] ?? ''),
  );
}

function resolvedProjectPath(fromFile: string, specifier: string): string | undefined {
  if (specifier.startsWith('@/')) {
    return path.join(srcRoot, specifier.slice(2));
  }
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  return undefined;
}

function stripKnownExtension(filePath: string): string {
  return filePath.replace(/\.(?:tsx?|jsx?)$/, '');
}

function isInsidePath(filePath: string, parent: string): boolean {
  const relativePath = path.relative(parent, stripKnownExtension(filePath));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isInternalLlmRuntimeImport(fromFile: string, specifier: string): boolean {
  const resolvedPath = resolvedProjectPath(fromFile, specifier);
  if (!resolvedPath) {
    return false;
  }

  return internalLlmModules.some((moduleName) =>
    isInsidePath(resolvedPath, path.join(llmRoot, moduleName)),
  );
}

function isDirectLlmRuntimeImport(specifier: string): boolean {
  return specifier === '@langchain/openai' || specifier.startsWith('@langchain/core/runnables');
}

describe('llm package boundary', () => {
  it('keeps LLM runtime wrappers inside src/lib/llm', () => {
    const chatFiles = productionFilesUnder(path.join(srcRoot, 'lib/chat'));

    for (const file of chatFiles) {
      const source = readFileSync(file, 'utf8');
      const specifiers = moduleSpecifiersIn(source);
      const disallowedRuntimeImports = specifiers.filter((specifier) => {
        const resolvedPath = resolvedProjectPath(file, specifier);
        return (
          specifier === '@/lib/llm' ||
          isInternalLlmRuntimeImport(file, specifier) ||
          (resolvedPath ? isInsidePath(resolvedPath, llmObservabilityRoot) : false) ||
          isDirectLlmRuntimeImport(specifier)
        );
      });

      expect(disallowedRuntimeImports).toEqual([]);
    }
  });

  it('exposes LLM runtime wrappers through the package entrypoint', () => {
    const sourceFiles = productionFilesUnder(srcRoot);

    for (const file of sourceFiles) {
      if (file.includes(`${path.sep}src${path.sep}lib${path.sep}llm${path.sep}`)) {
        continue;
      }

      const source = readFileSync(file, 'utf8');
      const disallowedInternalImports = moduleSpecifiersIn(source).filter(
        (specifier) =>
          isInternalLlmRuntimeImport(file, specifier) || isDirectLlmRuntimeImport(specifier),
      );
      expect(disallowedInternalImports).toEqual([]);
    }
  });

  it('keeps the package entrypoint focused on supported runtime APIs', () => {
    const source = readFileSync(path.join(llmRoot, 'index.ts'), 'utf8');
    const internalExports =
      /(?:buildChatChain|buildStandaloneMessages|getConfiguredLlmProviders|getOpenAiChatCompletionsEndpoint|getConfiguredLlmChatCompletionsEndpoint|getConfiguredLlmModel|getConfiguredLlmProvider)/;
    const wildcardInternalExports =
      /export\s+(?:type\s+)?\*\s+from\s+['"]\.\/(?:openai-chat|chat-stream|langchain)['"]/;

    expect(source).not.toMatch(internalExports);
    expect(source).not.toMatch(wildcardInternalExports);
  });
});
