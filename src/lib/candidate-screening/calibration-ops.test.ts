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

  it('returns usage for invalid commands', () => {
    const result = runCalibrationOp(['unknown']);

    expect(result.operation).toBe('usage');
    expect(result.exitCode).toBe(1);
    expect(result.detail).toEqual(expect.stringContaining('candidate-screening-calibration'));
  });
});
