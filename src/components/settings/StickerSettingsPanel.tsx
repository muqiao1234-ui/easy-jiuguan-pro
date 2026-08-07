import React, { useRef, useState } from 'react';
import { useApp } from '../../hooks/useApp';
import { useStickerPacks } from '../../hooks/useStickerPacks';
import { prepareStickerFile } from '../../utils/stickers';
import { MAX_STICKER_PACKS, MAX_STICKERS_PER_PACK } from '../../utils/constants';
import Button from '../ui/Button';
import Toggle from '../ui/Toggle';
import Icon from '../ui/Icon';

interface StickerSettingsPanelProps {
  onBack: () => void;
}

export default function StickerSettingsPanel({ onBack }: StickerSettingsPanelProps) {
  const { state, dispatch } = useApp();
  const { packs, assetUrls, createPack, updatePack, addSticker, removeSticker, deletePack } = useStickerPacks();
  const [newPackName, setNewPackName] = useState('');
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busyPackId, setBusyPackId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleCreatePack = async () => {
    try {
      setError('');
      await createPack(newPackName);
      setNewPackName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建表情包失败');
    }
  };

  const handleUpload = async (packId: string, file?: File) => {
    if (!file) return;
    try {
      setError('');
      setBusyPackId(packId);
      const sticker = await prepareStickerFile(file, labels[packId] || '');
      await addSticker(packId, sticker);
      setLabels((current) => ({ ...current, [packId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传表情失败');
    } finally {
      setBusyPackId(null);
      const input = fileInputs.current[packId];
      if (input) input.value = '';
    }
  };

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} title="返回设置">
          <span aria-hidden="true">←</span> 返回
        </Button>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">高级表情包设置</h3>
          <p className="text-[10px] text-slate-600 dark:text-slate-300">本地图片只保存在浏览器 IndexedDB，不会发送给 API。</p>
        </div>
      </div>

      <div className="border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">启用表情包功能</p>
            <p className="text-[10px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
              上传并打标后，还需要在具体对话的“工具 → 表情包”中分别为角色 A、B 绑定。
            </p>
          </div>
          <Toggle checked={state.stickerEnabled} onChange={(enabled) => dispatch({ type: 'SET_STICKER_ENABLED', enabled })} />
        </div>
        <p className="text-[10px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
          打标请使用清楚明确的情绪或动作词，例如“开心”“惊讶”“委屈”。请勿设置完全一样的词汇，否则 AI 难以正确选择。
        </p>
      </div>

      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 bg-white/60 dark:bg-slate-800/40">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">表情包组</h4>
            <p className="text-[10px] text-slate-600 dark:text-slate-300">最多 {MAX_STICKER_PACKS} 组，每组最多 {MAX_STICKERS_PER_PACK} 张；静态图自动压缩，GIF 需不超过 1.8 MiB。</p>
          </div>
          <span className="text-xs tabular-nums text-slate-500">{packs.length}/{MAX_STICKER_PACKS}</span>
        </div>
        {packs.length < MAX_STICKER_PACKS && (
          <div className="flex gap-2">
            <input
              value={newPackName}
              onChange={(event) => setNewPackName(event.target.value)}
              placeholder="新表情包名称"
              maxLength={30}
              className="min-w-0 flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
            <Button size="sm" onClick={handleCreatePack}><Icon name="plus" size={13} /> 新建</Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</div>
      )}

      {packs.map((pack) => (
        <section key={pack.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-3 bg-white/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <input
              defaultValue={pack.name}
              maxLength={30}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name && name !== pack.name) void updatePack(pack.id, { name });
                else event.target.value = pack.name;
              }}
              className="min-w-0 flex-1 bg-transparent border-b border-transparent hover:border-slate-400 focus:border-amber-500 focus:outline-none text-sm font-medium text-slate-900 dark:text-slate-100"
            />
            <span className="text-[10px] text-slate-500 tabular-nums">{pack.stickers.length}/{MAX_STICKERS_PER_PACK}</span>
            <Button
              variant="ghost"
              size="sm"
              title="删除表情包"
              onClick={() => {
                if (window.confirm(`确认删除表情包“${pack.name}”？已绑定它的角色槽位会自动关闭。`)) void deletePack(pack.id);
              }}
            >
              <Icon name="trash" size={13} />
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {pack.stickers.map((sticker) => (
              <div key={sticker.id} className="relative border border-slate-200 dark:border-slate-700 rounded-md p-2 bg-slate-50 dark:bg-slate-900/60">
                <img src={assetUrls[sticker.id]} alt={sticker.label} className="h-20 w-full object-contain" />
                <input
                  defaultValue={sticker.label}
                  maxLength={24}
                  onBlur={(event) => {
                    const label = event.target.value.trim();
                    if (!label) {
                      event.target.value = sticker.label;
                      return;
                    }
                    if (label !== sticker.label) {
                      void updatePack(pack.id, {
                        stickers: pack.stickers.map((item) => item.id === sticker.id ? { ...item, label } : item),
                      });
                    }
                  }}
                  aria-label="表情标签"
                  className="mt-1 w-full bg-transparent text-center text-[11px] text-slate-800 dark:text-slate-200 border-b border-transparent focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void removeSticker(pack.id, sticker.id)}
                  className="absolute right-1 top-1 w-6 h-6 rounded-full bg-slate-900/70 text-white hover:bg-red-600 flex items-center justify-center"
                  title="移除表情"
                  aria-label={`移除${sticker.label}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {pack.stickers.length < MAX_STICKERS_PER_PACK && (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                value={labels[pack.id] || ''}
                onChange={(event) => setLabels((current) => ({ ...current, [pack.id]: event.target.value }))}
                placeholder="先输入标签，例如：开心"
                maxLength={24}
                className="min-w-0 flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!labels[pack.id]?.trim() || busyPackId === pack.id}
                loading={busyPackId === pack.id}
                onClick={() => fileInputs.current[pack.id]?.click()}
              >
                上传并压缩
              </Button>
              <input
                ref={(element) => { fileInputs.current[pack.id] = element; }}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => void handleUpload(pack.id, event.target.files?.[0])}
              />
            </div>
          )}
        </section>
      ))}

      {packs.length === 0 && (
        <div className="py-10 text-center text-xs text-slate-500">尚未创建表情包组。</div>
      )}
    </div>
  );
}
