import { candidateEvaluationPromptDefinition } from '@/lib/candidate-screening/prompts';
import { chatAssistantPromptDefinition } from '@/lib/chat/prompts';
import { candidateCommunicationPromptDefinition } from '@/lib/candidate-communication/prompts';
import {
  jdEvaluatePromptDefinition,
  jdGeneratePromptDefinition,
  jdImprovePromptDefinition,
} from '@/lib/jd-agent/prompts';
import { workflowLearningAgentPromptDefinition } from '@/lib/workflow-learning/prompts';
import type { ManagedPromptDefinition, RenderedManagedPrompt } from './types';
import { createPromptRegistry } from './registry';

const MANAGED_PROMPTS = [
  candidateEvaluationPromptDefinition,
  jdGeneratePromptDefinition,
  jdEvaluatePromptDefinition,
  jdImprovePromptDefinition,
  chatAssistantPromptDefinition,
  candidateCommunicationPromptDefinition,
  workflowLearningAgentPromptDefinition,
] as const satisfies readonly ManagedPromptDefinition[];

export const appPromptRegistry = createPromptRegistry(MANAGED_PROMPTS);

export function listManagedPrompts(): ManagedPromptDefinition[] {
  return appPromptRegistry.list();
}

export function getManagedPrompt(id: string): ManagedPromptDefinition {
  return appPromptRegistry.get(id);
}

export function renderManagedPrompt(
  id: string,
  variables: Record<string, unknown>,
): Promise<RenderedManagedPrompt> {
  return appPromptRegistry.render(id, variables);
}
