import {
  getEffectiveInterviewProcesses,
  matchInterviewProcess,
  normalizeInterviewProcess,
} from './process';
import { DEFAULT_INTERVIEW_PROCESSES } from './defaults';

describe('interview process templates and matching', () => {
  it('provides broad default categories with a general fallback', () => {
    expect(DEFAULT_INTERVIEW_PROCESSES.map((process) => process.positionType)).toEqual([
      '技术研发类',
      '产品设计类',
      '销售市场类',
      '运营客服类',
      '行政职能类',
      '管理类',
      '通用岗位类',
    ]);
    expect(
      DEFAULT_INTERVIEW_PROCESSES.filter((process) => process.autoMatch?.isFallback),
    ).toHaveLength(1);
    expect(DEFAULT_INTERVIEW_PROCESSES.every((process) => process.stages.length >= 2)).toBe(true);
  });

  it('matches technical and administrative positions by department and keyword', () => {
    const processes = getEffectiveInterviewProcesses([]);

    expect(
      matchInterviewProcess(processes, {
        department: '技术部',
        position: '高级前端工程师',
        positionDescription: '负责核心系统架构',
      }),
    ).toMatchObject({ process: { positionType: '技术研发类' }, reason: 'department' });
    expect(
      matchInterviewProcess(processes, {
        department: '综合支持部',
        position: '行政专员',
        positionDescription: '负责办公采购和行政支持',
      }),
    ).toMatchObject({ process: { positionType: '行政职能类' }, reason: 'position_keyword' });
  });

  it('uses department priority to avoid treating product managers as management positions', () => {
    expect(
      matchInterviewProcess(getEffectiveInterviewProcesses([]), {
        department: '产品部',
        position: '产品经理',
        positionDescription: '',
      }),
    ).toMatchObject({ process: { positionType: '产品设计类' }, reason: 'department' });
  });

  it('falls back to the configured general process for unknown positions', () => {
    expect(
      matchInterviewProcess(getEffectiveInterviewProcesses([]), {
        department: '创新业务部',
        position: '新业务专家',
        positionDescription: '',
      }),
    ).toMatchObject({ process: { positionType: '通用岗位类' }, reason: 'fallback' });
  });

  it('normalizes matching rules while keeping old process JSON compatible', () => {
    expect(
      normalizeInterviewProcess({
        id: 'technical',
        positionType: '技术类',
        stages: [{ id: 'round-1', name: '技术面', purpose: '验证专业能力' }],
      }),
    ).toEqual({
      id: 'technical',
      positionType: '技术类',
      autoMatch: { departments: [], positionKeywords: [], isFallback: false },
      stages: [{ id: 'round-1', name: '技术面', purpose: '验证专业能力', sortOrder: 0 }],
    });
  });
});
