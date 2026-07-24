'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cable, CheckCircle2, CircleOff, Globe2, Save, ShieldCheck } from 'lucide-react';
import { RecruitmentPlatformSelector } from '@/components/recruitment-platform-selector';
import { Button } from '@/components/ui';
import {
  fetchCompanySettings,
  saveCompanyProfile,
  saveCompanyRecruitmentPlatforms,
} from '@/lib/company-profile/client';
import type {
  CompanyProfileDto,
  CompanyRecruitmentPlatformInput,
} from '@/lib/company-profile/types';
import type { RecruitmentPlatformMetadataDto } from '@/lib/recruitment-platform-config';
import type { RecruitmentPlatform } from '@/lib/recruitment-platforms';

type PlatformConfigDraft = {
  baseUrl: string;
  username: string;
  password: string;
  hasPassword: boolean;
  variablesText: string;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground text-sm font-medium">{children}</span>;
}

function createPlatformDrafts(
  platforms: RecruitmentPlatformMetadataDto[],
  profile: CompanyProfileDto | null,
): Partial<Record<RecruitmentPlatform, PlatformConfigDraft>> {
  return Object.fromEntries(
    platforms.map((platform) => {
      const config = profile?.platformConfigs?.find((item) => item.platformId === platform.id);
      return [
        platform.id,
        {
          baseUrl: config?.baseUrl ?? platform.defaultBaseUrl,
          username: config?.username ?? '',
          password: '',
          hasPassword: config?.hasPassword ?? false,
          variablesText: JSON.stringify(config?.variables ?? platform.defaultVariables, null, 2),
        },
      ];
    }),
  );
}

export function RecruitmentPlatformSettingsPage() {
  const [profile, setProfile] = useState<CompanyProfileDto | null>(null);
  const [platforms, setPlatforms] = useState<RecruitmentPlatformMetadataDto[]>([]);
  const [supportedPlatforms, setSupportedPlatforms] = useState<RecruitmentPlatform[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<RecruitmentPlatform, PlatformConfigDraft>>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadSettings() {
      setIsLoading(true);
      setError('');
      try {
        const settings = await fetchCompanySettings();
        if (!isActive) return;
        setProfile(settings.profile);
        setPlatforms(settings.platforms);
        setSupportedPlatforms(settings.profile?.supportedPlatforms ?? []);
        setDrafts(createPlatformDrafts(settings.platforms, settings.profile));
      } catch (e) {
        if (isActive) setError(e instanceof Error ? e.message : '加载招聘平台失败');
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void loadSettings();
    return () => {
      isActive = false;
    };
  }, []);

  function updateDraft(platformId: RecruitmentPlatform, patch: Partial<PlatformConfigDraft>) {
    setDrafts((current) => {
      const draft = current[platformId];
      if (!draft) return current;
      return { ...current, [platformId]: { ...draft, ...patch } };
    });
  }

  function buildPlatformConfigs(): CompanyRecruitmentPlatformInput[] {
    if (!profile) throw new Error('请先完成公司设置');
    return platforms.map((metadata) => {
      const platformId = metadata.id;
      const draft = drafts[platformId];
      if (!metadata || !draft) throw new Error(`缺少 ${platformId} 平台配置`);

      let variables: unknown;
      try {
        variables = JSON.parse(draft.variablesText || '{}');
      } catch {
        throw new Error(`${metadata.label} 的附加变量不是有效 JSON`);
      }
      if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
        throw new Error(`${metadata.label} 的附加变量必须是 JSON 对象`);
      }
      if (Object.values(variables).some((value) => typeof value !== 'string')) {
        throw new Error(`${metadata.label} 的附加变量值必须是字符串`);
      }

      return {
        platformId,
        baseUrl: draft.baseUrl.trim(),
        username: draft.username.trim(),
        ...(draft.password ? { password: draft.password } : {}),
        variables: variables as Record<string, string>,
      };
    });
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      if (!profile) throw new Error('请先完成公司设置');
      const savedProfile = await saveCompanyProfile({
        name: profile.name,
        supportedPlatforms,
        locations: profile.locations.map(({ kind, label, city, address }) => ({
          kind,
          label,
          city,
          address,
        })),
      });
      const saved = await saveCompanyRecruitmentPlatforms(buildPlatformConfigs());
      setProfile(saved);
      setSupportedPlatforms(savedProfile.supportedPlatforms);
      setDrafts(createPlatformDrafts(platforms, saved));
      setMessage('招聘平台已保存');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存招聘平台失败');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载招聘平台…</div>;
  }

  const enabledPlatforms = new Set(supportedPlatforms);

  return (
    <div className="space-y-5">
      <div className="border-border flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-primary mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
            <Globe2 className="h-4 w-4" aria-hidden />
            Platform operations
          </div>
          <h1 className="text-foreground text-2xl font-semibold tracking-normal">招聘平台</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-6">
            统一维护平台入口、登录凭据与站点变量。任务会根据实际地址自动匹配或探索对应 Workflow
            Skill。
          </p>
        </div>
        <div className="border-border bg-muted/20 flex shrink-0 items-center gap-3 rounded-lg border px-4 py-3">
          <span className="bg-background border-border flex h-9 w-9 items-center justify-center rounded-lg border">
            <Cable className="text-primary h-4 w-4" aria-hidden />
          </span>
          <div>
            <div className="text-foreground text-lg leading-none font-semibold">
              {enabledPlatforms.size}
              <span className="text-muted-foreground ml-1 text-xs font-normal">
                / {platforms.length}
              </span>
            </div>
            <div className="text-muted-foreground mt-1 text-xs">已启用平台</div>
          </div>
        </div>
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

      {!profile ? (
        <div className="border-border rounded-lg border p-6 text-center">
          <h2 className="text-foreground text-base font-semibold">请先完成公司设置</h2>
          <p className="text-muted-foreground mt-1 text-sm">创建公司信息后才能保存平台连接。</p>
          <Link
            className="text-primary mt-4 inline-block text-sm font-medium hover:underline"
            href="/settings/company"
          >
            前往公司设置
          </Link>
        </div>
      ) : (
        <>
          <section className="border-border rounded-xl border p-5">
            <RecruitmentPlatformSelector
              label="启用的招聘平台"
              platforms={platforms}
              value={supportedPlatforms}
              onChange={setSupportedPlatforms}
            />
            {supportedPlatforms.length === 0 ? (
              <p className="text-destructive mt-2 text-xs">请至少选择一个招聘平台。</p>
            ) : null}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            {platforms.map((metadata) => {
              const isEnabled = enabledPlatforms.has(metadata.id);
              const draft = drafts[metadata.id];
              return (
                <article
                  key={metadata.id}
                  aria-label={`${metadata.label}平台`}
                  className={`border-border overflow-hidden rounded-xl border ${
                    isEnabled ? 'bg-background' : 'bg-muted/15'
                  }`}
                >
                  <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                        <Globe2 className="text-muted-foreground h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-foreground text-sm font-semibold">{metadata.label}</h2>
                        <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                          {metadata.description}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${
                        isEnabled
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'border-border bg-background text-muted-foreground'
                      }`}
                    >
                      {isEnabled ? (
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                      ) : (
                        <CircleOff className="h-3 w-3" aria-hidden />
                      )}
                      {isEnabled ? '默认启用' : '备用平台'}
                    </span>
                  </div>

                  {draft ? (
                    <div className="grid gap-4 p-5 sm:grid-cols-2">
                      <label className="block space-y-2 sm:col-span-2">
                        <FieldLabel>平台地址</FieldLabel>
                        <input
                          aria-label={`${metadata.label}平台地址`}
                          className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 font-mono text-sm"
                          placeholder={metadata.defaultBaseUrl}
                          type="url"
                          value={draft.baseUrl}
                          onChange={(event) =>
                            updateDraft(metadata.id, { baseUrl: event.target.value })
                          }
                        />
                        <span className="text-muted-foreground block truncate font-mono text-[11px]">
                          默认：{metadata.defaultBaseUrl}
                        </span>
                      </label>
                      <label className="block space-y-2">
                        <FieldLabel>登录账号</FieldLabel>
                        <input
                          aria-label={`${metadata.label}登录账号`}
                          autoComplete="username"
                          className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                          value={draft.username}
                          onChange={(event) =>
                            updateDraft(metadata.id, { username: event.target.value })
                          }
                        />
                      </label>
                      <label className="block space-y-2">
                        <FieldLabel>登录密码</FieldLabel>
                        <input
                          aria-label={`${metadata.label}登录密码`}
                          autoComplete="new-password"
                          className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                          placeholder={draft.hasPassword ? '已配置，留空则不修改' : '尚未配置'}
                          type="password"
                          value={draft.password}
                          onChange={(event) =>
                            updateDraft(metadata.id, { password: event.target.value })
                          }
                        />
                      </label>
                      <label className="block space-y-2 sm:col-span-2">
                        <FieldLabel>附加变量（JSON）</FieldLabel>
                        <textarea
                          aria-label={`${metadata.label}附加变量`}
                          className="border-input bg-muted/15 text-foreground min-h-24 w-full resize-y rounded-md border px-3 py-2 font-mono text-xs leading-5"
                          spellCheck={false}
                          value={draft.variablesText}
                          onChange={(event) =>
                            updateDraft(metadata.id, { variablesText: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="flex min-h-44 flex-col items-center justify-center px-5 py-8 text-center">
                      <CircleOff className="text-muted-foreground h-5 w-5" aria-hidden />
                      <p className="text-muted-foreground mt-3 max-w-sm text-sm leading-6">
                        暂时无法加载该平台的连接配置。
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="border-border bg-background flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="text-muted-foreground text-xs leading-5">
                密码会加密保存且不会回显。修改平台地址后，下一次任务会按新站点指纹重新匹配 Workflow
                Skill。
              </p>
            </div>
            <Button
              className="shrink-0 gap-2"
              color="primary"
              disableRipple
              isDisabled={isSaving || platforms.length === 0 || supportedPlatforms.length === 0}
              type="button"
              onClick={() => void handleSave()}
            >
              <Save className="h-4 w-4" aria-hidden />
              {isSaving ? '保存中' : '保存招聘平台'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
