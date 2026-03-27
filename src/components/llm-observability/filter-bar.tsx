'use client';

import { Input, Switch } from '@/components/ui';
import type { LlmStatsFilters } from '@/components/llm-observability/types';

type FilterBarProps = {
  filters: LlmStatsFilters;
  onChange: (patch: Partial<LlmStatsFilters>) => void;
};

export function FilterBar({ filters, onChange }: FilterBarProps) {
  return (
    <div className="border-border/60 bg-background/70 grid grid-cols-1 gap-3 rounded-xl border p-4 md:grid-cols-3 lg:grid-cols-6">
      <Input
        label="Start Date"
        type="date"
        value={filters.startDate}
        onValueChange={(value) => onChange({ startDate: value, page: 1 })}
      />
      <Input
        label="End Date"
        type="date"
        value={filters.endDate}
        onValueChange={(value) => onChange({ endDate: value, page: 1 })}
      />
      <Input
        label="Timezone"
        value={filters.timezone}
        onValueChange={(value) => onChange({ timezone: value, page: 1 })}
        placeholder="Asia/Shanghai"
      />
      <Input
        label="Provider"
        value={filters.provider}
        onValueChange={(value) => onChange({ provider: value, page: 1 })}
        placeholder="openai"
      />
      <Input
        label="Model"
        value={filters.model}
        onValueChange={(value) => onChange({ model: value, page: 1 })}
        placeholder="gpt-4o-mini"
      />
      <Input
        label="Admin Token (optional)"
        value={filters.adminToken}
        onValueChange={(value) => onChange({ adminToken: value })}
        placeholder="for details access"
      />
      <div className="col-span-1 flex items-center justify-between md:col-span-2 lg:col-span-3">
        <Switch
          isSelected={filters.onlyError}
          onValueChange={(checked) => onChange({ onlyError: checked, page: 1 })}
        >
          Only errors
        </Switch>
        <div className="text-foreground/70 text-xs">Granularity: {filters.granularity}</div>
      </div>
    </div>
  );
}
