import { extractTextFromMessageContent, extractWorkflowDslFromText } from './agent-runner';

describe('extractTextFromMessageContent', () => {
  it('reads string content', () => {
    expect(extractTextFromMessageContent({ content: 'hello' })).toBe('hello');
  });

  it('joins array of text parts', () => {
    expect(
      extractTextFromMessageContent({
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      }),
    ).toBe('ab');
  });
});

describe('extractWorkflowDslFromText', () => {
  it('parses a fenced JSON workflow DSL from model output', () => {
    const workflow = extractWorkflowDslFromText(`
Here is the workflow:
\`\`\`json
{
  "schemaVersion": "1.0",
  "metadata": {
    "name": "Read first message",
    "description": "Open messages and read the first item.",
    "domain": "recruiting"
  },
  "steps": [
    {
      "id": "open",
      "type": "browser_action",
      "action": "navigate",
      "target": { "url": "https://example.com/messages" }
    }
  ]
}
\`\`\`
`);

    expect(workflow?.metadata.name).toBe('Read first message');
    expect(workflow?.steps[0].type).toBe('browser_action');
  });

  it('returns null when the model output does not contain a valid workflow DSL', () => {
    expect(extractWorkflowDslFromText('普通聊天回复')).toBeNull();
  });
});
