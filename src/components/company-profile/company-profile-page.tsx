'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ClipboardList,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { fetchCompanySettings, saveCompanyProfile } from '@/lib/company-profile/client';
import type {
  CompanyProfileDto,
  CompanyWorkLocationInput,
  CompanyWorkLocationKind,
} from '@/lib/company-profile/types';
import {
  DEFAULT_RECRUITMENT_PLATFORMS,
  type RecruitmentPlatform,
} from '@/lib/recruitment-platforms';
import type { InterviewProcess } from '@/lib/interviews/types';
import { getEffectiveInterviewProcesses } from '@/lib/interviews/process';

type LocationRow = CompanyWorkLocationInput & {
  clientId: string;
};

function clientId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createInterviewProcess(): InterviewProcess {
  return {
    id: clientId('process'),
    positionType: '',
    autoMatch: { departments: [], positionKeywords: [], isFallback: false },
    stages: [
      {
        id: clientId('stage'),
        name: '',
        purpose: '',
        sortOrder: 0,
      },
    ],
  };
}

function splitMatchValues(value: string): string[] {
  return value
    .split(/[,，、;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);
}

function createOfficeRow(index: number): LocationRow {
  return {
    clientId: `office-${Date.now()}-${index}`,
    kind: 'office',
    label: '',
    city: null,
    address: null,
  };
}

function createRemoteRow(): LocationRow {
  return {
    clientId: `remote-${Date.now()}`,
    kind: 'remote',
    label: '远程',
    city: null,
    address: null,
  };
}

function dtoToRows(profile: CompanyProfileDto | null): LocationRow[] {
  if (!profile?.locations.length) {
    return [createOfficeRow(0)];
  }

  return profile.locations.map((location) => ({
    clientId: location.id,
    kind: location.kind,
    label: location.label,
    city: location.city,
    address: location.address,
  }));
}

function cleanLocation(row: LocationRow): CompanyWorkLocationInput {
  if (row.kind === 'remote') {
    return { kind: 'remote', label: '远程', city: null, address: null };
  }

  return {
    kind: 'office',
    label: row.label.trim(),
    city: row.city?.trim() || null,
    address: row.address?.trim() || null,
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground text-sm font-medium">{children}</span>;
}

export type CompanyProfileSection = 'company' | 'locations' | 'interview-processes';

const sectionMeta: Record<
  CompanyProfileSection,
  { title: string; description: string; saveLabel: string; successMessage: string }
> = {
  company: {
    title: '公司信息',
    description: '维护招聘场景中使用的公司主体名称。',
    saveLabel: '保存公司信息',
    successMessage: '公司信息已保存',
  },
  locations: {
    title: '工作地点',
    description: '维护可在 JD 和发布任务中选择的办公室及远程地点。',
    saveLabel: '保存工作地点',
    successMessage: '工作地点已保存',
  },
  'interview-processes': {
    title: '职位面试流程',
    description: '按职位类别维护自动匹配规则、正式面试轮次与每轮事项。',
    saveLabel: '保存面试流程',
    successMessage: '面试流程已保存',
  },
};

export function CompanyProfilePage({ section }: { section: CompanyProfileSection }) {
  const meta = sectionMeta[section];
  const [companyName, setCompanyName] = useState('');
  const [supportedPlatforms, setSupportedPlatforms] = useState<RecruitmentPlatform[]>(
    DEFAULT_RECRUITMENT_PLATFORMS,
  );
  const [locations, setLocations] = useState<LocationRow[]>([createOfficeRow(0)]);
  const [interviewProcesses, setInterviewProcesses] = useState<InterviewProcess[]>(() =>
    getEffectiveInterviewProcesses([]),
  );
  const [expandedInterviewProcessId, setExpandedInterviewProcessId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      setIsLoading(true);
      setError('');
      try {
        const settings = await fetchCompanySettings();
        const { profile } = settings;
        if (!isActive) return;
        setCompanyName(profile?.name ?? '');
        setSupportedPlatforms(profile?.supportedPlatforms ?? DEFAULT_RECRUITMENT_PLATFORMS);
        setLocations(dtoToRows(profile));
        const effectiveProcesses = getEffectiveInterviewProcesses(profile?.interviewProcesses);
        setInterviewProcesses(effectiveProcesses);
        setExpandedInterviewProcessId(null);
      } catch (e) {
        if (isActive) {
          setError(e instanceof Error ? e.message : '加载公司信息失败');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, []);

  function updateLocation(index: number, patch: Partial<LocationRow>) {
    setLocations((current) =>
      current.map((location, locationIndex) =>
        locationIndex === index ? { ...location, ...patch } : location,
      ),
    );
  }

  function updateKind(index: number, kind: CompanyWorkLocationKind) {
    if (kind === 'remote') {
      updateLocation(index, createRemoteRow());
      return;
    }
    updateLocation(index, { kind: 'office', label: '', city: null, address: null });
  }

  function updateInterviewProcess(index: number, update: Partial<InterviewProcess>) {
    setInterviewProcesses((current) =>
      current.map((process, processIndex) =>
        processIndex === index ? { ...process, ...update } : process,
      ),
    );
  }

  function updateInterviewAutoMatch(
    index: number,
    update: Partial<NonNullable<InterviewProcess['autoMatch']>>,
  ) {
    const process = interviewProcesses[index];
    updateInterviewProcess(index, {
      autoMatch: {
        departments: process.autoMatch?.departments ?? [],
        positionKeywords: process.autoMatch?.positionKeywords ?? [],
        isFallback: process.autoMatch?.isFallback === true,
        ...update,
      },
    });
  }

  function setFallbackInterviewProcess(processId: string, isFallback: boolean) {
    setInterviewProcesses((current) =>
      current.map((process) => ({
        ...process,
        autoMatch: {
          departments: process.autoMatch?.departments ?? [],
          positionKeywords: process.autoMatch?.positionKeywords ?? [],
          isFallback: process.id === processId ? isFallback : false,
        },
      })),
    );
  }

  function updateInterviewStage(
    processIndex: number,
    stageIndex: number,
    update: Partial<InterviewProcess['stages'][number]>,
  ) {
    setInterviewProcesses((current) =>
      current.map((process, currentProcessIndex) => {
        if (currentProcessIndex !== processIndex) return process;
        return {
          ...process,
          stages: process.stages.map((stage, currentStageIndex) =>
            currentStageIndex === stageIndex ? { ...stage, ...update } : stage,
          ),
        };
      }),
    );
  }

  function addInterviewStage(processIndex: number) {
    const process = interviewProcesses[processIndex];
    updateInterviewProcess(processIndex, {
      stages: [
        ...process.stages,
        {
          id: clientId('stage'),
          name: '',
          purpose: '',
          sortOrder: process.stages.length,
        },
      ],
    });
  }

  function removeInterviewStage(processIndex: number, stageIndex: number) {
    const process = interviewProcesses[processIndex];
    updateInterviewProcess(processIndex, {
      stages: process.stages
        .filter((_, currentStageIndex) => currentStageIndex !== stageIndex)
        .map((stage, sortOrder) => ({ ...stage, sortOrder })),
    });
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      const saved = await saveCompanyProfile({
        name: companyName.trim(),
        supportedPlatforms,
        locations: locations.map(cleanLocation),
        interviewProcesses: interviewProcesses.map((process) => ({
          ...process,
          positionType: process.positionType.trim(),
          autoMatch: {
            departments: process.autoMatch?.departments ?? [],
            positionKeywords: process.autoMatch?.positionKeywords ?? [],
            isFallback: process.autoMatch?.isFallback === true,
          },
          stages: process.stages.map((stage, sortOrder) => ({
            ...stage,
            name: stage.name.trim(),
            purpose: stage.purpose.trim(),
            sortOrder,
          })),
        })),
      });
      setCompanyName(saved.name);
      setSupportedPlatforms(saved.supportedPlatforms);
      setLocations(dtoToRows(saved));
      setInterviewProcesses(saved.interviewProcesses ?? []);
      setMessage(meta.successMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存公司信息失败');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载公司信息…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="border-border border-b pb-4">
        <div className="flex items-center gap-2">
          {section === 'company' ? (
            <Building2 className="text-primary h-5 w-5" aria-hidden />
          ) : section === 'locations' ? (
            <MapPin className="text-primary h-5 w-5" aria-hidden />
          ) : (
            <ClipboardList className="text-primary h-5 w-5" aria-hidden />
          )}
          <h1 className="text-foreground text-2xl font-semibold tracking-normal">{meta.title}</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{meta.description}</p>
      </div>

      {error ? (
        <div
          className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {message}
        </div>
      ) : null}

      <section className="border-border space-y-4 rounded-lg border p-4">
        {section === 'company' ? (
          <label className="block space-y-2">
            <FieldLabel>公司名称</FieldLabel>
            <input
              aria-label="公司名称"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
            />
          </label>
        ) : null}

        {section === 'locations' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="text-muted-foreground h-4 w-4" aria-hidden />
                <div className="text-foreground text-sm font-medium">工作地点</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="gap-2"
                  disableRipple
                  type="button"
                  variant="bordered"
                  onClick={() =>
                    setLocations((current) => [...current, createOfficeRow(current.length)])
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  添加办公室
                </Button>
                <Button
                  className="gap-2"
                  disableRipple
                  type="button"
                  variant="bordered"
                  onClick={() => setLocations((current) => [...current, createRemoteRow()])}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  添加远程
                </Button>
              </div>
            </div>

            {locations.map((location, index) => (
              <div
                key={location.clientId}
                className="border-border grid gap-3 rounded-lg border p-3 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]"
              >
                <label className="block space-y-2">
                  <FieldLabel>类型 {index + 1}</FieldLabel>
                  <select
                    aria-label={`地点类型 ${index + 1}`}
                    className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                    value={location.kind}
                    onChange={(event) =>
                      updateKind(index, event.target.value as CompanyWorkLocationKind)
                    }
                  >
                    <option value="office">办公室</option>
                    <option value="remote">远程</option>
                  </select>
                </label>
                <label className="block space-y-2">
                  <FieldLabel>地点 {index + 1}</FieldLabel>
                  <input
                    aria-label={`工作地点 ${index + 1}`}
                    className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                    readOnly={location.kind === 'remote'}
                    value={location.kind === 'remote' ? '远程' : location.label}
                    onChange={(event) => updateLocation(index, { label: event.target.value })}
                  />
                </label>
                <label className="block space-y-2">
                  <FieldLabel>城市 {index + 1}</FieldLabel>
                  <input
                    aria-label={`城市 ${index + 1}`}
                    className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                    disabled={location.kind === 'remote'}
                    value={location.city ?? ''}
                    onChange={(event) => updateLocation(index, { city: event.target.value })}
                  />
                </label>
                <label className="block space-y-2">
                  <FieldLabel>详细地址 {index + 1}</FieldLabel>
                  <input
                    aria-label={`详细地址 ${index + 1}`}
                    className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                    disabled={location.kind === 'remote'}
                    value={location.address ?? ''}
                    onChange={(event) => updateLocation(index, { address: event.target.value })}
                  />
                </label>
                <div className="flex items-end">
                  <Button
                    aria-label={`删除地点 ${index + 1}`}
                    className="min-w-10"
                    disableRipple
                    isDisabled={locations.length === 1}
                    type="button"
                    variant="light"
                    onClick={() =>
                      setLocations((current) =>
                        current.filter((_, locationIndex) => locationIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {section === 'interview-processes' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardList className="text-muted-foreground h-4 w-4" aria-hidden />
                  <div className="text-foreground text-sm font-medium">职位面试流程</div>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  按职位类别维护匹配规则与正式面试轮次；JD 可自动匹配，也可手动指定。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="gap-2"
                  disableRipple
                  type="button"
                  variant="light"
                  onClick={() => {
                    const defaults = getEffectiveInterviewProcesses([]);
                    setInterviewProcesses(defaults);
                    setExpandedInterviewProcessId(defaults[0]?.id ?? null);
                  }}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  恢复默认模板
                </Button>
                <Button
                  className="gap-2"
                  disableRipple
                  type="button"
                  variant="bordered"
                  onClick={() => {
                    const process = createInterviewProcess();
                    setInterviewProcesses((current) => [...current, process]);
                    setExpandedInterviewProcessId(process.id);
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  添加职位类型
                </Button>
              </div>
            </div>

            {interviewProcesses.length === 0 ? (
              <div className="border-border bg-muted/20 rounded-md border border-dashed px-4 py-6 text-center">
                <p className="text-foreground text-sm font-medium">还没有职位面试流程</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  自动匹配会使用系统默认模板；也可以点击“恢复默认模板”后继续编辑。
                </p>
              </div>
            ) : null}

            {interviewProcesses.map((process, processIndex) => (
              <section key={process.id} className="border-border overflow-hidden rounded-lg border">
                <div className="bg-muted/20 flex items-start gap-2 px-3 py-3">
                  <button
                    aria-controls={`interview-process-${process.id}`}
                    aria-expanded={expandedInterviewProcessId === process.id}
                    className="min-w-0 flex-1 text-left"
                    type="button"
                    onClick={() =>
                      setExpandedInterviewProcessId((current) =>
                        current === process.id ? null : process.id,
                      )
                    }
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground text-sm font-semibold">
                        {process.positionType || `未命名职位类型 ${processIndex + 1}`}
                      </span>
                      <span className="border-border bg-background text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
                        {process.stages.length} 轮
                      </span>
                      {process.autoMatch?.isFallback ? (
                        <span className="border-primary/25 bg-primary/10 text-primary rounded-full border px-2 py-0.5 text-xs">
                          默认兜底
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground mt-1 block truncate text-xs">
                      {process.stages.map((stage) => stage.name || '未命名轮次').join(' → ')}
                    </span>
                  </button>
                  <ChevronDown
                    className={`text-muted-foreground mt-1 h-4 w-4 shrink-0 transition-transform ${
                      expandedInterviewProcessId === process.id ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <Button
                    aria-label={`删除职位类型 ${processIndex + 1}`}
                    className="min-w-10"
                    disableRipple
                    type="button"
                    variant="light"
                    onClick={() => {
                      setInterviewProcesses((current) =>
                        current.filter((_, currentIndex) => currentIndex !== processIndex),
                      );
                      if (expandedInterviewProcessId === process.id) {
                        setExpandedInterviewProcessId(null);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>

                {expandedInterviewProcessId === process.id ? (
                  <div id={`interview-process-${process.id}`} className="space-y-4 p-3">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <label className="block space-y-2">
                        <FieldLabel>职位类别名称</FieldLabel>
                        <input
                          aria-label={`职位类型 ${processIndex + 1}`}
                          className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                          placeholder="例如：技术研发类、行政职能类"
                          value={process.positionType}
                          onChange={(event) =>
                            updateInterviewProcess(processIndex, {
                              positionType: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="block space-y-2">
                        <FieldLabel>自动匹配部门</FieldLabel>
                        <input
                          aria-label={`职位类型 ${processIndex + 1} 自动匹配部门`}
                          className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                          placeholder="技术部、研发部（用逗号分隔）"
                          value={(process.autoMatch?.departments ?? []).join('、')}
                          onChange={(event) =>
                            updateInterviewAutoMatch(processIndex, {
                              departments: splitMatchValues(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="block space-y-2 lg:col-span-2">
                        <FieldLabel>职位关键词</FieldLabel>
                        <input
                          aria-label={`职位类型 ${processIndex + 1} 职位关键词`}
                          className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                          placeholder="前端、后端、算法、测试（用逗号分隔）"
                          value={(process.autoMatch?.positionKeywords ?? []).join('、')}
                          onChange={(event) =>
                            updateInterviewAutoMatch(processIndex, {
                              positionKeywords: splitMatchValues(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="border-border bg-muted/20 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm lg:col-span-2">
                        <input
                          aria-label={`职位类型 ${processIndex + 1} 设为默认兜底流程`}
                          checked={process.autoMatch?.isFallback === true}
                          className="mt-0.5 h-4 w-4"
                          type="checkbox"
                          onChange={(event) =>
                            setFallbackInterviewProcess(process.id, event.target.checked)
                          }
                        />
                        <span>
                          <span className="text-foreground block font-medium">
                            设为默认兜底流程
                          </span>
                          <span className="text-muted-foreground mt-0.5 block text-xs">
                            当部门和职位关键词都未命中时使用；全公司只能设置一个。
                          </span>
                        </span>
                      </label>
                    </div>

                    <div className="space-y-2">
                      {process.stages.map((stage, stageIndex) => (
                        <div
                          key={stage.id}
                          className="border-border grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(140px,0.35fr)_minmax(240px,1fr)_auto]"
                        >
                          <label className="block space-y-2">
                            <span className="text-muted-foreground text-xs">
                              第 {stageIndex + 1} 轮名称
                            </span>
                            <input
                              aria-label={`职位类型 ${processIndex + 1} 第 ${stageIndex + 1} 轮名称`}
                              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                              placeholder="例如：技术面"
                              value={stage.name}
                              onChange={(event) =>
                                updateInterviewStage(processIndex, stageIndex, {
                                  name: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="block space-y-2">
                            <span className="text-muted-foreground text-xs">本轮事项</span>
                            <input
                              aria-label={`职位类型 ${processIndex + 1} 第 ${stageIndex + 1} 轮事项`}
                              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                              placeholder="说明本轮要验证什么、由谁负责什么"
                              value={stage.purpose}
                              onChange={(event) =>
                                updateInterviewStage(processIndex, stageIndex, {
                                  purpose: event.target.value,
                                })
                              }
                            />
                          </label>
                          <div className="flex items-end">
                            <Button
                              aria-label={`删除职位类型 ${processIndex + 1} 第 ${stageIndex + 1} 轮`}
                              className="min-w-10"
                              disableRipple
                              isDisabled={process.stages.length === 1}
                              type="button"
                              variant="light"
                              onClick={() => removeInterviewStage(processIndex, stageIndex)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      className="gap-2"
                      disableRipple
                      type="button"
                      variant="bordered"
                      onClick={() => addInterviewStage(processIndex)}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      添加一轮
                    </Button>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        ) : null}

        <Button
          className="gap-2"
          color="primary"
          disableRipple
          isDisabled={
            isSaving ||
            !companyName.trim() ||
            supportedPlatforms.length === 0 ||
            (section === 'locations' &&
              locations.some((location) => location.kind === 'office' && !location.label.trim())) ||
            (section === 'interview-processes' &&
              interviewProcesses.some(
                (process) =>
                  !process.positionType.trim() ||
                  process.stages.some((stage) => !stage.name.trim() || !stage.purpose.trim()),
              ))
          }
          type="button"
          onClick={() => void handleSave()}
        >
          <Save className="h-4 w-4" aria-hidden />
          {isSaving ? '保存中' : meta.saveLabel}
        </Button>
      </section>
    </div>
  );
}
