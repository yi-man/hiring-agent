'use client';

import { Building2, Check } from 'lucide-react';
import type { RecruitmentPlatform } from '@/lib/recruitment-platforms';
import type { RecruitmentPlatformMetadataDto } from '@/lib/recruitment-platform-config';

export function RecruitmentPlatformSelector({
  value,
  onChange,
  disabled = false,
  includeLocal = true,
  label = '招聘平台',
  platforms,
}: {
  value: RecruitmentPlatform[];
  onChange: (value: RecruitmentPlatform[]) => void;
  disabled?: boolean;
  includeLocal?: boolean;
  label?: string;
  platforms: RecruitmentPlatformMetadataDto[];
}) {
  const visiblePlatforms = includeLocal
    ? platforms
    : platforms.filter((platform) => platform.kind === 'production');

  function toggle(platform: RecruitmentPlatform) {
    const next = value.includes(platform)
      ? value.filter((item) => item !== platform)
      : [...value, platform];
    onChange(platforms.map((item) => item.id).filter((item) => next.includes(item)));
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-foreground text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={label}>
        {visiblePlatforms.map((platform) => {
          const selected = value.includes(platform.id);
          return (
            <label
              key={platform.id}
              className={`relative flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                selected ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/40'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                checked={selected}
                className="sr-only"
                type="checkbox"
                value={platform.id}
                onChange={() => toggle(platform.id)}
              />
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                  selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {selected ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Building2 className="h-4 w-4" aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className="text-foreground block text-sm font-medium">{platform.label}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-5">
                  {platform.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
