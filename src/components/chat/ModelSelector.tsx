import React from 'react';
import type { ModelConfig } from '../../types';
import Dropdown from '../ui/Dropdown';

interface ModelSelectorProps {
  models: ModelConfig[];
  charAModelId: string | null;
  charBModelId: string | null;
  onCharAModelChange: (id: string) => void;
  onCharBModelChange: (id: string) => void;
}

export default function ModelSelector({
  models,
  charAModelId,
  charBModelId,
  onCharAModelChange,
  onCharBModelChange,
}: ModelSelectorProps) {
  const options = models.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.defaultModel})`,
  }));

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-900/60 border-b border-slate-800">
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-[11px] text-emerald-400 whitespace-nowrap">角色 A:</span>
        <Dropdown
          options={options}
          value={charAModelId}
          onChange={onCharAModelChange}
          placeholder="未选择"
          className="flex-1 min-w-0"
        />
      </div>
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-[11px] text-violet-400 whitespace-nowrap">角色 B:</span>
        <Dropdown
          options={options}
          value={charBModelId}
          onChange={onCharBModelChange}
          placeholder="未选择"
          className="flex-1 min-w-0"
        />
      </div>
    </div>
  );
}
