import { useCallback } from 'react';
import type { MessageNode, WorldBookEntry } from '../types';
import * as Stores from '../db/stores';

/**
 * 转义正则元字符，使任意用户输入字符串作为"普通字面量"参与 RegExp 匹配，
 * 仍能借 RegExp 大小写无关能力执行 includes 的不区分大小写版本，
 * 但不会把 `(a+)+b` 这类字符串误当成正则源码而触发 ReDoS 灾难性回溯。
 *
 * 仅转义字符类外、对回溯有放大的元字符；这里走 MDN 推荐的最小集。
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function useWorldBookScanner() {
  const scan = useCallback(
    async (
      worldBookId: string | undefined,
      recentMessages: MessageNode[],
      maxEntries: number
    ): Promise<WorldBookEntry[]> => {
      if (!worldBookId) return [];
      try {
        const wb = await Stores.getWorldBookById(worldBookId);
        if (!wb || !wb.entries.length) return [];

        const scanPool = recentMessages.map((m) => m.content).join(' ');
        const scanPoolLower = scanPool.toLowerCase();
        const matched: WorldBookEntry[] = [];

        for (const entry of wb.entries) {
          for (const key of entry.keys) {
            if (!key) continue;
            // 1) 快速路径：直接字面量包含（大小写无关），覆盖绝大多数场景，
            //    不实例化 RegExp，杜绝 ReDoS 风险。
            if (scanPoolLower.includes(key.toLowerCase())) {
              matched.push(entry);
              break;
            }
            // 2) 进入正则匹配时，关键词先经 escapeRegExp 转义，确保只能按字面量
            //    匹配，而非被当成正则源码执行（避免 (a+)+b 类灾难性回溯冻结 UI）。
            try {
              const re = new RegExp(escapeRegExp(key), 'i');
              if (re.test(scanPool)) {
                matched.push(entry);
                break;
              }
            } catch {
              /* skip malformed key (e.g. surrogate pair edge cases) */
            }
          }
        }

        matched.sort((a, b) => b.priority - a.priority);
        return matched.slice(0, maxEntries);
      } catch (e) {
        console.error('worldbook scan failed:', e);
        return [];
      }
    },
    []
  );

  return { scan };
}
