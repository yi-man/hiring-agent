import { decideCandidateAction, scoreCandidate } from './scoring';

describe('candidate scoring', () => {
  it('computes weighted total and clamps it', () => {
    expect(
      scoreCandidate({ skill: 90, domain: 80, ability: 70, risk: 20, llmBonus: 5 }).total,
    ).toBe(76);
    expect(
      scoreCandidate({ skill: 200, domain: 100, ability: 100, risk: -50, llmBonus: 30 }).total,
    ).toBe(100);
  });

  it('maps scores to decisions', () => {
    expect(decideCandidateAction(86)).toMatchObject({ action: 'chat', priority: 'high' });
    expect(decideCandidateAction(71)).toMatchObject({ action: 'chat', priority: 'medium' });
    expect(decideCandidateAction(61)).toMatchObject({ action: 'collect', priority: 'low' });
    expect(decideCandidateAction(60)).toMatchObject({ action: 'skip', priority: 'low' });
  });
});
