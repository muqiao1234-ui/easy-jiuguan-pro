import type { MessageRole } from '../types';

export interface DistillationCandidate {
  id: string;
  timestamp: number;
  role: MessageRole;
  isArchived: boolean;
}

export interface DistillationPlan {
  sourceIds: string[];
  selectedRounds: number;
  totalRounds: number;
  availableRounds: number;
  retainRecentRounds: number;
}

interface DistillationRound {
  nodes: DistillationCandidate[];
  hasAssistant: boolean;
}

function sortCandidates(candidates: DistillationCandidate[]): DistillationCandidate[] {
  return [...candidates].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

/** Builds complete user-led rounds without splitting a round at an arbitrary node count. */
export function planDistillation(
  candidates: DistillationCandidate[],
  triggerThreshold: number,
  retainRecentRounds: number
): DistillationPlan | null {
  const threshold = Math.max(1, Math.floor(triggerThreshold) || 1);
  const retain = Math.max(0, Math.floor(retainRecentRounds) || 0);
  const rounds: DistillationRound[] = [];
  let current: DistillationRound | null = null;

  for (const node of sortCandidates(candidates)) {
    if (node.isArchived || !['user', 'charA', 'charB'].includes(node.role)) continue;
    if (node.role === 'user') {
      current = { nodes: [node], hasAssistant: false };
      rounds.push(current);
    } else if (current) {
      current.nodes.push(node);
      current.hasAssistant = true;
    }
  }

  const completeRounds: DistillationRound[] = [];
  for (const round of rounds) {
    if (!round.hasAssistant) break;
    completeRounds.push(round);
  }
  const availableRounds = Math.max(0, completeRounds.length - retain);
  if (availableRounds < threshold) return null;

  const selected = completeRounds.slice(0, threshold);
  return {
    sourceIds: selected.flatMap((round) => round.nodes.map((node) => node.id)),
    selectedRounds: selected.length,
    totalRounds: completeRounds.length,
    availableRounds,
    retainRecentRounds: retain,
  };
}
