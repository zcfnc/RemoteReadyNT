const checklistKey = 'remoteReadyChecklist';
const offlinePackKey = 'remoteReadyOfflinePack';

export function loadChecklist(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(checklistKey) ?? '{}');
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
  } catch {
    return {};
  }
}

export function saveChecklist(value: Record<string, boolean>) {
  window.localStorage.setItem(checklistKey, JSON.stringify(value));
}

export function loadOfflinePackDate() {
  const value = window.localStorage.getItem(offlinePackKey);
  return value && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

export function saveOfflinePackDate(value: string) {
  window.localStorage.setItem(offlinePackKey, value);
}
