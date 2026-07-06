import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './hooks/useApp';
import { useModels } from './hooks/useModels';
import { useCharacters } from './hooks/useCharacters';
import { useConversations } from './hooks/useConversations';
import { useMessageNodes } from './hooks/useMessageNodes';
import { LOGO_BASE64 } from './utils/logoBase64';
import { seedPresets, PRESET_MODEL_ID } from './utils/presets';
import type { Character } from './types';
import MainLayout from './components/layout/MainLayout';
import MobileLayout from './components/layout/MobileLayout';
import ConversationList from './components/conversations/ConversationList';
import WorldBookManager from './components/worldbook/WorldBookManager';
import CharacterManager from './components/characters/CharacterManager';
import ModelManager from './components/models/ModelManager';
import ModelPing from './components/models/ModelPing';
import SettingsPanel from './components/settings/SettingsPanel';
import ChatArea from './components/chat/ChatArea';
import StateBookPanel from './components/chat/StateBookPanel';

/* ──────────────── Inner App (has access to AppContext) ──────────────── */

function AppInner() {
  const { state, dispatch } = useApp();
  const { models, loadModels } = useModels();
  const { characters, loadCharacters } = useCharacters();
  const { conversations, currentConversation, loadConversations, createConversation, deleteConversation, setCurrentConversation, addConversationDirect } = useConversations();
  const { loadNodes, cloneToNewConversation } = useMessageNodes();
  const [showSettings, setShowSettings] = useState(false);

  // Init data — 首次启动写入预设，随后加载所有数据
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    (async () => {
      await seedPresets();
      setSeeded(true);
    })();
  }, []);
  useEffect(() => {
    if (!seeded) return;
    loadModels();
    loadCharacters();
    loadConversations();
  }, [seeded]);

  // 当预设模型已注入但用户尚未选择任何模型时，自动选中预设模型
  useEffect(() => {
    if (!state.currentChatModelId && models.some((m) => m.id === PRESET_MODEL_ID)) {
      dispatch({ type: 'SET_CHAT_MODEL', id: PRESET_MODEL_ID });
    }
  }, [models, state.currentChatModelId]);

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

  // Resolve active view content for sidebar
  const renderSidebarContent = () => {
    switch (state.activeView) {
      case 'conversations':
        return (
          <ConversationList
            conversations={conversations}
            characters={characters}
            currentConversation={currentConversation}
            onCreateConversation={createConversation}
            onDeleteConversation={deleteConversation}
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
        return state.isMobile ? null : <CharacterManager />;
      case 'statebook':
        return (
          <ConversationList
            conversations={conversations}
            characters={characters}
            currentConversation={currentConversation}
            onCreateConversation={createConversation}
            onDeleteConversation={deleteConversation}
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
          onCharAChange={(id) => {
            const conv = conversations.find((c) => c.id === state.currentConversationId);
            if (conv) {
              import('./db/stores').then((s) =>
                s.updateConversation(conv.id, { characterAId: id }).then(() => loadConversations())
              );
            }
          }}
          onCharBChange={(id) => {
            const conv = conversations.find((c) => c.id === state.currentConversationId);
            if (conv) {
              import('./db/stores').then((s) =>
                s.updateConversation(conv.id, { characterBId: id }).then(() => loadConversations())
              );
            }
          }}
          onBranch={handleBranch}
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

    if (state.activeView === 'settings') {
      return (
        <div className="flex-1 overflow-y-auto p-4">
          <ModelManager />
          <div className="mt-4"><ModelPing /></div>
          <div className="mt-4"><SettingsPanel /></div>
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
          <div className="flex-1 overflow-y-auto">
            <CharacterManager />
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

  const layoutProps = {
    activeView: state.activeView,
    onViewChange: handleViewChange,
    onOpenSettings: () => {
      dispatch({ type: 'SET_VIEW', view: 'settings' });
      setShowSettings(true);
    },
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
