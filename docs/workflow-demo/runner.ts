import { EventEmitter } from 'events';
import {
  Workflow,
  WorkflowStep,
  StepResult,
  CompletedStep,
  RunnerState,
  BridgeMessage,
} from '../types.js';

export interface RunnerEvents {
  stateChange: (state: RunnerState) => void;
  stepStart: (step: WorkflowStep) => void;
  stepDone: (step: WorkflowStep, result: StepResult) => void;
  stepError: (step: WorkflowStep, error: string) => void;
  done: (completedSteps: CompletedStep[]) => void;
  failed: (failedStep: WorkflowStep, error: string, completedSteps: CompletedStep[]) => void;
}

type SendFn = (msg: BridgeMessage) => Promise<BridgeMessage>;

export class WorkflowRunner extends EventEmitter {
  private state: RunnerState = 'IDLE';
  private completedSteps: CompletedStep[] = [];

  constructor(private sendToPlugin: SendFn) {
    super();
  }

  getState(): RunnerState {
    return this.state;
  }

  getCompletedSteps(): CompletedStep[] {
    return this.completedSteps;
  }

  private setState(state: RunnerState) {
    this.state = state;
    this.emit('stateChange', state);
  }

  async run(workflow: Workflow): Promise<void> {
    this.completedSteps = [];
    this.setState('RUNNING');
    console.log(
      `\n▶ 执行 Workflow "${workflow.name}" v${workflow.version}（${workflow.steps.length} 步）`,
    );

    let i = 0;
    while (i < workflow.steps.length) {
      const step = workflow.steps[i];

      // ── 收集可打包的连续步骤 ──────────────────────────
      if (step.canBatch) {
        const batch: WorkflowStep[] = [step];
        while (
          i + batch.length < workflow.steps.length &&
          workflow.steps[i + batch.length].canBatch
        ) {
          batch.push(workflow.steps[i + batch.length]);
        }

        console.log(`  📦 批量执行 ${batch.length} 步: ${batch.map((s) => s.tool).join(' → ')}`);
        const results = await this.execBatch(batch);

        for (let j = 0; j < batch.length; j++) {
          const r = results[j];
          if (!r.success) {
            this.setState('RECOVERING');
            this.emit('stepError', batch[j], r.error!);
            this.emit('failed', batch[j], r.error!, this.completedSteps);
            return;
          }
          this.completedSteps.push({ step: batch[j], result: r });
          this.emit('stepDone', batch[j], r);
        }

        i += batch.length;
        continue;
      }

      // ── 单步执行（感知步骤，需等待结果）────────────────
      console.log(`  🔍 单步执行: ${step.tool} — ${step.description}`);
      this.emit('stepStart', step);

      const result = await this.execSingle(step);

      if (!result.success) {
        this.setState('RECOVERING');
        this.emit('stepError', step, result.error!);
        this.emit('failed', step, result.error!, this.completedSteps);
        return;
      }

      // 软错误检测
      if (step.successCondition) {
        const softFail = this.checkSoftError(step, result);
        if (softFail) {
          this.setState('RECOVERING');
          this.emit('stepError', step, softFail);
          this.emit('failed', step, softFail, this.completedSteps);
          return;
        }
      }

      this.completedSteps.push({ step, result });
      this.emit('stepDone', step, result);
      i++;
    }

    this.setState('DONE');
    this.emit('done', this.completedSteps);
    console.log(`✅ Workflow "${workflow.name}" 执行完成`);
  }

  // ── 私有：发送到插件 ────────────────────────────────

  private async execBatch(steps: WorkflowStep[]): Promise<StepResult[]> {
    const requestId = `req_${Date.now()}`;
    const response = await this.sendToPlugin({
      type: 'exec_batch',
      requestId,
      steps,
    });
    return (
      response.results ?? steps.map((s) => ({ stepId: s.id, success: false, error: '无响应' }))
    );
  }

  private async execSingle(step: WorkflowStep): Promise<StepResult> {
    const requestId = `req_${Date.now()}`;
    const response = await this.sendToPlugin({
      type: 'exec_single',
      requestId,
      step,
    });
    return response.result ?? { stepId: step.id, success: false, error: '无响应' };
  }

  private checkSoftError(step: WorkflowStep, result: StepResult): string | null {
    if (!result.data || result.data.trim() === '') {
      return `步骤 "${step.description}" 返回空结果，期望: ${step.successCondition}`;
    }
    return null;
  }
}
