import { z } from 'zod';

const stepIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/);

const loginDetectorSchema = z
  .object({
    loginUrlIncludes: z.array(z.string().min(1)).optional(),
    loginTextIncludes: z.array(z.string().min(1)).optional(),
    loggedInUrlIncludes: z.array(z.string().min(1)).optional(),
    loggedInTextIncludes: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.loginUrlIncludes?.length ||
        value.loginTextIncludes?.length ||
        value.loggedInUrlIncludes?.length ||
        value.loggedInTextIncludes?.length,
      ),
    'At least one login detector condition is required',
  );

const stepBaseSchema = z.object({
  id: stepIdSchema,
  dependsOn: z.array(stepIdSchema).optional(),
  description: z.string().min(1).optional(),
});

const checkLoginStepSchema = stepBaseSchema.extend({
  type: z.literal('check_login'),
  target: z.object({
    url: z.string().url(),
    detector: loginDetectorSchema,
  }),
});

const loginStepSchema = stepBaseSchema.extend({
  type: z.literal('login'),
  method: z.enum(['qr_code', 'manual']),
  targetUrl: z.string().url(),
  success: z
    .object({
      urlIncludes: z.array(z.string().min(1)).optional(),
      urlNotIncludes: z.array(z.string().min(1)).optional(),
      textIncludes: z.array(z.string().min(1)).optional(),
    })
    .refine(
      (value) => Boolean(value.urlIncludes?.length || value.textIncludes?.length),
      'Login success must include urlIncludes or textIncludes',
    ),
});

const browserActionStepSchema = stepBaseSchema
  .extend({
    type: z.literal('browser_action'),
    action: z.enum(['navigate', 'click', 'extract_text', 'wait_for_text']),
    target: z.object({
      url: z.string().url().optional(),
      selectorHint: z.string().min(1).optional(),
      text: z.string().min(1).optional(),
    }),
    outputKey: z.string().min(1).optional(),
  })
  .superRefine((step, ctx) => {
    if (step.action === 'navigate' && !step.target.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'navigate action requires target.url',
        path: ['target', 'url'],
      });
    }
    if (step.action === 'click' && !step.target.selectorHint && !step.target.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'click action requires target.selectorHint or target.text',
        path: ['target'],
      });
    }
    if (step.action === 'wait_for_text' && !step.target.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'wait_for_text action requires target.text',
        path: ['target', 'text'],
      });
    }
    if (step.action === 'extract_text' && !step.outputKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'extract_text action requires outputKey',
        path: ['outputKey'],
      });
    }
  });

const assertionStepSchema = stepBaseSchema.extend({
  type: z.literal('assertion'),
  expect: z
    .object({
      urlIncludes: z.array(z.string().min(1)).optional(),
      textIncludes: z.array(z.string().min(1)).optional(),
      outputKey: z.string().min(1).optional(),
    })
    .refine(
      (value) =>
        Boolean(value.urlIncludes?.length || value.textIncludes?.length || value.outputKey),
      'Assertion expect must include at least one condition',
    ),
});

export const workflowStepSchema = z.union([
  checkLoginStepSchema,
  loginStepSchema,
  browserActionStepSchema,
  assertionStepSchema,
]);

export const workflowDslSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    metadata: z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      domain: z.enum(['recruiting']),
      sourcePrompt: z.string().min(1).optional(),
    }),
    steps: z.array(workflowStepSchema).min(1),
  })
  .superRefine((workflow, ctx) => {
    const seen = new Set<string>();
    const ids = new Set(workflow.steps.map((step) => step.id));

    workflow.steps.forEach((step, index) => {
      if (seen.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate step id: ${step.id}`,
          path: ['steps', index, 'id'],
        });
      }
      seen.add(step.id);

      step.dependsOn?.forEach((dependency, dependencyIndex) => {
        if (dependency === step.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Step cannot depend on itself: ${step.id}`,
            path: ['steps', index, 'dependsOn', dependencyIndex],
          });
        }
        if (!ids.has(dependency)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown dependency: ${dependency}`,
            path: ['steps', index, 'dependsOn', dependencyIndex],
          });
        }
      });
    });

    for (const cycle of findDependencyCycles(workflow.steps)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Dependency cycle detected: ${cycle.join(' -> ')}`,
        path: ['steps'],
      });
    }
  });

export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowDsl = z.infer<typeof workflowDslSchema>;

export function parseWorkflowDsl(value: unknown): WorkflowDsl {
  return workflowDslSchema.parse(value);
}

export function tryParseWorkflowDsl(value: unknown):
  | {
      ok: true;
      workflow: WorkflowDsl;
    }
  | {
      ok: false;
      error: string;
    } {
  const result = workflowDslSchema.safeParse(value);
  if (result.success) {
    return { ok: true, workflow: result.data };
  }

  return {
    ok: false,
    error: result.error.issues.map((issue) => issue.message).join('; '),
  };
}

function findDependencyCycles(steps: Array<{ id: string; dependsOn?: string[] }>): string[][] {
  const deps = new Map(steps.map((step) => [step.id, step.dependsOn ?? []]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];

  function visit(id: string, path: string[]) {
    if (visiting.has(id)) {
      cycles.push([...path.slice(path.indexOf(id)), id]);
      return;
    }
    if (visited.has(id)) return;

    visiting.add(id);
    for (const dependency of deps.get(id) ?? []) {
      if (deps.has(dependency)) {
        visit(dependency, [...path, dependency]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const step of steps) {
    visit(step.id, [step.id]);
  }

  return cycles;
}
