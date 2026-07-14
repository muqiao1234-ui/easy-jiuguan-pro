import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { AppState, AppAction } from '../types';
import { DEFAULT_DISTILLATION_CONFIG, DEFAULT_CONTEXT_CONFIG, DEFAULT_SCRIBE_TRIGGER_INTERVAL, DEFAULT_SCRIBE_ROUNDS, SCRIBE_SYSTEM_PROMPT } from '../utils/constants';
import { setLowRateMode } from '../utils/apiFetch';
import * as Stores from '../db/stores';

const initialState: AppState = {
  activeView: 'conversations',
  currentConversationId: null,
  currentChatModelId: null,
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
  scribeInterval: 1,
  scribeTriggerInterval: DEFAULT_SCRIBE_TRIGGER_INTERVAL,
  scribeRounds: DEFAULT_SCRIBE_ROUNDS,
  scribeSystemPrompt: SCRIBE_SYSTEM_PROMPT,
  scribeMode: 'auto',
  scribeEngine: 'text',
  galgamePrompt: '',
  mutualObservePrompt: '',
  thinkingEnabled: false,
  debugMode: false,
  lowRateMode: false,
  distillationConfig: { ...DEFAULT_DISTILLATION_CONFIG },
  contextConfig: { ...DEFAULT_CONTEXT_CONFIG },
  tplUserWrapper: '',
  tplOtherCharWrapper: '',
  tplIdentityAnchor: '',
  tplWorldBookPrefix: '',
  tplDistilledPrefix: '',
  tplStateBookPrefix: '',
  tplEavesdropAppend: '',
  tplGalgameCharInjection: '',
  tplImplantMemoryPrefix: '',
  tplImplantScribePrefix: '',
  tplDistilledNodePrefix: '',
  tplReverseEngineer: '',
};

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
    case 'SET_CHAT_MODEL':
      return { ...state, currentChatModelId: action.id };
    case 'SET_DISTILL_MODEL':
      return { ...state, currentDistillModelId: action.id };
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
    case 'SET_MUTUAL_OBSERVE_PROMPT':
      return { ...state, mutualObservePrompt: action.prompt };
    case 'TOGGLE_THINKING':
      return { ...state, thinkingEnabled: !state.thinkingEnabled };
    case 'TOGGLE_DEBUG':
      return { ...state, debugMode: !state.debugMode };
    case 'SET_LOW_RATE_MODE':
      return { ...state, lowRateMode: action.enabled };
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
        if (settings.scribeEngine) dispatch({ type: 'SET_SCRIBE_ENGINE', engine: settings.scribeEngine });
        if (settings.scribeMode) dispatch({ type: 'SET_SCRIBE_MODE', mode: settings.scribeMode });
        if (settings.galgamePrompt !== undefined) dispatch({ type: 'SET_GALGAME_PROMPT', prompt: settings.galgamePrompt });
        if (settings.mutualObservePrompt !== undefined) dispatch({ type: 'SET_MUTUAL_OBSERVE_PROMPT', prompt: settings.mutualObservePrompt });
        // 高级提示词模板
        const advKeys = [
          'tplUserWrapper', 'tplOtherCharWrapper', 'tplIdentityAnchor',
          'tplWorldBookPrefix', 'tplDistilledPrefix', 'tplStateBookPrefix',
          'tplEavesdropAppend', 'tplGalgameCharInjection',
          'tplImplantMemoryPrefix', 'tplImplantScribePrefix', 'tplDistilledNodePrefix',
          'tplReverseEngineer',
        ];
        for (const k of advKeys) {
          if ((settings as any)[k] !== undefined) dispatch({ type: 'SET_ADV_TPL', key: k, value: (settings as any)[k] });
        }
        if (settings.thinkingEnabled !== undefined) {
          // 直接设置而非 toggle
          if (settings.thinkingEnabled !== initialState.thinkingEnabled) {
            dispatch({ type: 'TOGGLE_THINKING' });
          }
        }
        if (settings.debugMode !== undefined) {
          if (settings.debugMode !== initialState.debugMode) {
            dispatch({ type: 'TOGGLE_DEBUG' });
          }
        }
        if (settings.scribeEnabled !== undefined) {
          dispatch({ type: 'SET_SCRIBE_ENABLED', enabled: settings.scribeEnabled });
        }
        if (settings.scribeRounds !== undefined) {
          dispatch({ type: 'SET_SCRIBE_ROUNDS', rounds: settings.scribeRounds });
        }
        if (settings.lowRateMode !== undefined) {
          dispatch({ type: 'SET_LOW_RATE_MODE', enabled: settings.lowRateMode });
        }
      }
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
    Stores.setUISettings({
      theme: state.theme,
      wallpaper: state.wallpaper,
      boldColorize: state.boldColorize,
      scribeEngine: state.scribeEngine,
      scribeMode: state.scribeMode,
      galgamePrompt: state.galgamePrompt,
      mutualObservePrompt: state.mutualObservePrompt,
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
      tplReverseEngineer: state.tplReverseEngineer,
      thinkingEnabled: state.thinkingEnabled,
      debugMode: state.debugMode,
      scribeEnabled: state.scribeEnabled,
      scribeRounds: state.scribeRounds,
      lowRateMode: state.lowRateMode,
    });
  }, [state.theme, state.wallpaper, state.boldColorize, state.scribeEngine, state.scribeMode, state.galgamePrompt, state.mutualObservePrompt,
    state.tplUserWrapper, state.tplOtherCharWrapper, state.tplIdentityAnchor, state.tplWorldBookPrefix,
    state.tplDistilledPrefix, state.tplStateBookPrefix, state.tplEavesdropAppend, state.tplGalgameCharInjection,
    state.tplImplantMemoryPrefix, state.tplImplantScribePrefix, state.tplDistilledNodePrefix, state.tplReverseEngineer,
    state.thinkingEnabled, state.debugMode, state.scribeEnabled, state.scribeRounds, state.lowRateMode]);

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
