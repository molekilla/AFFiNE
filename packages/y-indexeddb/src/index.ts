import {
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  mergeUpdates,
  UndoManager,
} from 'yjs';

import type { WorkspaceMilestone } from './shared';
import { createFdpStoragePersistenceMock } from './shared';
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
  const store = createFdpStoragePersistenceMock(`${dbName}/milestone/${id}`);
  let milestone: WorkspaceMilestone | undefined;
  try {
    milestone = await store.read();
  } catch (e) {}
  const binary = encodeStateAsUpdate(doc);
  console.log('binary', binary);
  if (!milestone) {
    await store.storeWithSchema((update: string) => {
      return {
        milestone: {
          [name]: update,
        },
      };
    }, binary);
  } else {
    await store.storeWithSchema((update: string) => {
      // @ts-ignore
      milestone.milestone[name] = update;

      return milestone;
    }, binary);
  }
};

export const getMilestones = async (
  id: string,
  dbName: string = DEFAULT_DB_NAME
): Promise<null | WorkspaceMilestone['milestone']> => {
  const store = createFdpStoragePersistenceMock(`${dbName}/milestone/${id}`);
  let milestone;
  try {
    milestone = await store.read();
    console.log('milestone', milestone);
  } catch (e) {}
  if (!milestone) {
    return null;
  }

  return milestone.milestone;
};

export const createIndexedDBProvider = (
  id: string,
  doc: Doc,
  dbName: string = DEFAULT_DB_NAME
) => {
  let resolve: () => void;
  let reject: (reason?: unknown) => void;
  let early = true;
  let connected = false;
  const store = createFdpStoragePersistenceMock(`${dbName}/workspace/${id}`);

  async function handleUpdate(update: Uint8Array, origin: unknown) {
    if (origin === indexeddbOrigin) {
      return;
    }

    // @ts-ignore
    let data;
    try {
      data = await store.read();
      data = store.fromHexToUint8Array(data);
      //      applyUpdate(doc, data, indexeddbOrigin);
      console.log('read', data);
    } catch (e) {}

    if (!data) {
      // applyUpdate(doc, update, indexeddbOrigin);
      await writeOperation(
        store.store(mergeUpdates([encodeStateAsUpdate(doc), update]))
      );
    } else {
      data = mergeUpdates([data, update]);
      console.log('write', data);

      await writeOperation(
        // @ts-ignore
        store.store(data)
      );
      // applyUpdate(doc, data, indexeddbOrigin);
    }
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

      let temp = await store.read();
      if (!temp) {
        temp = store.fromHexToUint8Array(temp);
        console.log('connect', temp);

        if (!connected) {
          return;
        }
        // await writeOperation(store.store(encodeStateAsUpdate(doc)));

        doc.transact(() => {
          applyUpdate(doc, temp);
        }, indexeddbOrigin);
        early = false;
      }
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
