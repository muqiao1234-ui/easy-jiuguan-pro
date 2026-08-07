const AUTHOR_OUTFIT_STORAGE_KEY = 'easyjiuguanpro:easter-egg:author-outfit-a';
const AUTHOR_OUTFIT_EVENT = 'easyjiuguanpro:author-outfit-change';
const AUTHOR_ANSWER = '橙橙乔乔';

function normalizeAnswer(value: string): string {
  return value.normalize('NFKC').trim();
}

export function isAuthorOutfitUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(AUTHOR_OUTFIT_STORAGE_KEY) === 'unlocked';
  } catch {
    return false;
  }
}

export function tryUnlockAuthorOutfit(answer: string): boolean {
  if (normalizeAnswer(answer) !== AUTHOR_ANSWER) return false;
  try {
    window.localStorage.setItem(AUTHOR_OUTFIT_STORAGE_KEY, 'unlocked');
  } catch {
    // The visual still unlocks for the current page when storage is unavailable.
  }
  window.dispatchEvent(new Event(AUTHOR_OUTFIT_EVENT));
  return true;
}

export function subscribeAuthorOutfit(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(AUTHOR_OUTFIT_EVENT, listener);
  return () => window.removeEventListener(AUTHOR_OUTFIT_EVENT, listener);
}
