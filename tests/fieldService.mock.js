export const fieldSyncState = { syncing: false, error: '' };
export const syncFieldNow = () => Promise.resolve();
export const subscribePendingFieldContainers = next => { queueMicrotask(() => next([])); return () => {}; };
