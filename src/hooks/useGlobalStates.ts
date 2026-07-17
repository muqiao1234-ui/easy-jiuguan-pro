import { useState, useCallback } from 'react';
import * as Stores from '../db/stores';
import {
  DEFAULT_SCRIBE_TRIGGER_INTERVAL,
  SCRIBE_SYSTEM_PROMPT,
} from '../utils/constants';

/** 带默认值合并的完整书记员配置 */
export interface ScribeConfig {
  scribeContent: string;
  scribeEnabled: boolean;
  scribeInterval: number;
  scribeTriggerInterval: number;
  scribeSystemPrompt: string;
  scribeModelId: string | null;
  scribeCacheWorldBookEnabled: boolean;
}

const DEFAULT_CONFIG: ScribeConfig = {
  scribeContent: '',
  scribeEnabled: true,
  scribeInterval: 1,
  scribeTriggerInterval: DEFAULT_SCRIBE_TRIGGER_INTERVAL,
  scribeSystemPrompt: SCRIBE_SYSTEM_PROMPT,
  scribeModelId: null,
  scribeCacheWorldBookEnabled: false,
};

export function useGlobalStates() {
  const [scribeContent, setScribeContent] = useState('');
  const [scribeConfig, setScribeConfig] = useState<ScribeConfig>(DEFAULT_CONFIG);

  const loadScribeContent = useCallback(async (conversationId: string) => {
    try {
      const state = await Stores.getGlobalStateByConversation(conversationId);
      const content = state?.scribeContent || '';
      setScribeContent(content);
      setScribeConfig({
        scribeContent: content,
        scribeEnabled: state?.scribeEnabled ?? DEFAULT_CONFIG.scribeEnabled,
        scribeInterval: state?.scribeInterval ?? DEFAULT_CONFIG.scribeInterval,
        scribeTriggerInterval: state?.scribeTriggerInterval ?? DEFAULT_CONFIG.scribeTriggerInterval,
        scribeSystemPrompt: state?.scribeSystemPrompt ?? DEFAULT_CONFIG.scribeSystemPrompt,
        scribeModelId: state?.scribeModelId ?? DEFAULT_CONFIG.scribeModelId,
        scribeCacheWorldBookEnabled: state?.scribeCacheWorldBookEnabled ?? DEFAULT_CONFIG.scribeCacheWorldBookEnabled,
      });
    } catch (e) {
      console.error('loadScribeContent failed:', e);
    }
  }, []);

  const updateScribeContent = useCallback(
    async (conversationId: string, content: string) => {
      try {
        await Stores.patchGlobalState(conversationId, { scribeContent: content });
        setScribeContent(content);
        setScribeConfig((prev) => ({ ...prev, scribeContent: content }));
      } catch (e) {
        console.error('updateScribeContent failed:', e);
      }
    },
    []
  );

  /** 更新当前对话的书记员配置（部分更新，原子写入 DB） */
  const updateScribeConfig = useCallback(
    async (conversationId: string, partial: Partial<ScribeConfig>) => {
      try {
        await Stores.patchGlobalState(conversationId, partial);
        setScribeConfig((prev) => ({ ...prev, ...partial }));
        if (partial.scribeContent !== undefined) setScribeContent(partial.scribeContent);
      } catch (e) {
        console.error('updateScribeConfig failed:', e);
      }
    },
    []
  );

  return {
    scribeContent,
    scribeConfig,
    loadScribeContent,
    updateScribeContent,
    updateScribeConfig,
  };
}
