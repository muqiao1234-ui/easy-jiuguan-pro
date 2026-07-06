import React from 'react';
import type { ModelConfig } from '../../types';
import Dropdown from '../ui/Dropdown';

interface ModelSelectorProps {
  models: ModelConfig[];
  chatModelId: string | null;
  distillModelId: string | null;
  onChatModelChange: (id: string) => void;
  onDistillModelChange: (id: string) => void;
}

export default function ModelSelector({
  models,
  chatModelId,
  distillModelId,
  onChatModelChange,
  onDistillModelChange,
}: ModelSelectorProps) {
  const options = models.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.defaultModel})`,
  }));

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-900/60 border-b border-slate-800">
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-[11px] text-slate-500 whitespace-nowrap">聊天模型:</span>
        <Dropdown
          options={options}
          value={chatModelId}
          onChange={onChatModelChange}
          placeholder="未选择"
          className="flex-1 min-w-0"
        />
      </div>
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-[11px] text-slate-500 whitespace-nowrap">蒸馏模型:</span>
        <Dropdown
          options={options}
          value={distillModelId}
          onChange={onDistillModelChange}
          placeholder="未选择"
          className="flex-1 min-w-0"
        />
      </div>
    </div>
  );
}
