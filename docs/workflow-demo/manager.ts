import * as fs from 'fs';
import * as path from 'path';
import { Workflow, WorkflowStep, WorkflowVersion } from './types.js';

const STORE_DIR = './workflows';
const MAX_HISTORY = 10;

export class WorkflowManager {
  constructor() {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
  }

  // ── 基础 CRUD ────────────────────────────────────────

  save(workflow: Workflow): void {
    const filePath = path.join(STORE_DIR, `${workflow.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
  }

  load(idOrName: string): Workflow | null {
    // 先尝试直接按 id 读
    const byId = path.join(STORE_DIR, `${idOrName}.json`);
    if (fs.existsSync(byId)) {
      return JSON.parse(fs.readFileSync(byId, 'utf-8'));
    }
    // 再按 name 查找
    return this.list().find((w) => w.name === idOrName) ?? null;
  }

  list(): Workflow[] {
    if (!fs.existsSync(STORE_DIR)) return [];
    return fs
      .readdirSync(STORE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(STORE_DIR, f), 'utf-8')));
  }

  delete(id: string): void {
    const filePath = path.join(STORE_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  // ── 创建新 Workflow ─────────────────────────────────

  create(name: string, goal: string, steps: WorkflowStep[]): Workflow {
    const workflow: Workflow = {
      id: `wf_${Date.now()}`,
      name,
      goal,
      version: 1,
      steps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
    };
    this.save(workflow);
    console.log(`✅ Workflow "${name}" 已保存（版本 1，${steps.length} 步）`);
    return workflow;
  }

  // ── 版本更新 ────────────────────────────────────────

  updateSteps(id: string, newSteps: WorkflowStep[], reason: string): Workflow {
    const workflow = this.load(id);
    if (!workflow) throw new Error(`Workflow ${id} 不存在`);

    // 把当前版本推入历史
    const versionSnapshot: WorkflowVersion = {
      version: workflow.version,
      steps: workflow.steps,
      reason: `被版本 ${workflow.version + 1} 替换：${reason}`,
      createdAt: workflow.updatedAt,
    };

    workflow.history.unshift(versionSnapshot);
    // 只保留最近 MAX_HISTORY 个版本
    if (workflow.history.length > MAX_HISTORY) {
      workflow.history = workflow.history.slice(0, MAX_HISTORY);
    }

    workflow.steps = newSteps;
    workflow.version += 1;
    workflow.updatedAt = new Date().toISOString();

    this.save(workflow);
    console.log(`🔄 Workflow "${workflow.name}" 已更新至版本 ${workflow.version}（${reason}）`);
    return workflow;
  }

  // ── 版本回滚 ────────────────────────────────────────

  rollback(id: string, targetVersion: number): Workflow {
    const workflow = this.load(id);
    if (!workflow) throw new Error(`Workflow ${id} 不存在`);

    const target = workflow.history.find((h) => h.version === targetVersion);
    if (!target) throw new Error(`版本 ${targetVersion} 不存在`);

    return this.updateSteps(id, target.steps, `手动回滚到版本 ${targetVersion}`);
  }
}
