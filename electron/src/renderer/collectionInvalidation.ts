type CollectionInvalidationListener = () => void | Promise<void>;

const listeners = new Set<CollectionInvalidationListener>();

export function onCollectionInvalidation(listener: CollectionInvalidationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Refresh every active collection from its authoritative IPC endpoint. */
export async function invalidateCollections(): Promise<void> {
  await Promise.all([...listeners].map((listener) => Promise.resolve().then(listener)));
}
