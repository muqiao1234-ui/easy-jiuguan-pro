import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { ImageGenerationTask, ImageGenerationTaskDraft, MessageNode } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';
import {
  ImageGenerationRequestError,
  isRetryableImageError,
  requestOpenAiImage,
} from '../utils/imageGeneration';

const RETRY_DELAYS_MS = [2_000, 6_000, 15_000];
const MAX_RETRIES = RETRY_DELAYS_MS.length;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '生图任务失败，请检查渠道配置后重试。';
}

function retryDelay(error: unknown, retryNumber: number): number {
  const base = RETRY_DELAYS_MS[Math.min(retryNumber - 1, RETRY_DELAYS_MS.length - 1)];
  const jittered = Math.round(base * (0.85 + Math.random() * 0.3));
  const retryAfter = error instanceof ImageGenerationRequestError ? error.retryAfterMs : undefined;
  return Math.max(jittered, retryAfter || 0);
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const onAbort = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new DOMException('任务已取消', 'AbortError'));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isCurrentRunner(
  runners: MutableRefObject<Map<string, AbortController>>,
  taskId: string,
  controller: AbortController,
): boolean {
  return runners.current.get(taskId) === controller;
}

async function insertGeneratedImage(task: ImageGenerationTask, blob: Blob, mimeType: string): Promise<void> {
  if (task.replaceImageNodeId) {
    const existing = await Stores.getMessageNodeById(task.replaceImageNodeId);
    if (!existing || existing.conversationId !== task.conversationId || existing.role !== 'image') {
      throw new Error('原图片气泡已被删除，无法替换重新生成的图片。');
    }
    await Stores.updateMessageNode(existing.id, {
      content: '',
      imageData: { blob, mimeType, generation: task.generation },
    });
    return;
  }
  const nodes = await Stores.getMessageNodesByConversation(task.conversationId);
  const anchor = nodes.find((node) => node.id === task.anchorMessageId);
  if (!anchor) throw new Error('原始对话气泡已被删除，无法插入生成图片。');
  const following = nodes
    .filter((node) => node.timestamp > anchor.timestamp)
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  const nextTimestamp = following[0]?.timestamp;
  const timestamp = nextTimestamp && nextTimestamp > anchor.timestamp
    ? anchor.timestamp + (nextTimestamp - anchor.timestamp) / 2
    : anchor.timestamp + 0.001;
  const imageNode: MessageNode = {
    id: generateId(),
    conversationId: task.conversationId,
    role: 'image',
    senderName: '智能生图',
    content: '',
    isArchived: false,
    timestamp,
    imageData: { blob, mimeType, generation: task.generation },
  };
  await Stores.addMessageNode(imageNode);
}

export function useImageGenerationTasks(onImageReady: (conversationId: string) => void) {
  const [tasks, setTasks] = useState<ImageGenerationTask[]>([]);
  const runnersRef = useRef(new Map<string, AbortController>());
  const onImageReadyRef = useRef(onImageReady);
  onImageReadyRef.current = onImageReady;

  const reload = useCallback(async () => {
    const stored = await Stores.getAllImageGenerationTasks();
    setTasks(stored);
    return stored;
  }, []);

  const patchTask = useCallback(async (id: string, updates: Partial<ImageGenerationTask>) => {
    await Stores.updateImageGenerationTask(id, updates);
    return reload();
  }, [reload]);

  const runTask = useCallback(async (seedTask: ImageGenerationTask) => {
    const existing = runnersRef.current.get(seedTask.id);
    if (existing) existing.abort();
    const controller = new AbortController();
    runnersRef.current.set(seedTask.id, controller);
    let retryCount = seedTask.attempt;

    try {
      while (retryCount <= seedTask.maxRetries && isCurrentRunner(runnersRef, seedTask.id, controller)) {
        await patchTask(seedTask.id, {
          status: 'generating',
          attempt: retryCount,
          nextRetryAt: undefined,
          error: undefined,
        });
        try {
          const channels = await Stores.getAllImageChannels();
          const channel = channels.find((item) => item.id === seedTask.generation.channelId);
          if (!channel) throw new Error('原生图渠道已被删除，请重新选择渠道。');
          const result = await requestOpenAiImage({
            channel,
            positive: seedTask.generation.positivePrompt,
            negative: seedTask.generation.negativePrompt,
            size: seedTask.generation.size,
            signal: controller.signal,
            onPhase: (phase) => {
              if (isCurrentRunner(runnersRef, seedTask.id, controller)) {
                void patchTask(seedTask.id, { status: phase });
              }
            },
          });
          if (!isCurrentRunner(runnersRef, seedTask.id, controller)) return;
          await insertGeneratedImage(seedTask, result.blob, result.mimeType);
          if (!isCurrentRunner(runnersRef, seedTask.id, controller)) return;
          await Stores.deleteImageGenerationTask(seedTask.id);
          setTasks((current) => current.filter((task) => task.id !== seedTask.id));
          onImageReadyRef.current(seedTask.conversationId);
          return;
        } catch (error) {
          if (!isCurrentRunner(runnersRef, seedTask.id, controller) || controller.signal.aborted) return;
          if (isRetryableImageError(error) && retryCount < seedTask.maxRetries) {
            retryCount += 1;
            const delayMs = retryDelay(error, retryCount);
            await patchTask(seedTask.id, {
              status: 'retry_wait',
              attempt: retryCount,
              nextRetryAt: Date.now() + delayMs,
              error: `${errorMessage(error)} 将在 ${Math.ceil(delayMs / 1000)} 秒后重试（${retryCount}/${seedTask.maxRetries}）。`,
            });
            try {
              await waitForRetry(delayMs, controller.signal);
            } catch {
              return;
            }
            continue;
          }
          await patchTask(seedTask.id, {
            status: 'failed',
            attempt: retryCount,
            nextRetryAt: undefined,
            error: errorMessage(error),
          });
          return;
        }
      }
    } finally {
      if (isCurrentRunner(runnersRef, seedTask.id, controller)) runnersRef.current.delete(seedTask.id);
    }
  }, [patchTask]);

  const queueTask = useCallback(async (draft: ImageGenerationTaskDraft, existingTaskId?: string) => {
    const now = Date.now();
    let task: ImageGenerationTask;
    if (existingTaskId) {
      runnersRef.current.get(existingTaskId)?.abort();
      const existingTasks = await Stores.getAllImageGenerationTasks();
      const existing = existingTasks.find((item) => item.id === existingTaskId);
      task = {
        id: existingTaskId,
        ...draft,
        status: 'queued',
        attempt: 0,
        maxRetries: existing?.maxRetries ?? MAX_RETRIES,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await Stores.updateImageGenerationTask(existingTaskId, task);
    } else {
      task = {
        id: generateId(),
        ...draft,
        status: 'queued',
        attempt: 0,
        maxRetries: MAX_RETRIES,
        createdAt: now,
        updatedAt: now,
      };
      await Stores.addImageGenerationTask(task);
    }
    await reload();
    void runTask(task);
    return task;
  }, [reload, runTask]);

  const cancelTask = useCallback(async (taskId: string) => {
    runnersRef.current.get(taskId)?.abort();
    runnersRef.current.delete(taskId);
    await Stores.deleteImageGenerationTask(taskId);
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, []);

  useEffect(() => {
    void (async () => {
      const stored = await Stores.getAllImageGenerationTasks();
      const interrupted = stored.filter((task) => task.status !== 'failed');
      if (interrupted.length) {
        await Promise.all(interrupted.map((task) => Stores.updateImageGenerationTask(task.id, {
          status: 'failed',
          nextRetryAt: undefined,
          error: '页面刷新后后台请求已停止。请打开任务检查提示词后重新生成。',
        })));
      }
      await reload();
    })();
    return () => {
      runnersRef.current.forEach((controller) => controller.abort());
      runnersRef.current.clear();
    };
  }, [reload]);

  return { tasks, queueTask, cancelTask, reloadTasks: reload };
}