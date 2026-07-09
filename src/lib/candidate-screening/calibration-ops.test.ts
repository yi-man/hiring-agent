import { runCalibrationOp } from './calibration-ops';

describe('candidate screening calibration ops', () => {
  it('lists built-in calibration categories', () => {
    const result = runCalibrationOp(['list']);

    expect(result.operation).toBe('list');
    expect(result.detail).toEqual(expect.stringContaining('technical'));
    expect(result.detail).toEqual(expect.stringContaining('产品'));
    expect(result.exitCode).toBe(0);
  });

  it('shows anchors for a category', () => {
    const result = runCalibrationOp(['show', 'technical']);

    expect(result.operation).toBe('show');
    expect(result.detail).toEqual(expect.stringContaining('技术研发'));
    expect(result.detail).toEqual(expect.stringContaining('强匹配'));
    expect(result.detail).toEqual(expect.stringContaining('85-100'));
    expect(result.exitCode).toBe(0);
  });

  it('infers the category from free-form JD text', () => {
    const result = runCalibrationOp(['doctor', '高级后端工程师', 'Java', 'Spring Boot']);

    expect(result.operation).toBe('doctor');
    expect(result.detail).toEqual(expect.stringContaining('technical'));
    expect(result.detail).toEqual(expect.stringContaining('技术研发'));
    expect(result.exitCode).toBe(0);
  });

  it('exports a category as JSON', () => {
    const result = runCalibrationOp(['export', 'sales']);
    const payload = JSON.parse(result.detail) as {
      category: string;
      anchors: Array<{ label: string; scoreRange: [number, number] }>;
    };

    expect(result.operation).toBe('export');
    expect(payload.category).toBe('sales');
    expect(payload.anchors[0]).toMatchObject({ label: '强匹配', scoreRange: [85, 100] });
  });

  it('lists the resume scoring dataset by calibration category', () => {
    const result = runCalibrationOp(['dataset']);

    expect(result.operation).toBe('dataset');
    expect(result.detail).toEqual(expect.stringContaining('technical'));
    expect(result.detail).toEqual(expect.stringContaining('data_ai'));
    expect(result.detail).toEqual(expect.stringContaining('强匹配'));
    expect(result.detail).toEqual(expect.stringContaining('弱匹配'));
    expect(result.exitCode).toBe(0);
  });

  it('shows seeded resume scoring samples for one category', () => {
    const result = runCalibrationOp(['dataset', 'show', 'technical']);

    expect(result.operation).toBe('dataset');
    expect(result.detail).toEqual(expect.stringContaining('technical / 技术研发'));
    expect(result.detail).toEqual(expect.stringContaining('technical-strong-backend-platform'));
    expect(result.detail).toEqual(expect.stringContaining('expected: chat 85-100'));
    expect(result.detail).toEqual(expect.stringContaining('technical-weak-marketing'));
    expect(result.exitCode).toBe(0);
  });

  it('exports resume scoring samples as JSON for regression runs', () => {
    const result = runCalibrationOp(['dataset', 'export', 'data_ai']);
    const payload = JSON.parse(result.detail) as {
      version: string;
      category: string;
      samples: Array<{
        id: string;
        category: string;
        expected: { action: string; scoreRange: [number, number] };
      }>;
    };

    expect(result.operation).toBe('dataset');
    expect(payload.category).toBe('data_ai');
    expect(payload.version).toBeTruthy();
    expect(payload.samples).toHaveLength(4);
    expect(payload.samples.map((sample) => sample.expected.action)).toEqual([
      'chat',
      'chat',
      'collect',
      'skip',
    ]);
  });

  it('returns usage for invalid commands', () => {
    const result = runCalibrationOp(['unknown']);

    expect(result.operation).toBe('usage');
    expect(result.exitCode).toBe(1);
    expect(result.detail).toEqual(expect.stringContaining('candidate-screening-calibration'));
  });
});
