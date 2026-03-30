import { extractTextFromMessageContent } from './agent-runner';

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
