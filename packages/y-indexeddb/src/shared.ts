import { Utils } from '@ethersphere/bee-js';
import { Blossom } from '@fairdatasociety/blossom';
import type { DBSchema, IDBPDatabase } from 'idb/build/entry';
// @ts-ignore
import { FdpStoragePersistence } from 'y-fdp-storage';

export const dbVersion = 1;
export const DEFAULT_DB_NAME = 'affine-local';
export const DEFAULT_TOPIC = '/crdt/affine';
export function upgradeDB(db: IDBPDatabase<BlockSuiteBinaryDB>) {
  db.createObjectStore('workspace', { keyPath: 'id' });
  db.createObjectStore('milestone', { keyPath: 'id' });
}

export function createFdpStoragePersistence(
  topic?: string
): FdpStoragePersistence {
  const blossom = new Blossom();

  const fdpStorage = blossom.fdpStorage;
  const signer = {
    address: Utils.makeEthAddress(blossom.fdpStorage.account.wallet?.address),
    sign: async (digest: any) => {
      return blossom.signer.signMessage(blossom.dappId!, digest);
    },
  };
  // Create FdpStoragePersistence object
  const persistence = new FdpStoragePersistence(
    fdpStorage.connection.bee,
    signer,
    topic || DEFAULT_TOPIC,
    fdpStorage.connection.postageBatchId
  );

  return persistence as FdpStoragePersistence;
}
export interface IndexedDBProvider {
  connect: () => void;
  disconnect: () => void;
  cleanup: () => Promise<void>;
  whenSynced: Promise<void>;
  readonly connected: boolean;
}

export type UpdateMessage = {
  timestamp: number;
  update: Uint8Array;
};

export type WorkspacePersist = {
  id: string;
  updates: UpdateMessage[];
};

export type WorkspaceMilestone = {
  id: string;
  milestone: Record<string, Uint8Array>;
};

export interface BlockSuiteBinaryDB extends DBSchema {
  workspace: {
    key: string;
    value: WorkspacePersist;
  };
  milestone: {
    key: string;
    value: WorkspaceMilestone;
  };
}

export interface OldYjsDB extends DBSchema {
  updates: {
    key: number;
    value: Uint8Array;
  };
}
