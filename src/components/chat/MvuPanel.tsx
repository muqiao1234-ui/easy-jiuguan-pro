import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Character, MessageNode, WorldBook } from '../../types';
import { useApp } from '../../hooks/useApp';
import { useGlobalStates } from '../../hooks/useGlobalStates';
import {
  createMvuSnapshot,
  getDisplayMvuState,
  hasMvuValidationFailure,
  getMvuEntryKind,
  getMvuScopeId,
  parseMvuInitBooks,
  replayMvuState,
  type MvuRuntimeState,
} from '../../utils/mvu';
import Button from '../ui/Button';
import Toggle from '../ui/Toggle';
import Icon from '../ui/Icon';
import * as Stores from '../../db/stores';

interface MvuScopeView {
  character: Character;
  role: 'charA' | 'charB';
  scopeId: string;
  book: WorldBook | null;
  runtime: MvuRuntimeState;
  diagnostics: string[];
  initCount: number;
  updateCount: number;
  validationFailed: boolean;
}

interface MvuPanelProps {
  conversationId: string;
  onNodesRefresh?: (conversationId: string) => void;
}

export default function MvuPanel({ conversationId, onNodesRefresh }: MvuPanelProps) {
  const { state, dispatch } = useApp();
  const { scribeConfig, loadScribeContent, updateScribeConfig } = useGlobalStates();
  const [scopes, setScopes] = useState<MvuScopeView[]>([]);
  const [nodes, setNodes] = useState<MessageNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingScopeId, setEditingScopeId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [conversation, allNodes] = await Promise.all([
        Stores.getConversationById(conversationId),
        Stores.getMessageNodesByConversation(conversationId),
      ]);
      if (!conversation) {
        setScopes([]);
        return;
      }
      const characterSlots = await Promise.all([
        Stores.getCharacterById(conversation.characterAId),
        Stores.getCharacterById(conversation.characterBId),
      ]);
      const views = await Promise.all(characterSlots.map(async (character, index) => {
        if (!character) return null;
        const role = (index === 0 ? 'charA' : 'charB') as 'charA' | 'charB';
        const scopeId = getMvuScopeId(character.id, role);
        const book = character.worldBookId ? await Stores.getWorldBookById(character.worldBookId) || null : null;
        const initialized = parseMvuInitBooks(book ? [book] : []);
        const runtimeDiagnostics = allNodes
          .filter((node) => node.mvuData && (node.mvuData.scopeId === scopeId || node.mvuData.scopeId === character.id))
          .flatMap((node) => node.mvuData?.diagnostics || []);
        const diagnostics = [...new Set([...initialized.diagnostics, ...runtimeDiagnostics])];
        const validationFailed = hasMvuValidationFailure(diagnostics);
        return {
          character,
          role,
          scopeId,
          book,
          runtime: replayMvuState(allNodes, scopeId, initialized.snapshot, character.id),
          diagnostics,
          validationFailed,
          initCount: book?.entries.filter((entry) => getMvuEntryKind(entry) === 'init').length || 0,
          updateCount: book?.entries.filter((entry) => getMvuEntryKind(entry) === 'update').length || 0,
        };
      })).then((items) => items.filter((item): item is MvuScopeView => Boolean(item)));
      setNodes(allNodes);
      setScopes(views);
    } catch (caught) {
      setError((caught as Error).message || 'MVU 状态加载失败');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { void loadScribeContent(conversationId); }, [conversationId, loadScribeContent]);
  useEffect(() => { void load(); }, [load]);

  const editingScope = useMemo(
    () => scopes.find((scope) => scope.scopeId === editingScopeId) || null,
    [editingScopeId, scopes]
  );

  const hasValidationFailure = useMemo(
    () => scopes.some((scope) => scope.validationFailed),
    [scopes]
  );

  const startEdit = (scope: MvuScopeView) => {
    setError('');
    setEditingScopeId(scope.scopeId);
    setDraft(JSON.stringify(getDisplayMvuState(scope.runtime), null, 2));
  };

  const latestScopeNode = (scopeId: string) => [...nodes]
    .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
    .find((node) => node.mvuData?.scopeId === scopeId);

  const saveSnapshot = async (scope: MvuScopeView, statData: Record<string, unknown>) => {
    const target = latestScopeNode(scope.scopeId);
    if (!target) {
      setError('请先让该角色完成至少一次回复，再编辑或重置其 MVU 状态。');
      return;
    }
    await Stores.updateMessageNode(target.id, {
      mvuData: {
        scopeId: scope.scopeId,
        operations: [],
        checkpoint: createMvuSnapshot(statData, scope.runtime.snapshot.initializedWorldBookIds),
        displayChanges: [],
      },
    });
    setEditingScopeId(null);
    await load();
    onNodesRefresh?.(conversationId);
  };

  const saveEdit = async () => {
    if (!editingScope) return;
    try {
      const parsed = JSON.parse(draft);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('状态根节点必须是 JSON 对象');
      await saveSnapshot(editingScope, parsed as Record<string, unknown>);
    } catch (caught) {
      setError((caught as Error).message || 'JSON 格式无效');
    }
  };

  const resetScope = async (scope: MvuScopeView) => {
    const initialized = parseMvuInitBooks(scope.book ? [scope.book] : []);
    await saveSnapshot(scope, initialized.snapshot.statData);
  };

  return (
    <div className="space-y-4">
      <div className="border border-cyan-200 dark:border-cyan-800/40 bg-cyan-50/60 dark:bg-cyan-950/15 rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-cyan-800 dark:text-cyan-200">MVU 变量状态</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">兼容 [InitVar]、[mvu_update] 与安全的变量更新语句。每个角色在同一对话中拥有独立状态线和分支快照。</p>
          </div>
          <Toggle
            checked={scribeConfig.mvuEnabled}
            onChange={(enabled) => {
              void updateScribeConfig(conversationId, { mvuEnabled: enabled });
              dispatch({ type: 'SET_MVU_ENABLED', enabled });
            }}
            label="启用 MVU"
          />
        </div>
        {hasValidationFailure && (
          <div className="border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-200">
            MVU规则校验失效，请更换模型或调整MVU提示词。
          </div>
        )}
        {!scribeConfig.mvuEnabled && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">开启后，角色回复会获得当前状态，并可在结尾输出受限的 &lt;UpdateVariable&gt; 更新块。更新块不会显示在气泡或后续正文历史中。</p>
        )}
        {scribeConfig.mvuEnabled && scribeConfig.scribeEnabled && (
          <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-200">
            不推荐与模块化 Gal/RPG 同时开启：两套状态维护器可能重复记录同一剧情，并增加费用或产生矛盾。
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-slate-500">正在读取 MVU 变量状态...</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {scopes.map((scope) => {
            const display = getDisplayMvuState(scope.runtime);
            const hasState = Object.keys(display).length > 0;
            return (
              <section key={scope.scopeId} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white/70 dark:bg-slate-900/35">
                <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                  <div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{scope.role === 'charA' ? '角色 A' : '角色 B'} · {scope.character.name}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{scope.book?.name || '未绑定手动世界书'} · InitVar {scope.initCount} 条 · 更新规则 {scope.updateCount} 条 · 状态回复 {scope.runtime.replyCount}</div>
                  </div>
                  <div className="flex gap-1">
                    <button title="编辑状态" onClick={() => startEdit(scope)} className="p-1 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-300"><Icon name="edit" size={14} /></button>
                    <button title="重置为 InitVar" onClick={() => { void resetScope(scope); }} className="p-1 text-slate-500 hover:text-amber-600 dark:hover:text-amber-300"><Icon name="refresh" size={14} /></button>
                  </div>
                </div>
                <pre className="max-h-64 overflow-auto p-3 text-[11px] leading-relaxed text-slate-700 dark:text-slate-200 bg-slate-50/70 dark:bg-black/10 whitespace-pre-wrap break-words">{hasState ? JSON.stringify(display, null, 2) : '该角色的绑定世界书中未找到 [InitVar] 初始变量。'}</pre>
                {scope.runtime.lastChanges.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2 text-[10px] text-slate-600 dark:text-slate-300">
                    最近变更：{scope.runtime.lastChanges.map((change, index) => (
                      <span key={`${change.path}-${index}`}>
                        {index > 0 ? '；' : ''}{change.path}: {JSON.stringify(change.oldValue)} -&gt; {JSON.stringify(change.newValue)}
                      </span>
                    ))}
                  </div>
                )}
                {scope.diagnostics.length > 0 && <div className="border-t border-rose-200 dark:border-rose-800/40 px-3 py-2 text-[10px] text-rose-700 dark:text-rose-300">初始化诊断：{scope.diagnostics.join('；')}</div>}
              </section>
            );
          })}
        </div>
      )}

      <section className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">MVU 设置</h3>
            <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">该提示词会追加在角色系统提示词后。占位符由程序注入，请保留 {`{state}`}、{`{schema}`}、{`{rules}`}。</p>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-300">自动保存</span>
        </div>
        <textarea
          value={state.tplMvuPrompt}
          onChange={(event) => dispatch({ type: 'SET_ADV_TPL', key: 'tplMvuPrompt', value: event.target.value })}
          rows={10}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-[11px] leading-relaxed text-slate-900 dark:text-slate-100 font-mono resize-y focus:outline-none focus:border-cyan-500"
        />
      </section>

      {editingScope && (
        <section className="border border-cyan-300 dark:border-cyan-700/50 rounded-lg p-3 space-y-2 bg-cyan-50/50 dark:bg-cyan-950/15">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-cyan-800 dark:text-cyan-200">编辑 {editingScope.character.name} 的当前状态</h3>
            <button title="关闭编辑" onClick={() => setEditingScopeId(null)} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"><Icon name="close" size={15} /></button>
          </div>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={14} className="w-full rounded border border-cyan-200 dark:border-cyan-800/50 bg-white dark:bg-slate-900 p-2 text-[11px] text-slate-900 dark:text-slate-100 font-mono resize-y focus:outline-none" />
          <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditingScopeId(null)}>取消</Button><Button size="sm" onClick={() => { void saveEdit(); }}>保存状态</Button></div>
        </section>
      )}
      {error && <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>}
    </div>
  );
}
