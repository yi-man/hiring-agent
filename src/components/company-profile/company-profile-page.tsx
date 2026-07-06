'use client';

import { useEffect, useState } from 'react';
import { MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { fetchCompanyProfile, saveCompanyProfile } from '@/lib/company-profile/client';
import type {
  CompanyProfileDto,
  CompanyWorkLocationInput,
  CompanyWorkLocationKind,
} from '@/lib/company-profile/types';

type LocationRow = CompanyWorkLocationInput & {
  clientId: string;
};

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

export function CompanyProfilePage() {
  const [companyName, setCompanyName] = useState('');
  const [locations, setLocations] = useState<LocationRow[]>([createOfficeRow(0)]);
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
        const profile = await fetchCompanyProfile();
        if (!isActive) return;
        setCompanyName(profile?.name ?? '');
        setLocations(dtoToRows(profile));
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

  async function handleSave() {
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      const saved = await saveCompanyProfile({
        name: companyName.trim(),
        locations: locations.map(cleanLocation),
      });
      setCompanyName(saved.name);
      setLocations(dtoToRows(saved));
      setMessage('公司信息已保存');
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
        <h1 className="text-foreground text-2xl font-semibold tracking-normal">公司设置</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          维护发布 JD 时使用的公司名称和工作地点。
        </p>
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
        <label className="block space-y-2">
          <FieldLabel>公司名称</FieldLabel>
          <input
            aria-label="公司名称"
            className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </label>

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

        <Button
          className="gap-2"
          color="primary"
          disableRipple
          isDisabled={isSaving || !companyName.trim()}
          type="button"
          onClick={() => void handleSave()}
        >
          <Save className="h-4 w-4" aria-hidden />
          {isSaving ? '保存中' : '保存公司信息'}
        </Button>
      </section>
    </div>
  );
}
