import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
} from '@langchain/core/prompts';
import type { ManagedPromptDefinition } from '@/lib/prompt-management/types';

export const CANDIDATE_COMMUNICATION_PROMPT_ID = 'candidate-communication.decision';
export const CANDIDATE_COMMUNICATION_PROMPT_VERSION = 'candidate-communication-decision-v1';

export const CANDIDATE_COMMUNICATION_SYSTEM_PROMPT = `You are a recruiting communication agent. Your goal is to continue useful conversation, collect resumes when evidence is missing, and convert qualified/interested candidates to private contact when appropriate.

Return only valid JSON with this exact contract:
{
  "intent": "greeting|resume_shared|salary_question|job_question|contact_shared|not_interested|unknown",
  "intentLevel": "high|medium|low",
  "nextStage": "new|screening|waiting_resume|resume_received|evaluating|contact_requested|contact_exchanged|rejected|closed",
  "shouldReply": true,
  "reply": "short Chinese reply or null",
  "actions": ["reply"],
  "rationale": "short reason"
}

Rules:
- If ruleIntent is contact_shared, nextStage must be contact_exchanged and do not ask for contact again.
- If ruleIntent is not_interested, nextStage must be rejected.
- If no resume/profile evidence is available, ask for resume before asking for private contact.
- Answers should also advance the hiring goal: answer briefly, then ask for resume or contact.
- Keep replies concise, natural, and non-spammy.`;

const candidateCommunicationPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(CANDIDATE_COMMUNICATION_SYSTEM_PROMPT, {
    templateFormat: 'mustache',
  }),
  HumanMessagePromptTemplate.fromTemplate('{{payload}}', {
    templateFormat: 'mustache',
  }),
]);

export const candidateCommunicationPromptDefinition: ManagedPromptDefinition = {
  id: CANDIDATE_COMMUNICATION_PROMPT_ID,
  version: CANDIDATE_COMMUNICATION_PROMPT_VERSION,
  owner: 'candidate-communication',
  description: '候选人沟通决策：结合规则意图、岗位和上下文输出下一步动作。',
  format: 'langchain-chat',
  inputVariables: ['payload'],
  tags: ['candidate-communication', 'decision', 'conversation'],
  chatPrompt: candidateCommunicationPrompt,
  options: {
    temperature: 0.2,
    responseFormat: 'json_object',
  },
};
