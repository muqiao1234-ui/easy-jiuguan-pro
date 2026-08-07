import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';
import type { AppState, AppAction } from '../types';
import {
  DEFAULT_DISTILLATION_CONFIG,
  DEFAULT_CONTEXT_CONFIG,
  DEFAULT_SCRIBE_TRIGGER_INTERVAL,
  DEFAULT_SCRIBE_ROUNDS,
  SCRIBE_SYSTEM_PROMPT,
  DEFAULT_TPL_USER_WRAPPER,
  DEFAULT_TPL_OTHER_CHAR_WRAPPER,
  DEFAULT_TPL_IDENTITY_ANCHOR,
  DEFAULT_TPL_WORLD_BOOK_PREFIX,
  DEFAULT_TPL_DISTILLED_PREFIX,
  DEFAULT_TPL_STATE_BOOK_PREFIX,
  DEFAULT_TPL_EAVESDROP_APPEND,
  DEFAULT_TPL_GALGAME_CHAR_INJECTION,
  DEFAULT_TPL_IMPLANT_MEMORY_PREFIX,
  DEFAULT_TPL_IMPLANT_SCRIBE_PREFIX,
  DEFAULT_TPL_DISTILLED_NODE_PREFIX,
  DEFAULT_TPL_CACHE_WORLD_BOOK_PROMPT,
  DEFAULT_TPL_REVERSE_ENGINEER,
  DEFAULT_TPL_STICKER_PROMPT,
  DEFAULT_TPL_MVU_PROMPT,
  DEFAULT_TPL_MVU_FALLBACK_PROMPT,
  LEGACY_DEFAULT_TPL_STICKER_PROMPT,
  LEGACY_DEFAULT_TPL_IMAGE_PROMPT,
  DEFAULT_STICKER_MAX_COUNT,
  DEFAULT_TPL_IMAGE_PROMPT,
  DEFAULT_TPL_COMFY_MAPPING_PROMPT,
} from '../utils/constants';
import { DEFAULT_MODULE_RPG_CONFIG, DEFAULT_MODULE_RPG_PROMPT } from '../utils/moduleRpg';
import { setLowRateMode } from '../utils/apiFetch';
import * as Stores from '../db/stores';

const initialState: AppState = {
  activeView: 'conversations',
  currentConversationId: null,
  currentCharAModelId: null,
  currentCharBModelId: null,
  currentDistillModelId: null,
  currentScribeModelId: null,
  isMobile: false,
  sidebarOpen: true,
  theme: 'dark',
  wallpaper: {
    image: '',
    overlayOpacity: 0.7,
    overlayMode: 'dark',
  },
  boldColorize: true,
  scribeEnabled: true,
  scribeCacheWorldBookEnabled: false,
  mvuEnabled: false,
  scribeInterval: 1,
  scribeTriggerInterval: DEFAULT_SCRIBE_TRIGGER_INTERVAL,
  scribeRounds: DEFAULT_SCRIBE_ROUNDS,
  scribeSystemPrompt: SCRIBE_SYSTEM_PROMPT,
  scribeMode: 'auto',
  scribeEngine: 'module',
  galgamePrompt: '',
  moduleRpgConfig: DEFAULT_MODULE_RPG_CONFIG,
  moduleRpgPrompt: DEFAULT_MODULE_RPG_PROMPT,
  mutualObservePrompt: '',
  thinkingEnabled: false,
  streamingEnabled: true,
  debugMode: false,
  lowRateMode: false,
  stickerEnabled: false,
  stickerMaxCount: DEFAULT_STICKER_MAX_COUNT,
  currentImageChannelId: null,
  currentImagePromptModelId: null,
  distillationConfig: { ...DEFAULT_DISTILLATION_CONFIG },
  contextConfig: { ...DEFAULT_CONTEXT_CONFIG },
  tplUserWrapper: DEFAULT_TPL_USER_WRAPPER,
  tplOtherCharWrapper: DEFAULT_TPL_OTHER_CHAR_WRAPPER,
  tplIdentityAnchor: DEFAULT_TPL_IDENTITY_ANCHOR,
  tplWorldBookPrefix: DEFAULT_TPL_WORLD_BOOK_PREFIX,
  tplDistilledPrefix: DEFAULT_TPL_DISTILLED_PREFIX,
  tplStateBookPrefix: DEFAULT_TPL_STATE_BOOK_PREFIX,
  tplEavesdropAppend: DEFAULT_TPL_EAVESDROP_APPEND,
  tplGalgameCharInjection: DEFAULT_TPL_GALGAME_CHAR_INJECTION,
  tplImplantMemoryPrefix: DEFAULT_TPL_IMPLANT_MEMORY_PREFIX,
  tplImplantScribePrefix: DEFAULT_TPL_IMPLANT_SCRIBE_PREFIX,
  tplDistilledNodePrefix: DEFAULT_TPL_DISTILLED_NODE_PREFIX,
  tplCacheWorldBookPrompt: DEFAULT_TPL_CACHE_WORLD_BOOK_PROMPT,
  tplReverseEngineer: DEFAULT_TPL_REVERSE_ENGINEER,
  tplStickerPrompt: DEFAULT_TPL_STICKER_PROMPT,
  tplMvuPrompt: DEFAULT_TPL_MVU_PROMPT,
  tplMvuFallbackPrompt: DEFAULT_TPL_MVU_FALLBACK_PROMPT,
  tplImagePrompt: DEFAULT_TPL_IMAGE_PROMPT,
  tplComfyMappingPrompt: DEFAULT_TPL_COMFY_MAPPING_PROMPT,
};

const advancedTemplateDefaults: Record<string, string> = {
  tplUserWrapper: DEFAULT_TPL_USER_WRAPPER,
  tplOtherCharWrapper: DEFAULT_TPL_OTHER_CHAR_WRAPPER,
  tplIdentityAnchor: DEFAULT_TPL_IDENTITY_ANCHOR,
  tplWorldBookPrefix: DEFAULT_TPL_WORLD_BOOK_PREFIX,
  tplDistilledPrefix: DEFAULT_TPL_DISTILLED_PREFIX,
  tplStateBookPrefix: DEFAULT_TPL_STATE_BOOK_PREFIX,
  tplEavesdropAppend: DEFAULT_TPL_EAVESDROP_APPEND,
  tplGalgameCharInjection: DEFAULT_TPL_GALGAME_CHAR_INJECTION,
  tplImplantMemoryPrefix: DEFAULT_TPL_IMPLANT_MEMORY_PREFIX,
  tplImplantScribePrefix: DEFAULT_TPL_IMPLANT_SCRIBE_PREFIX,
  tplDistilledNodePrefix: DEFAULT_TPL_DISTILLED_NODE_PREFIX,
  tplCacheWorldBookPrompt: DEFAULT_TPL_CACHE_WORLD_BOOK_PROMPT,
  tplReverseEngineer: DEFAULT_TPL_REVERSE_ENGINEER,
  tplStickerPrompt: DEFAULT_TPL_STICKER_PROMPT,
  tplMvuPrompt: DEFAULT_TPL_MVU_PROMPT,
  tplMvuFallbackPrompt: DEFAULT_TPL_MVU_FALLBACK_PROMPT,
  tplImagePrompt: DEFAULT_TPL_IMAGE_PROMPT,
  tplComfyMappingPrompt: DEFAULT_TPL_COMFY_MAPPING_PROMPT,
};

function isLegacyDefaultImagePrompt(value: unknown): value is string {
  return value === LEGACY_DEFAULT_TPL_IMAGE_PROMPT;
}

function isLegacyDefaultMvuPrompt(value: unknown): value is string {
  if (typeof value !== 'string' || value.includes('{protocol}')) return false;
  return value.includes('{state}')
    && value.includes('{schema}')
    && value.includes('{rules}')
    && value.includes('<UpdateVariable>')
    && value.includes("_.set('路径'")
    && value.includes('若没有可靠的状态变化');
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_VIEW':
      return {
        ...state,
        activeView: action.view,
        sidebarOpen: state.isMobile ? false : state.sidebarOpen,
      };
    case 'SET_CONVERSATION':
      return {
        ...state,
        currentConversationId: action.id,
        activeView: 'conversations',
        sidebarOpen: state.isMobile ? false : state.sidebarOpen,
      };
    case 'SET_CURRENT_CONVERSATION':
      return {
        ...state,
        currentConversationId: action.id,
        sidebarOpen: state.isMobile ? false : state.sidebarOpen,
      };
    case 'SET_CHAR_A_MODEL':
      return { ...state, currentCharAModelId: action.id };
    case 'SET_CHAR_B_MODEL':
      return { ...state, currentCharBModelId: action.id };
    case 'SET_DISTILL_MODEL':
      return { ...state, currentDistillModelId: action.id };
    case 'SET_IMAGE_PROMPT_MODEL':
      return { ...state, currentImagePromptModelId: action.id };
    case 'SET_SCRIBE_MODEL':
      return { ...state, currentScribeModelId: action.id };
    case 'SET_MOBILE':
      return {
        ...state,
        isMobile: action.isMobile,
        sidebarOpen: action.isMobile ? false : true,
      };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'SET_THEME':
      return { ...state, theme: action.theme };
    case 'SET_WALLPAPER':
      return { ...state, wallpaper: { ...state.wallpaper, ...action.config } };
    case 'SET_BOLD_COLORIZE':
      return { ...state, boldColorize: action.enabled };
    case 'SET_SCRIBE_ENABLED':
      return { ...state, scribeEnabled: action.enabled };
    case 'SET_SCRIBE_CACHE_WORLDBOOK_ENABLED':
      return { ...state, scribeCacheWorldBookEnabled: action.enabled };
    case 'SET_SCRIBE_INTERVAL':
      return { ...state, scribeInterval: action.interval };
    case 'SET_SCRIBE_TRIGGER_INTERVAL':
      return { ...state, scribeTriggerInterval: action.interval };
    case 'SET_SCRIBE_ROUNDS':
      return { ...state, scribeRounds: action.rounds };
    case 'SET_SCRIBE_SYSTEM_PROMPT':
      return { ...state, scribeSystemPrompt: action.prompt };
    case 'SET_SCRIBE_MODE':
      return { ...state, scribeMode: action.mode };
    case 'SET_SCRIBE_ENGINE':
      return { ...state, scribeEngine: action.engine };
    case 'SET_GALGAME_PROMPT':
      return { ...state, galgamePrompt: action.prompt };
    case 'SET_MODULE_RPG_CONFIG':
      return { ...state, moduleRpgConfig: action.config };
    case 'SET_MODULE_RPG_PROMPT':
      return { ...state, moduleRpgPrompt: action.prompt };
    case 'SET_MUTUAL_OBSERVE_PROMPT':
      return { ...state, mutualObservePrompt: action.prompt };
    case 'TOGGLE_THINKING':
      return { ...state, thinkingEnabled: !state.thinkingEnabled };
    case 'TOGGLE_STREAMING':
      return { ...state, streamingEnabled: !state.streamingEnabled };
    case 'TOGGLE_DEBUG':
      return { ...state, debugMode: !state.debugMode };
    case 'SET_LOW_RATE_MODE':
      return { ...state, lowRateMode: action.enabled };
    case 'SET_STICKER_ENABLED':
      return { ...state, stickerEnabled: action.enabled };
    case 'SET_STICKER_MAX_COUNT':
      return { ...state, stickerMaxCount: Math.max(1, Math.floor(action.count) || DEFAULT_STICKER_MAX_COUNT) };
    case 'SET_IMAGE_CHANNEL':
      return { ...state, currentImageChannelId: action.id };
    case 'SET_MVU_ENABLED':
      return { ...state, mvuEnabled: action.enabled };
    case 'UPDATE_DISTILLATION_CONFIG':
      return {
        ...state,
        distillationConfig: { ...state.distillationConfig, ...action.config },
      };
    case 'UPDATE_CONTEXT_CONFIG':
      return {
        ...state,
        contextConfig: { ...state.contextConfig, ...action.config },
      };
    case 'SET_ADV_TPL': {
      const key = action.key as keyof AppState;
      return { ...state, [key]: action.value };
    }
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}>(null!);

/** 存储在 localForage 的 UI 设置 key */
const UI_SETTINGS_KEY = 'tavern_ui_settings';

interface PersistedUISettings {
  theme: AppState['theme'];
  wallpaper: AppState['wallpaper'];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // 移动端检测
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      dispatch({ type: 'SET_MOBILE', isMobile: e.matches });
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // 启动时从 IndexedDB 加载持久化的 UI 设置
  useEffect(() => {
    Stores.getUISettings().then((settings) => {
      if (settings) {
        if (settings.theme) dispatch({ type: 'SET_THEME', theme: settings.theme });
        if (settings.wallpaper) dispatch({ type: 'SET_WALLPAPER', config: settings.wallpaper });
        if (settings.boldColorize !== undefined) dispatch({ type: 'SET_BOLD_COLORIZE', enabled: settings.boldColorize });
        // Legacy records remain readable on their historical bubbles. New summaries
        // always use the unified module engine after an upgrade.
        if (settings.scribeEngine) dispatch({ type: 'SET_SCRIBE_ENGINE', engine: 'module' });
        if (settings.scribeMode) dispatch({ type: 'SET_SCRIBE_MODE', mode: settings.scribeMode });
        if (settings.galgamePrompt !== undefined) dispatch({ type: 'SET_GALGAME_PROMPT', prompt: settings.galgamePrompt });
        if (settings.moduleRpgConfig) dispatch({ type: 'SET_MODULE_RPG_CONFIG', config: settings.moduleRpgConfig });
        if (settings.moduleRpgPrompt !== undefined) dispatch({ type: 'SET_MODULE_RPG_PROMPT', prompt: settings.moduleRpgPrompt });
        if (settings.mutualObservePrompt !== undefined) dispatch({ type: 'SET_MUTUAL_OBSERVE_PROMPT', prompt: settings.mutualObservePrompt });
        if (settings.charAModelId !== undefined) dispatch({ type: 'SET_CHAR_A_MODEL', id: settings.charAModelId });
        if (settings.charBModelId !== undefined) dispatch({ type: 'SET_CHAR_B_MODEL', id: settings.charBModelId });
        // 高级提示词模板
        const advKeys = [
          'tplUserWrapper', 'tplOtherCharWrapper', 'tplIdentityAnchor',
          'tplWorldBookPrefix', 'tplDistilledPrefix', 'tplStateBookPrefix',
          'tplEavesdropAppend', 'tplGalgameCharInjection',
          'tplImplantMemoryPrefix', 'tplImplantScribePrefix', 'tplDistilledNodePrefix',
          'tplCacheWorldBookPrompt', 'tplReverseEngineer', 'tplStickerPrompt', 'tplMvuPrompt', 'tplMvuFallbackPrompt', 'tplImagePrompt', 'tplComfyMappingPrompt',
        ];
        for (const k of advKeys) {
          const savedValue = (settings as any)[k];
          // Older installations persisted empty strings and showed the defaults as grey placeholders.
          const value = k === 'tplStickerPrompt' && savedValue === LEGACY_DEFAULT_TPL_STICKER_PROMPT
            ? DEFAULT_TPL_STICKER_PROMPT
            : k === 'tplMvuPrompt' && isLegacyDefaultMvuPrompt(savedValue)
              ? DEFAULT_TPL_MVU_PROMPT
              : k === 'tplImagePrompt' && isLegacyDefaultImagePrompt(savedValue)
                ? DEFAULT_TPL_IMAGE_PROMPT
                : savedValue || advancedTemplateDefaults[k];
          dispatch({ type: 'SET_ADV_TPL', key: k, value });
        }
        if (settings.thinkingEnabled !== undefined) {
          // 直接设置而非 toggle
          if (settings.thinkingEnabled !== initialState.thinkingEnabled) {
            dispatch({ type: 'TOGGLE_THINKING' });
          }
        }
        if (settings.streamingEnabled !== undefined && settings.streamingEnabled !== initialState.streamingEnabled) {
          dispatch({ type: 'TOGGLE_STREAMING' });
        }
        if (settings.debugMode !== undefined) {
          if (settings.debugMode !== initialState.debugMode) {
            dispatch({ type: 'TOGGLE_DEBUG' });
          }
        }
        if (settings.scribeEnabled !== undefined) {
          dispatch({ type: 'SET_SCRIBE_ENABLED', enabled: settings.scribeEnabled });
        }
        if (settings.scribeCacheWorldBookEnabled !== undefined) {
          dispatch({ type: 'SET_SCRIBE_CACHE_WORLDBOOK_ENABLED', enabled: settings.scribeCacheWorldBookEnabled });
        }
        if (settings.mvuEnabled !== undefined) {
          dispatch({ type: 'SET_MVU_ENABLED', enabled: settings.mvuEnabled });
        }
        if (settings.scribeRounds !== undefined) {
          dispatch({ type: 'SET_SCRIBE_ROUNDS', rounds: settings.scribeRounds });
        }
        if (settings.lowRateMode !== undefined) {
          dispatch({ type: 'SET_LOW_RATE_MODE', enabled: settings.lowRateMode });
        }
        if (settings.stickerEnabled !== undefined) {
          dispatch({ type: 'SET_STICKER_ENABLED', enabled: settings.stickerEnabled });
        }
        if (settings.stickerMaxCount !== undefined) {
          dispatch({ type: 'SET_STICKER_MAX_COUNT', count: settings.stickerMaxCount });
        }
        if (settings.currentImageChannelId !== undefined) dispatch({ type: 'SET_IMAGE_CHANNEL', id: settings.currentImageChannelId });
        if (settings.currentImagePromptModelId !== undefined) dispatch({ type: 'SET_IMAGE_PROMPT_MODEL', id: settings.currentImagePromptModelId });
        if (settings.distillationConfig) {
          dispatch({ type: 'UPDATE_DISTILLATION_CONFIG', config: settings.distillationConfig });
        }
        if (settings.contextConfig) {
          const legacyContextConfig = settings.contextConfig as AppState['contextConfig'] & {
            maxDistilledNodes?: number;
          };
          dispatch({
            type: 'UPDATE_CONTEXT_CONFIG',
            config: {
              recentRounds: legacyContextConfig.recentRounds,
              worldBookScanDepth: legacyContextConfig.worldBookScanDepth,
              maxInjectedMemories:
                legacyContextConfig.maxInjectedMemories ?? legacyContextConfig.maxDistilledNodes,
              maxWorldBookEntries: legacyContextConfig.maxWorldBookEntries,
            },
          });
        }
      }
      setSettingsLoaded(true);
    }).catch(() => {
      setSettingsLoaded(true);
    });
  }, []);

  // 主题变化时持久化 + 应用到 document
  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.theme]);

  // 持久化所有 UI 设置到 IndexedDB
  useEffect(() => {
    if (!settingsLoaded) return;

    Stores.setUISettings({
      theme: state.theme,
      wallpaper: state.wallpaper,
      boldColorize: state.boldColorize,
      scribeEngine: state.scribeEngine,
      scribeMode: state.scribeMode,
      galgamePrompt: state.galgamePrompt,
      moduleRpgConfig: state.moduleRpgConfig,
      moduleRpgPrompt: state.moduleRpgPrompt,
      mutualObservePrompt: state.mutualObservePrompt,
      charAModelId: state.currentCharAModelId,
      charBModelId: state.currentCharBModelId,
      tplUserWrapper: state.tplUserWrapper,
      tplOtherCharWrapper: state.tplOtherCharWrapper,
      tplIdentityAnchor: state.tplIdentityAnchor,
      tplWorldBookPrefix: state.tplWorldBookPrefix,
      tplDistilledPrefix: state.tplDistilledPrefix,
      tplStateBookPrefix: state.tplStateBookPrefix,
      tplEavesdropAppend: state.tplEavesdropAppend,
      tplGalgameCharInjection: state.tplGalgameCharInjection,
      tplImplantMemoryPrefix: state.tplImplantMemoryPrefix,
      tplImplantScribePrefix: state.tplImplantScribePrefix,
      tplDistilledNodePrefix: state.tplDistilledNodePrefix,
      tplCacheWorldBookPrompt: state.tplCacheWorldBookPrompt,
      tplReverseEngineer: state.tplReverseEngineer,
      tplStickerPrompt: state.tplStickerPrompt,
      tplMvuPrompt: state.tplMvuPrompt,
      tplMvuFallbackPrompt: state.tplMvuFallbackPrompt,
      tplImagePrompt: state.tplImagePrompt,
      tplComfyMappingPrompt: state.tplComfyMappingPrompt,
      thinkingEnabled: state.thinkingEnabled,
      streamingEnabled: state.streamingEnabled,
      debugMode: state.debugMode,
      scribeEnabled: state.scribeEnabled,
      scribeCacheWorldBookEnabled: state.scribeCacheWorldBookEnabled,
      mvuEnabled: state.mvuEnabled,
      scribeRounds: state.scribeRounds,
      lowRateMode: state.lowRateMode,
      stickerEnabled: state.stickerEnabled,
      stickerMaxCount: state.stickerMaxCount,
      currentImageChannelId: state.currentImageChannelId,
      currentImagePromptModelId: state.currentImagePromptModelId,
      distillationConfig: state.distillationConfig,
      contextConfig: state.contextConfig,
    });
  }, [state.theme, state.wallpaper, state.boldColorize, state.scribeEngine, state.scribeMode, state.galgamePrompt, state.moduleRpgConfig, state.moduleRpgPrompt, state.mutualObservePrompt,
    state.currentCharAModelId, state.currentCharBModelId,
    state.tplUserWrapper, state.tplOtherCharWrapper, state.tplIdentityAnchor, state.tplWorldBookPrefix,
    state.tplDistilledPrefix, state.tplStateBookPrefix, state.tplEavesdropAppend, state.tplGalgameCharInjection,
    state.tplImplantMemoryPrefix, state.tplImplantScribePrefix, state.tplDistilledNodePrefix,
    state.tplCacheWorldBookPrompt, state.tplReverseEngineer, state.tplStickerPrompt, state.tplMvuPrompt, state.tplMvuFallbackPrompt, state.tplImagePrompt, state.tplComfyMappingPrompt,
    state.thinkingEnabled, state.streamingEnabled, state.debugMode, state.scribeEnabled, state.scribeCacheWorldBookEnabled, state.mvuEnabled, state.scribeRounds, state.lowRateMode,
    state.stickerEnabled, state.stickerMaxCount, state.currentImageChannelId, state.currentImagePromptModelId,
    state.distillationConfig, state.contextConfig,
    settingsLoaded]);

  // 低速率模式变化时同步到 apiFetch 模块
  useEffect(() => {
    setLowRateMode(state.lowRateMode);
  }, [state.lowRateMode]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
