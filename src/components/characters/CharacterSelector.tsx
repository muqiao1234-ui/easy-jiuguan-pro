import React from 'react';
import type { Character } from '../../types';
import Dropdown from '../ui/Dropdown';

interface CharacterSelectorProps {
  characters: Character[];
  charAId: string | null;
  charBId: string | null;
  onCharAChange: (id: string) => void;
  onCharBChange: (id: string) => void;
}

export default function CharacterSelector({
  characters,
  charAId,
  charBId,
  onCharAChange,
  onCharBChange,
}: CharacterSelectorProps) {
  const options = characters.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-slate-900/80 border-b border-slate-800">
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-xs text-slate-400 whitespace-nowrap">角色A:</span>
        <Dropdown
          options={options}
          value={charAId}
          onChange={onCharAChange}
          placeholder="选择角色A"
          className="flex-1 min-w-0"
        />
      </div>
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-xs text-slate-400 whitespace-nowrap">角色B:</span>
        <Dropdown
          options={options}
          value={charBId}
          onChange={onCharBChange}
          placeholder="选择角色B"
          className="flex-1 min-w-0"
        />
      </div>
    </div>
  );
}
