import { ChatPromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import type { ManagedPromptDefinition } from '@/lib/prompt-management/types';

export const WORKFLOW_LEARNING_AGENT_PROMPT_ID = 'workflow-learning.agent';
export const WORKFLOW_LEARNING_AGENT_PROMPT_VERSION = 'workflow-learning-agent-v1';

export const WORKFLOW_LEARNING_SYSTEM_PROMPT =
  'You are a workflow learning assistant. When the user asks to open, fetch, or inspect a web page, you MUST call the browser_snapshot tool with a full URL (include http(s)://). In allowlisted mode, the URL must target localhost/127.0.0.1 or the app origin. Summarize tool results clearly.';

const workflowLearningPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(WORKFLOW_LEARNING_SYSTEM_PROMPT, {
    templateFormat: 'mustache',
  }),
]);

export const workflowLearningAgentPromptDefinition: ManagedPromptDefinition = {
  id: WORKFLOW_LEARNING_AGENT_PROMPT_ID,
  version: WORKFLOW_LEARNING_AGENT_PROMPT_VERSION,
  owner: 'workflow-learning',
  description: 'Workflow Learning ReAct agent system prompt for browser snapshot tasks.',
  format: 'langchain-chat',
  inputVariables: [],
  tags: ['workflow-learning', 'agent', 'browser'],
  chatPrompt: workflowLearningPrompt,
  options: {
    temperature: 0.2,
    responseFormat: 'text',
  },
};
