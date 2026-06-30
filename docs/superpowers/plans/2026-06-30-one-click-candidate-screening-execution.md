# 一键候选人筛选执行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 JD 候选人筛选改成一次点击完成真实简历抓取、真实 LLM 评估、真实 Playwright 打招呼或收藏的执行闭环。

**Architecture:** 保留现有 `CandidateSourceAdapter` 和 `PlaywrightBrowserExecutor` 边界。`runCandidateScreening` 在 `execution` 模式下仍先完成搜索、入库、召回、评估、排名和动作计划，然后复用同一个 adapter 立即执行已规划的 `chat` / `collect` 动作；`dry_run` 保持只规划不执行。`evaluateCandidateForJd` 增加严格模式，execution run 里 LLM 失败直接失败，不再规则兜底。

**Tech Stack:** Next.js 16 App Router、React 18、TypeScript 5.7、Bun、Jest、Playwright、Prisma PostgreSQL。

---

## 文件结构

- 修改 `src/lib/candidate-screening/evaluation.ts`：增加 `strict?: boolean`，严格模式下抛出 LLM 或 schema 校验错误。
- 修改 `src/lib/candidate-screening/evaluation.test.ts`：覆盖严格模式失败、非严格模式兜底。
- 修改 `src/lib/candidate-screening/runner.ts`：创建 action log 时使用请求 mode；execution run 在 action planning 后自动执行动作；复用已登录 adapter。
- 修改 `src/lib/candidate-screening/runner.test.ts`：覆盖 dry-run 不执行、execution 自动执行、strict 参数传递、action log mode。
- 修改 `src/components/jd-generator/jd-pages.tsx`：按钮文案改为 `筛选并执行`，创建 run 时传 `mode: 'execution'`。
- 修改 `tests/unit/components/CandidateScreening.test.tsx`：覆盖按钮文案和 payload。
- 修改 `tests/e2e-playwright/candidate-screening.spec.ts`：更新 Playwright UI mock 和断言里的按钮文案、run mode。
- 修改 `tests/integration/candidate-screening/screening-flow.e2e.test.ts`：新增 execution 模式真实浏览器动作验证。

---

### Task 1: 严格 LLM 评估模式

**Files:**
- Modify: `src/lib/candidate-screening/evaluation.test.ts`
- Modify: `src/lib/candidate-screening/evaluation.ts`

- [ ] **Step 1: 写失败测试：strict 模式下 LLM 抛错不兜底**

在 `src/lib/candidate-screening/evaluation.test.ts` 的 `describe('evaluateCandidateForJd', ...)` 末尾新增：

```ts
  it('rethrows LLM failures in strict mode', async () => {
    await expect(
      evaluateCandidateForJd({
        jobTitle: '高级后端工程师',
        evaluationSchema,
        resumeText: 'Java Spring Boot 高并发',
        candidateName: '王小明',
        strict: true,
        runLLM: async () => {
          throw new Error('OPENAI_API_KEY is not configured');
        },
      }),
    ).rejects.toThrow('OPENAI_API_KEY is not configured');
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bunx jest src/lib/candidate-screening/evaluation.test.ts --runInBand --coverage=false
```

Expected: FAIL，TypeScript 或 Jest 报告 `strict` 不是 `evaluateCandidateForJd` 参数的一部分，或函数没有按预期抛错。

- [ ] **Step 3: 实现 strict 参数**

在 `src/lib/candidate-screening/evaluation.ts` 中把函数参数类型改为：

```ts
export async function evaluateCandidateForJd(params: {
  jobTitle: string;
  evaluationSchema: EvaluationSchema;
  resumeText: string;
  candidateName: string;
  runLLM?: RunCandidateLLM;
  strict?: boolean;
}) {
```

把 `catch` 分支改成：

```ts
  } catch (error) {
    if (params.strict) {
      throw error;
    }
    output = buildRuleBasedFallback({
      evaluationSchema: params.evaluationSchema,
      resumeText: params.resumeText,
      error,
    });
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
bunx jest src/lib/candidate-screening/evaluation.test.ts --runInBand --coverage=false
```

Expected: PASS，现有非严格兜底测试仍通过，新增 strict 测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/lib/candidate-screening/evaluation.ts src/lib/candidate-screening/evaluation.test.ts
git commit -m "feat(candidate-screening): require llm success in strict evaluation"
```

---

### Task 2: runner 将 execution 评估设为严格模式

**Files:**
- Modify: `src/lib/candidate-screening/runner.test.ts`
- Modify: `src/lib/candidate-screening/runner.ts`

- [ ] **Step 1: 写失败测试：execution run 调评估时传 strict**

在 `src/lib/candidate-screening/runner.test.ts` 的 dry-run 主流程测试后新增：

```ts
  it('passes strict evaluation when the screening run is execution mode', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [makeRawCandidate()],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(dependencies.evaluateCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTitle: 'Frontend Engineer',
        candidateName: 'Ada Lovelace',
        strict: true,
      }),
    );
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
bunx jest src/lib/candidate-screening/runner.test.ts --runInBand --coverage=false
```

Expected: FAIL，`evaluateCandidate` 调用参数缺少 `strict: true`。

- [ ] **Step 3: 修改 `evaluateCandidates` 参数和调用**

在 `src/lib/candidate-screening/runner.ts` 中给 `evaluateCandidates` 增加 `strictEvaluation`：

```ts
async function evaluateCandidates(params: {
  dependencies: ScreeningRunnerDependencies;
  contexts: Map<string, CandidateContext>;
  jobDescription: JobDescriptionDto;
  evaluationSchema: EvaluationSchema;
  stats: ScreeningRunStats;
  strictEvaluation: boolean;
}): Promise<Map<string, CandidateEvaluation>> {
```

把内部调用改为：

```ts
    const evaluation = await params.dependencies.evaluateCandidate({
      jobTitle: params.jobDescription.position,
      evaluationSchema: params.evaluationSchema,
      resumeText: context.resumeText,
      candidateName: context.displayName,
      strict: params.strictEvaluation,
    });
```

把 `runCandidateScreening` 中调用 `evaluateCandidates` 的地方改为：

```ts
    const evaluations = await evaluateCandidates({
      dependencies,
      contexts,
      jobDescription: params.jobDescription,
      evaluationSchema,
      stats,
      strictEvaluation: params.request.mode === 'execution',
    });
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
bunx jest src/lib/candidate-screening/runner.test.ts --runInBand --coverage=false
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/candidate-screening/runner.ts src/lib/candidate-screening/runner.test.ts
git commit -m "feat(candidate-screening): use strict evaluation for execution runs"
```

---

### Task 3: execution run 自动执行已规划动作

**Files:**
- Modify: `src/lib/candidate-screening/runner.test.ts`
- Modify: `src/lib/candidate-screening/runner.ts`

- [ ] **Step 1: 写失败测试：dry-run 继续只规划不执行**

当前 dry-run 主流程测试已经包含：

```ts
    expect(adapter.chatCandidate).not.toHaveBeenCalled();
    expect(adapter.collectCandidate).not.toHaveBeenCalled();
```

保留这些断言，新增一条专门测试确保 createActionLog 使用请求 mode：

```ts
  it('creates planned action logs with the request mode', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [makeRawCandidate()],
        }),
      ),
    });
    const dependencies = makeDependencies(adapter);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(dependencies.repo.createActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'execution',
        status: 'planned',
        action: 'chat',
      }),
    );
  });
```

- [ ] **Step 2: 写失败测试：execution run 规划后自动打招呼**

在 `src/lib/candidate-screening/runner.test.ts` 新增：

```ts
  it('automatically executes planned chat actions during an execution screening run', async () => {
    const adapter = makeAdapter({
      searchCandidates: jest.fn(() =>
        batches({
          candidates: [makeRawCandidate()],
        }),
      ),
      chatCandidate: jest.fn().mockResolvedValue({
        success: true,
        browserTrace: { action: 'chat', candidateId: 'candidate-1' },
      }),
    });
    const dependencies = makeDependencies(adapter);
    const plannedResult = makeResult({
      id: 'result-1',
      candidateId: 'candidate-1',
      actionPlan: chatDecision,
      actionStatus: 'planned',
      interviewStage: 'to_contact',
    });
    const detail = makeDetail({
      ...plannedResult,
      actionLogs: [
        {
          id: 'action-log-1',
          userId: 'user-1',
          runId: 'run-1',
          screeningResultId: 'result-1',
          candidateId: 'candidate-1',
          jobDescriptionId: 'jd-1',
          platform: 'boss-like',
          mode: 'execution',
          action: 'chat',
          message: 'chat candidate',
          status: 'planned',
          idempotencyKey: 'execution-key',
          browserTrace: null,
          errorMessage: null,
          createdAt,
          updatedAt,
        },
      ],
    });

    dependencies.repo.upsertResult = jest.fn().mockResolvedValue(plannedResult);
    dependencies.repo.listResults = jest.fn().mockResolvedValue([plannedResult]);
    dependencies.repo.getDetail = jest.fn().mockResolvedValue(detail);
    dependencies.repo.claimActionLog = jest.fn().mockResolvedValue(detail.actionLogs[0]);

    await runCandidateScreening({
      runId: 'run-1',
      userId: 'user-1',
      jobDescription,
      request: { ...request, mode: 'execution' },
      dependencies,
    });

    expect(dependencies.repo.createActionLog).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'execution' }),
    );
    expect(dependencies.repo.listResults).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        jobDescriptionId: 'jd-1',
        runId: 'run-1',
        plannedActions: ['chat', 'collect'],
      }),
    );
    expect(dependencies.repo.claimActionLog).toHaveBeenCalledWith({
      userId: 'user-1',
      id: 'action-log-1',
    });
    expect(adapter.loginIfNeeded).toHaveBeenCalledTimes(1);
    expect(adapter.chatCandidate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        displayName: 'Ada Lovelace',
        profileUrl: 'https://example.com/ada',
      },
      chatDecision,
    );
    expect(dependencies.repo.updateActionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'action-log-1',
        status: 'success',
        browserTrace: { action: 'chat', candidateId: 'candidate-1' },
      }),
    );
    expect(dependencies.repo.upsertResult).toHaveBeenCalledWith(
      expect.objectContaining({
        actionStatus: 'success',
        interviewStage: 'contacted',
      }),
    );
  });
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
bunx jest src/lib/candidate-screening/runner.test.ts --runInBand --coverage=false
```

Expected: FAIL，`mode` 仍是 `dry_run`，且 `adapter.chatCandidate` 没有在 `runCandidateScreening` 内被调用。

- [ ] **Step 4: 最小实现：action log mode 使用请求 mode**

在 `createPlannedActions` 中把：

```ts
      mode: 'dry_run',
```

改为：

```ts
      mode: params.request.mode,
```

- [ ] **Step 5: 最小实现：抽取可复用执行函数**

在 `src/lib/candidate-screening/runner.ts` 中新增内部函数，放在 `executeScreeningRunActions` 前：

```ts
async function executePlannedActionsForRun(params: {
  dependencies: ScreeningRunnerDependencies;
  userId: string;
  runId: string;
  jobDescriptionId: string;
  getAdapterAfterClaim: () => Promise<CandidateSourceAdapter>;
  request: ExecuteActionsRequest;
  stats: ScreeningRunStats;
}): Promise<void> {
  let chatCount = 0;
  let collectCount = 0;

  const results = await params.dependencies.repo.listResults({
    userId: params.userId,
    jobDescriptionId: params.jobDescriptionId,
    runId: params.runId,
    plannedActions: ['chat', 'collect'],
    limit: params.request.maxChatActions + params.request.maxCollectActions + 100,
    offset: 0,
  });

  for (const result of results) {
    if (
      !shouldExecuteAction({
        result,
        chatCount,
        collectCount,
        request: params.request,
      }) ||
      !result.actionPlan
    ) {
      continue;
    }

    const detail = await params.dependencies.repo.getDetail({
      userId: params.userId,
      jobDescriptionId: params.jobDescriptionId,
      candidateId: result.candidateId,
    });
    if (!detail) continue;

    const actionLog = getPlannedActionLog(detail, result.actionPlan.action, params.runId);
    if (!actionLog) continue;

    const claimedActionLog = await params.dependencies.repo.claimActionLog({
      userId: params.userId,
      id: actionLog.id,
    });
    if (!claimedActionLog) continue;

    try {
      const adapter = await params.getAdapterAfterClaim();
      const storedCandidate = createStoredCandidateRef(result);
      const executionResult =
        result.actionPlan.action === 'chat'
          ? await adapter.chatCandidate(storedCandidate, result.actionPlan)
          : await adapter.collectCandidate(storedCandidate);

      await persistExecutionResult({
        dependencies: params.dependencies,
        userId: params.userId,
        runId: params.runId,
        result,
        actionPlan: result.actionPlan,
        actionLog: claimedActionLog,
        executionResult,
        stats: params.stats,
      });
    } catch (error) {
      await markExecutionFailed({
        dependencies: params.dependencies,
        userId: params.userId,
        runId: params.runId,
        result,
        actionPlan: result.actionPlan,
        actionLog: claimedActionLog,
        errorMessage: getErrorMessage(error),
        stats: params.stats,
      });
    }

    if (result.actionPlan.action === 'chat') {
      chatCount += 1;
    } else {
      collectCount += 1;
    }
  }
}
```

- [ ] **Step 6: 在 `runCandidateScreening` 中自动执行 execution 动作**

在 `createPlannedActions(...)` 后、最终 `updateRun({ status: 'success' ... })` 前插入：

```ts
    if (params.request.mode === 'execution' && adapter) {
      await updateStage({
        dependencies,
        userId: params.userId,
        runId: params.runId,
        currentStage: 'executing_actions',
        stats,
      });
      await executePlannedActionsForRun({
        dependencies,
        userId: params.userId,
        runId: params.runId,
        jobDescriptionId: params.jobDescription.id,
        getAdapterAfterClaim: async () => adapter,
        request: {
          confirmExecution: true,
          maxChatActions: params.request.maxCandidates,
          maxCollectActions: params.request.maxCandidates,
        },
        stats,
      });
    }
```

- [ ] **Step 7: 让手动执行 API 复用同一个函数**

在 `executeScreeningRunActions` 中保留 `getRun`、`updateRun` 和 `getAdapterAfterClaim` 懒加载逻辑，把遍历 results 的大段逻辑替换为：

```ts
    await executePlannedActionsForRun({
      dependencies,
      userId: params.userId,
      runId: params.runId,
      jobDescriptionId: currentRun.jobDescriptionId,
      getAdapterAfterClaim,
      request: params.request,
      stats,
    });
```

`executePlannedActionsForRun` 会先读取 result 和 claim action log，只有 claim 成功后才调用 `getAdapterAfterClaim()`。这样既满足 one-click execution 复用已有 adapter，也保持“无法 claim 时不创建 adapter”的既有断言通过。

- [ ] **Step 8: 运行 runner 测试确认通过**

Run:

```bash
bunx jest src/lib/candidate-screening/runner.test.ts --runInBand --coverage=false
```

Expected: PASS，既有手动执行测试和新增自动执行测试都通过。

- [ ] **Step 9: 提交**

```bash
git add src/lib/candidate-screening/runner.ts src/lib/candidate-screening/runner.test.ts
git commit -m "feat(candidate-screening): execute actions during execution runs"
```

---

### Task 4: JD 页面改成一键执行入口

**Files:**
- Modify: `tests/unit/components/CandidateScreening.test.tsx`
- Modify: `src/components/jd-generator/jd-pages.tsx`
- Modify: `tests/e2e-playwright/candidate-screening.spec.ts`

- [ ] **Step 1: 写失败测试：按钮文案和 payload**

在 `tests/unit/components/CandidateScreening.test.tsx` 中把测试名：

```ts
  it('starts a dry-run screening run and shows the run id', async () => {
```

改为：

```ts
  it('starts an execution screening run and shows the run id', async () => {
```

把该测试内按钮查询改为：

```ts
    fireEvent.click(await screen.findByRole('button', { name: '筛选并执行' }));
```

把断言改为：

```ts
    await waitFor(() =>
      expect(createCandidateScreeningRunMock).toHaveBeenCalledWith('jd-1', {
        platform: 'boss-like',
        mode: 'execution',
      }),
    );
```

把 `JD detail shows screening button...` 测试里的按钮文案断言改为：

```ts
    expect(await screen.findByRole('button', { name: '筛选并执行' })).toBeInTheDocument();
```

- [ ] **Step 2: 运行组件测试确认失败**

Run:

```bash
bunx jest tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: FAIL，页面仍显示 `筛选候选人`，payload 缺少 `mode: 'execution'`。

- [ ] **Step 3: 修改 JD 页面入口**

在 `src/components/jd-generator/jd-pages.tsx` 中把 `handleStartScreening` 调用改为：

```ts
      const run = await createCandidateScreeningRun(jobDescription.id, {
        platform: 'boss-like',
        mode: 'execution',
      });
```

把按钮文案改为：

```tsx
                    {isScreening ? '启动中' : '筛选并执行'}
```

把错误文案保留为 `启动候选人筛选失败`。

- [ ] **Step 4: 更新 Playwright UI 测试**

在 `tests/e2e-playwright/candidate-screening.spec.ts` 中：

把测试名改为：

```ts
  test('published JD links to candidate screening results and starts an execution run', async ({
```

把 mock run 的 mode 改为：

```ts
                mode: 'execution',
```

把按钮查询改为：

```ts
      const startScreeningButton = page.getByRole('button', {
        name: '筛选并执行',
        exact: true,
      });
```

- [ ] **Step 5: 运行组件测试确认通过**

Run:

```bash
bunx jest tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: PASS。

- [ ] **Step 6: 运行 Playwright 目标测试**

Run:

```bash
bun run test:e2e:playwright tests/e2e-playwright/candidate-screening.spec.ts
```

Expected: PASS。若本机没有可用 PostgreSQL 环境，该测试会按现有 `test.skip` 跳过。

- [ ] **Step 7: 提交**

```bash
git add src/components/jd-generator/jd-pages.tsx tests/unit/components/CandidateScreening.test.tsx tests/e2e-playwright/candidate-screening.spec.ts
git commit -m "feat(candidate-screening): start execution runs from jd page"
```

---

### Task 5: 集成验证真实浏览器执行动作

**Files:**
- Modify: `tests/integration/candidate-screening/screening-flow.e2e.test.ts`

- [ ] **Step 1: 写失败测试：execution 模式会通过真实 Playwright 打招呼**

在 `tests/integration/candidate-screening/screening-flow.e2e.test.ts` 的现有 integration 测试后新增：

```ts
  it('executes planned chat actions through the browser during execution runs', async () => {
    const bossLike = await startBossLikeServer();
    const userId = await createIntegrationUser();

    try {
      const jobDescription = await createPublishedJobDescription(userId);
      const run = await createCandidateScreeningRun({
        userId,
        jobDescriptionId: jobDescription.id,
        platform: 'boss-like',
        mode: 'execution',
        status: 'pending',
      });

      await runCandidateScreening({
        runId: run.id,
        userId,
        jobDescription,
        request: {
          platform: 'boss-like',
          mode: 'execution',
          maxCandidates: 1,
          batchSize: 1,
          allowAlreadyContacted: false,
        },
        dependencies: {
          createAdapter: () =>
            new BossLikeCandidateSourceAdapter({
              baseUrl: bossLike.baseUrl,
              executor: new PlaywrightBrowserExecutor({ headless: true, timeoutMs: 8_000 }),
              username: 'admin',
              password: 'boss123',
            }),
          evaluateCandidate,
        },
      });

      const completedRun = await prisma.candidateScreeningRun.findUniqueOrThrow({
        where: { id: run.id },
      });
      const actionLogs = await prisma.candidateActionLog.findMany({
        where: { userId, runId: run.id },
      });
      const result = await prisma.candidateScreeningResult.findFirstOrThrow({
        where: { userId, runId: run.id, jobDescriptionId: jobDescription.id },
      });

      expect(completedRun.status).toBe('success');
      expect(completedRun.currentStage).toBe('finalizing');
      expect(actionLogs).toHaveLength(1);
      expect(actionLogs[0]).toMatchObject({
        mode: 'execution',
        action: 'chat',
        status: 'success',
      });
      expect(result.actionStatus).toBe('success');
      expect(result.interviewStage).toBe('contacted');
      expect(bossLike.requests).toContain('GET /employer/resumes');
      expect(bossLike.requests).toContain('GET /employer/resumes/boss-cand-1');
    } finally {
      await cleanupIntegrationUser(userId);
      await bossLike.close();
    }
  }, 120000);
```

- [ ] **Step 2: 运行集成测试确认失败**

Run:

```bash
bunx jest tests/integration/candidate-screening/screening-flow.e2e.test.ts --runInBand --coverage=false
```

Expected: FAIL。当前代码不会自动执行 action，action log 会停在 `planned` 或 `dry_run`。

- [ ] **Step 3: 让集成测试通过**

如果 Task 3 的 runner 自动执行已经完成，这一步通常不需要再改生产代码。若失败原因是 Playwright 无法唯一定位 `发送` 或 `打招呼`，在 `renderResumeDetailPage` 中给按钮增加更明确文本或 aria label，但不要改生产代码：

```html
<button type="button" id="open-chat">打招呼</button>
<label>消息 <textarea name="message"></textarea></label>
<button type="button">发送</button>
```

这段 fixture 当前已经满足 adapter 的文本定位，优先检查 runner 逻辑。

- [ ] **Step 4: 运行集成测试确认通过**

Run:

```bash
bunx jest tests/integration/candidate-screening/screening-flow.e2e.test.ts --runInBand --coverage=false
```

Expected: PASS。若本机没有 `POSTGRES_*` 或 Playwright Chromium，记录阻塞原因；不要把集成测试改成 mock。

- [ ] **Step 5: 提交**

```bash
git add tests/integration/candidate-screening/screening-flow.e2e.test.ts
git commit -m "test(candidate-screening): cover execution browser actions"
```

---

### Task 6: 收尾验证

**Files:**
- No production file changes.

- [ ] **Step 1: 跑候选人筛选相关 Jest**

Run:

```bash
bunx jest src/lib/candidate-screening/evaluation.test.ts src/lib/candidate-screening/runner.test.ts tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: PASS。

- [ ] **Step 2: 跑类型检查**

Run:

```bash
bun run type-check
```

Expected: PASS。

- [ ] **Step 3: 跑 lint**

Run:

```bash
bun run lint
```

Expected: PASS。

- [ ] **Step 4: 检查 git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: 只有本计划范围内文件变更；没有无关格式化或锁文件变更。

- [ ] **Step 5: 最终提交**

如果前面任务已经逐步提交，这一步只提交验证中产生的必要小修：

```bash
git add src/lib/candidate-screening/evaluation.ts src/lib/candidate-screening/evaluation.test.ts src/lib/candidate-screening/runner.ts src/lib/candidate-screening/runner.test.ts src/components/jd-generator/jd-pages.tsx tests/unit/components/CandidateScreening.test.tsx tests/e2e-playwright/candidate-screening.spec.ts tests/integration/candidate-screening/screening-flow.e2e.test.ts
git commit -m "feat(candidate-screening): complete one-click execution flow"
```

如果没有剩余变更，运行：

```bash
git status --short
```

Expected: 输出为空。

---

## 自检记录

- Spec 覆盖：Task 1-2 覆盖真实严格评估；Task 3 覆盖自动执行动作与 action log mode；Task 4 覆盖一键 UI 入口；Task 5 覆盖真实浏览器集成验证；Task 6 覆盖收尾验证。
- 占位符扫描：本文档没有未完成需求或悬空实现。
- 类型一致性：计划中新增参数为 `strict?: boolean`；请求 mode 使用现有 `CandidateScreeningMode` 的 `execution`；动作执行复用现有 `ExecuteActionsRequest`、`CandidateSourceAdapter`、`persistExecutionResult` 和 `markExecutionFailed`。
