// @ts-ignore
import {
  applyUpdate,
  diffUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  UndoManager,
} from 'yjs';

import type {
  IndexedDBProvider,
  WorkspaceMilestone} from './shared';
import {
  createFdpStoragePersistence
} from './shared';
import { DEFAULT_DB_NAME } from './shared';

const indexeddbOrigin = Symbol('indexeddb-provider-origin');
const snapshotOrigin = Symbol('snapshot-origin');

/**
 * @internal
 */
const saveAlert = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  return (event.returnValue =
    'Data is not saved. Are you sure you want to leave?');
};

export const writeOperation = async (op: Promise<unknown>) => {
  window.addEventListener('beforeunload', saveAlert, {
    capture: true,
  });
  await op;
  window.removeEventListener('beforeunload', saveAlert, {
    capture: true,
  });
};

export function revertUpdate(
  doc: Doc,
  snapshotUpdate: Uint8Array,
  getMetadata: (key: string) => 'Text' | 'Map' | 'Array'
) {
  const snapshotDoc = new Doc();
  applyUpdate(snapshotDoc, snapshotUpdate, snapshotOrigin);

  const currentStateVector = encodeStateVector(doc);
  const snapshotStateVector = encodeStateVector(snapshotDoc);

  const changesSinceSnapshotUpdate = encodeStateAsUpdate(
    doc,
    snapshotStateVector
  );
  const undoManager = new UndoManager(
    [...snapshotDoc.share.keys()].map(key => {
      const type = getMetadata(key);
      if (type === 'Text') {
        return snapshotDoc.getText(key);
      } else if (type === 'Map') {
        return snapshotDoc.getMap(key);
      } else if (type === 'Array') {
        return snapshotDoc.getArray(key);
      }
      throw new Error('Unknown type');
    }),
    {
      trackedOrigins: new Set([snapshotOrigin]),
    }
  );
  applyUpdate(snapshotDoc, changesSinceSnapshotUpdate, snapshotOrigin);
  undoManager.undo();
  const revertChangesSinceSnapshotUpdate = encodeStateAsUpdate(
    snapshotDoc,
    currentStateVector
  );
  applyUpdate(doc, revertChangesSinceSnapshotUpdate, snapshotOrigin);
}

export class EarlyDisconnectError extends Error {
  constructor() {
    super('Early disconnect');
  }
}

export class CleanupWhenConnectingError extends Error {
  constructor() {
    super('Cleanup when connecting');
  }
}

export const markMilestone = async (
  id: string,
  doc: Doc,
  name: string,
  dbName = DEFAULT_DB_NAME
): Promise<void> => {
  const storeProvider = createFdpStoragePersistence(`${dbName}/${id}`);
  const milestone = await storeProvider.read();
  const binary = encodeStateAsUpdate(doc);
  if (!milestone) {
    await storeProvider.store(binary);
  } else {
    await storeProvider.put(milestone);
  }
};

export const getMilestones = async (
  id: string,
  dbName: string = DEFAULT_DB_NAME
): Promise<null | WorkspaceMilestone['milestone']> => {
  const storeProvider = createFdpStoragePersistence(`${dbName}/${id}`);
  const milestone = await storeProvider.read();
  if (!milestone) {
    return null;
  }
  return milestone;
};

export const createIndexedDBProvider = (
  id: string,
  doc: Doc,
  dbName: string = DEFAULT_DB_NAME
): IndexedDBProvider => {
  let resolve: () => void;
  let reject: (reason?: unknown) => void;
  let early = true;
  let connected = false;

  const storeProvider = createFdpStoragePersistence(`${dbName}/${id}`);

  async function handleUpdate(update: Uint8Array, origin: unknown) {
    if (!connected) {
      return;
    }
    if (origin === indexeddbOrigin) {
      return;
    }

    let data = await storeProvider.read();
    if (!data) {
      data = {};
    }

    await writeOperation(storeProvider.store(data));
  }

  const handleDestroy = async () => {
    connected = true;
  };
  const apis = {
    connect: async () => {
      if (connected) return;

      apis.whenSynced = new Promise<void>((_resolve, _reject) => {
        early = true;
        resolve = _resolve;
        reject = _reject;
      });
      connected = true;
      doc.on('update', handleUpdate);
      doc.on('destroy', handleDestroy);
      const storeProvider = createFdpStoragePersistence(
        `${dbName}/${id}/workspace`
      );
      const data = await storeProvider.read();
      if (!connected) {
        return;
      }
      if (!data) {
        await writeOperation(storeProvider.store(encodeStateAsUpdate(doc)));
      } else {
        const updates = [data];
        const fakeDoc = new Doc();
        fakeDoc.transact(() => {
          updates.forEach((update: Uint8Array) => {
            applyUpdate(fakeDoc, update);
          });
        }, indexeddbOrigin);
        const newUpdate = diffUpdate(
          encodeStateAsUpdate(doc),
          encodeStateAsUpdate(fakeDoc)
        );
        await writeOperation(storeProvider.store(newUpdate));
        doc.transact(() => {
          updates.forEach((update: Uint8Array) => {
            applyUpdate(doc, update);
          });
        }, indexeddbOrigin);
      }
      early = false;
      resolve();
    },
    disconnect() {
      connected = false;
      if (early) {
        reject(new EarlyDisconnectError());
      }
      doc.off('update', handleUpdate);
      doc.off('destroy', handleDestroy);
    },
    async cleanup() {
      if (connected) {
        throw new CleanupWhenConnectingError();
      }
      // (await dbPromise).delete('workspace', id);
    },
    whenSynced: Promise.resolve(),
    get connected() {
      return connected;
    },
  };

  return apis;
};

export * from './shared';
export * from './utils';
