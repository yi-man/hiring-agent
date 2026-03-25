export function resolveInstruction(
  extraInstruction?: string,
  currentJdRaw?: string,
): { instruction: string; source: 'input' | 'inline' | 'none' } {
  if (extraInstruction?.trim()) {
    return { instruction: extraInstruction.trim(), source: 'input' };
  }

  if (!currentJdRaw?.trim()) {
    return { instruction: '', source: 'none' };
  }

  const lines = currentJdRaw.split('\n');
  const firstNonEmpty = lines.find((line) => line.trim().length > 0)?.trim() ?? '';

  if (firstNonEmpty.startsWith('#指令:')) {
    return {
      instruction: firstNonEmpty.replace('#指令:', '').trim(),
      source: 'inline',
    };
  }

  if (firstNonEmpty.startsWith('【要求】')) {
    return {
      instruction: firstNonEmpty.replace('【要求】', '').trim(),
      source: 'inline',
    };
  }

  return { instruction: '', source: 'none' };
}
