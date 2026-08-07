import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './hooks/useApp';
import { useModels } from './hooks/useModels';
import { useCharacters } from './hooks/useCharacters';
import { useConversations } from './hooks/useConversations';
import { useMessageNodes } from './hooks/useMessageNodes';
import { useImageGenerationTasks } from './hooks/useImageGenerationTasks';
import { LOGO_BASE64 } from './utils/logoBase64';
import { seedPresets, PRESET_MODEL_ID } from './utils/presets';
import type { Character, ImageGenerationTask } from './types';
import MainLayout from './components/layout/MainLayout';
import MobileLayout from './components/layout/MobileLayout';
import ConversationList from './components/conversations/ConversationList';
import WorldBookManager from './components/worldbook/WorldBookManager';
import CharacterManager from './components/characters/CharacterManager';
import GitHubCharacterStore from './components/characters/GitHubCharacterStore';
import ModelManager from './components/models/ModelManager';
import ModelPing from './components/models/ModelPing';
import CostPresetPanel from './components/settings/CostPresetPanel';
import SettingsPanel from './components/settings/SettingsPanel';
import ChatArea from './components/chat/ChatArea';
import StateBookPanel from './components/chat/StateBookPanel';
import StickerSettingsPanel from './components/settings/StickerSettingsPanel';
import SyncCenterPanel from './components/settings/SyncCenterPanel';
import ImageSettingsPanel from './components/settings/ImageSettingsPanel';
import { completeOAuthFromLocation } from './utils/sync';

/* ──────────────── Inner App (has access to AppContext) ──────────────── */

function AppInner() {
  const { state, dispatch } = useApp();
  const { models, loadModels } = useModels();
  const { characters, loadCharacters } = useCharacters();
  const {
    conversations,
    folders,
    currentConversation,
    loadConversations,
    createConversation,
    deleteConversation,
    createConversationFolder,
    renameConversationFolder,
    setConversationFolderCollapsed,
    addConversationsToFolder,
    removeConversationFromFolder,
    deleteConversationFolder,
    setCurrentConversation,
    addConversationDirect,
  } = useConversations();
  const { loadNodes, cloneToNewConversation } = useMessageNodes();
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPage, setSettingsPage] = useState<'main' | 'stickers' | 'sync' | 'images'>('main');
  const [syncInitialTab, setSyncInitialTab] = useState<'sync' | 'secrets'>('sync');
  const [syncInitialAction, setSyncInitialAction] = useState<'upload' | 'download' | null>(null);
  const [oauthNotice, setOAuthNotice] = useState('');
  const [imageTaskToEdit, setImageTaskToEdit] = useState<ImageGenerationTask | null>(null);
  const [imageTaskRevision, setImageTaskRevision] = useState(0);
  const handleImageReady = useCallback(() => setImageTaskRevision((revision) => revision + 1), []);
  const { tasks: imageTasks, queueTask: queueImageTask, cancelTask: cancelImageTask } = useImageGenerationTasks(handleImageReady);
  const characterCardImporterRef = useRef<((file: File) => Promise<string>) | null>(null);

  const registerCharacterCardImporter = useCallback((importer: (file: File) => Promise<string>) => {
    characterCardImporterRef.current = importer;
  }, []);

  const importRepositoryCharacterCard = useCallback(async (file: File): Promise<string> => {
    const importer = characterCardImporterRef.current;
    if (!importer) throw new Error('角色管理正在加载，请稍后再试。');
    return importer(file);
  }, []);

  // Init data — 首次启动写入预设，随后加载所有数据
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    (async () => {
      await seedPresets();
      setSeeded(true);
    })();
  }, []);
  useEffect(() => {
    let dismissTimer: number | undefined;
    void completeOAuthFromLocation().catch((error) => {
      const detail = error instanceof Error ? error.message : 'Unknown authorization error';
      setOAuthNotice(`同步 OAuth 登录失败：${detail}。请在“导出、同步与密钥管理”中检查客户端 ID、Redirect URI 和网络后重试。`);
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      dismissTimer = window.setTimeout(() => setOAuthNotice(''), 15_000);
    });
    return () => { if (dismissTimer) window.clearTimeout(dismissTimer); };
  }, []);
  useEffect(() => {
    if (!seeded) return;
    loadModels();
    loadCharacters();
    loadConversations();
  }, [seeded]);

  // 当预设模型已注入但角色槽位尚未选择模型时，自动绑定到 A/B。
  useEffect(() => {
    if (!models.some((m) => m.id === PRESET_MODEL_ID)) return;
    if (!state.currentCharAModelId || !models.some((m) => m.id === state.currentCharAModelId)) {
      dispatch({ type: 'SET_CHAR_A_MODEL', id: PRESET_MODEL_ID });
    }
    if (!state.currentCharBModelId || !models.some((m) => m.id === state.currentCharBModelId)) {
      dispatch({ type: 'SET_CHAR_B_MODEL', id: PRESET_MODEL_ID });
    }
  }, [models, state.currentCharAModelId, state.currentCharBModelId]);

  // Load conversation data when switching
  useEffect(() => {
    if (state.currentConversationId) {
      loadNodes(state.currentConversationId);
    }
  }, [state.currentConversationId]);

  // Derived: current conversation's characters
  const currentConv = conversations.find((c) => c.id === state.currentConversationId) || null;
  const charAId = currentConv?.characterAId || null;
  const charBId = currentConv?.characterBId || null;
  const characterA: Character | null = characters.find((c) => c.id === charAId) || null;
  const characterB: Character | null = characters.find((c) => c.id === charBId) || null;

  const handleViewChange = (view: typeof state.activeView) => {
    if (view !== 'settings') setSettingsPage('main');
    dispatch({ type: 'SET_VIEW', view });
  };

  const handleBranch = async (nodeId: string) => {
    if (!currentConv) return;
    const newConv = await cloneToNewConversation(nodeId, currentConv);
    if (newConv) {
      addConversationDirect(newConv);
      setCurrentConversation(newConv.id);
      dispatch({ type: 'SET_CONVERSATION', id: newConv.id });
    }
  };

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    if (state.currentConversationId === id) {
      setCurrentConversation(null);
      dispatch({ type: 'SET_CURRENT_CONVERSATION', id: null });
    }
  }, [deleteConversation, dispatch, setCurrentConversation, state.currentConversationId]);

  // Resolve active view content for sidebar
  const renderSidebarContent = () => {
    switch (state.activeView) {
      case 'conversations':
        return (
          <ConversationList
            conversations={conversations}
            folders={folders}
            characters={characters}
            currentConversation={currentConversation}
            onCreateConversation={createConversation}
            onDeleteConversation={handleDeleteConversation}
            onCreateFolder={createConversationFolder}
            onRenameFolder={renameConversationFolder}
            onSetFolderCollapsed={setConversationFolderCollapsed}
            onAddConversationsToFolder={addConversationsToFolder}
            onRemoveConversationFromFolder={removeConversationFromFolder}
            onDeleteFolder={deleteConversationFolder}
            onSelectConversation={(id) => {
              setCurrentConversation(id);
              dispatch({ type: 'SET_CONVERSATION', id });
            }}
          />
        );
      case 'worldbook':
        // 移动端在主区域显示，侧边栏不重复渲染
        return state.isMobile ? null : <WorldBookManager />;
      case 'characters':
        return state.isMobile ? null : <CharacterManager onRepositoryImporterReady={registerCharacterCardImporter} />;
      case 'statebook':
        return (
          <ConversationList
            conversations={conversations}
            folders={folders}
            characters={characters}
            currentConversation={currentConversation}
            onCreateConversation={createConversation}
            onDeleteConversation={handleDeleteConversation}
            onCreateFolder={createConversationFolder}
            onRenameFolder={renameConversationFolder}
            onSetFolderCollapsed={setConversationFolderCollapsed}
            onAddConversationsToFolder={addConversationsToFolder}
            onRemoveConversationFromFolder={removeConversationFromFolder}
            onDeleteFolder={deleteConversationFolder}
            onSelectConversation={(id) => {
              setCurrentConversation(id);
              dispatch({ type: 'SET_CURRENT_CONVERSATION', id });
            }}
          />
        );
      case 'settings':
        // 设置页面内容只在主区域显示，侧边栏留空（仅保留导航 tab）
        return null;
      default:
        return null;
    }
  };

  // Resolve main area content
  const renderMainContent = () => {
    if (state.activeView === 'conversations') {
      if (!state.currentConversationId) {
        return (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <div className="text-center">
              <img
                src={LOGO_BASE64}
                alt="Easy酒馆Pro"
                className="w-24 h-24 mx-auto mb-4 rounded-2xl object-cover shadow-lg"
              />
              <p className="text-lg font-medium text-slate-500">欢迎来到 Easy酒馆Pro</p>
              <p className="text-sm mt-1">先在左侧创建一个对话，或选择一个已有对话开始</p>
            </div>
          </div>
        );
      }
      return (
        <ChatArea
          characterA={characterA}
          characterB={characterB}
          allCharacters={characters}
          stickerPackAId={currentConv?.stickerPackAId}
          stickerPackBId={currentConv?.stickerPackBId}
          userName={currentConv?.userName}
          userDescription={currentConv?.userDescription}
          onStickerBindingsChange={(updates) => {
            if (!currentConv) return;
            import('./db/stores').then((stores) =>
              stores.updateConversation(currentConv.id, updates).then(() => loadConversations())
            );
          }}
          onCharAChange={(id) => {
            const conv = conversations.find((c) => c.id === state.currentConversationId);
            if (conv) {
              void import('./db/stores').then(async (stores) => {
                await stores.updateConversation(conv.id, { characterAId: id });
                const character = await stores.getCharacterById(id);
                if (character?.mvuEnabled) await stores.patchGlobalState(conv.id, { mvuEnabled: true });
                await loadConversations();
              });
            }
          }}
          onCharBChange={(id) => {
            const conv = conversations.find((c) => c.id === state.currentConversationId);
            if (conv) {
              void import('./db/stores').then(async (stores) => {
                await stores.updateConversation(conv.id, { characterBId: id });
                const character = await stores.getCharacterById(id);
                if (character?.mvuEnabled) await stores.patchGlobalState(conv.id, { mvuEnabled: true });
                await loadConversations();
              });
            }
          }}
          onBranch={handleBranch}
          imageTaskToEdit={imageTaskToEdit}
          imageTaskRevision={imageTaskRevision}
          onImageTaskOpened={() => setImageTaskToEdit(null)}
          onQueueImageTask={queueImageTask}
          onCancelImageTask={cancelImageTask}
        />
      );
    }

    if (state.activeView === 'statebook') {
      return (
        <StateBookPanel
          conversationId={state.currentConversationId}
          conversationTitle={currentConv?.title || '未选择'}
          models={models}
          onScribeConfigChange={() => {}}
          onNodesRefresh={(id) => loadNodes(id)}
        />
      );
    }

    if (state.activeView === 'characters' && !state.isMobile) {
      return (
        <div className="flex-1 overflow-y-auto">
          <GitHubCharacterStore onImportCard={importRepositoryCharacterCard} />
        </div>
      );
    }

    if (state.activeView === 'settings') {
      if (settingsPage === 'stickers') {
        return (
          <div className="flex-1 overflow-y-auto p-4">
            <StickerSettingsPanel onBack={() => setSettingsPage('main')} />
          </div>
        );
      }
      if (settingsPage === 'images') {
        return <div className="flex-1 overflow-y-auto p-4"><ImageSettingsPanel onBack={() => setSettingsPage('main')} /></div>;
      }
      if (settingsPage === 'sync') {
        return (
          <div className="flex-1 overflow-y-auto p-4">
            <SyncCenterPanel
              initialTab={syncInitialTab}
              initialAction={syncInitialAction}
              onInitialActionHandled={() => setSyncInitialAction(null)}
              onBack={() => setSettingsPage('main')}
            />
          </div>
        );
      }
      return (
        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          <div className="w-full max-w-6xl mx-auto">
          <div className="mb-3 text-center leading-relaxed">
            <h3 className="break-all px-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              请阅读<a href="#usage-agreement" className="text-amber-700 dark:text-amber-300 underline underline-offset-2">📜 使用声明与免责协议</a>后方可使用
              <br />
              所有对话均由AI生成，纯属虚拟扮演，请勿沉迷，仅供学习AI技术。
            </h3>
          </div>
          <ModelManager />
          <div className="mt-4"><ModelPing /></div>
          <div className="mt-4"><CostPresetPanel /></div>
          <div className="mt-4"><SettingsPanel onOpenStickerSettings={() => setSettingsPage('stickers')} onOpenImageSettings={() => setSettingsPage('images')} onOpenSyncCenter={(tab = 'sync', action: 'upload' | 'download' | null = null) => { setSyncInitialTab(tab); setSyncInitialAction(action); setSettingsPage('sync'); }} /></div>
          </div>
        </div>
      );
    }

    // 移动端：世界书/角色管理直接在主区域全屏显示
    if (state.isMobile) {
      if (state.activeView === 'worldbook') {
        return (
          <div className="flex-1 overflow-y-auto">
            <WorldBookManager />
          </div>
        );
      }
      if (state.activeView === 'characters') {
        return (
          <div className="flex-1 overflow-y-auto space-y-4 p-4">
            <CharacterManager onRepositoryImporterReady={registerCharacterCardImporter} />
            <GitHubCharacterStore onImportCard={importRepositoryCharacterCard} />
          </div>
        );
      }
    }

    return (
      <div className="flex-1 flex items-center justify-center text-slate-600">
        <p>请在侧边栏选择功能</p>
      </div>
    );
  };

  const openImageTask = useCallback((task: ImageGenerationTask) => {
    setCurrentConversation(task.conversationId);
    dispatch({ type: 'SET_CONVERSATION', id: task.conversationId });
    dispatch({ type: 'SET_VIEW', view: 'conversations' });
    setImageTaskToEdit(task);
  }, [dispatch, setCurrentConversation]);

  const layoutProps = {
    activeView: state.activeView,
    onViewChange: handleViewChange,
    onOpenSettings: () => {
      setSettingsPage('main');
      dispatch({ type: 'SET_VIEW', view: 'settings' });
      setShowSettings(true);
    },
    imageTasks,
    onOpenImageTask: openImageTask,
    onCancelImageTask: cancelImageTask,
    sidebarChildren: renderSidebarContent(),
    mainChildren: renderMainContent(),
  };

  // 壁纸背景层样式 — contain 模式：完整显示图片，按比例自适应横竖屏
  const overlayColor = state.wallpaper.overlayMode === 'light'
    ? `rgba(255, 255, 255, ${state.wallpaper.overlayOpacity})`
    : `rgba(15, 23, 42, ${state.wallpaper.overlayOpacity})`;
  // 底色与遮罩同色，让 contain 模式下的留白区域自然过渡
  const baseColor = state.wallpaper.overlayMode === 'light' ? '#ffffff' : '#0f172a';

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ backgroundColor: state.wallpaper.image ? baseColor : undefined }}
    >
      {/* 壁纸层 — contain 模式，完整显示，按比例自适应 */}
      {state.wallpaper.image && (
        <img
          src={state.wallpaper.image}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
      )}
      {/* 遮罩层 */}
      {state.wallpaper.image && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: overlayColor }}
        />
      )}
      {/* 内容层 */}
      <div className="relative h-full w-full">
        {oauthNotice && (
          <div role="alert" className="absolute left-1/2 top-3 z-50 w-[min(92vw,42rem)] -translate-x-1/2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800 shadow-lg dark:border-red-800 dark:bg-red-950/90 dark:text-red-100">
            {oauthNotice}
          </div>
        )}
        {state.isMobile ? (
          <MobileLayout {...layoutProps} />
        ) : (
          <MainLayout {...layoutProps} />
        )}
      </div>
    </div>
  );
}

/* ──────────────── Root App ──────────────── */

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
