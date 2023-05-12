import { Bee, Utils } from '@ethersphere/bee-js';
import { Blossom } from '@fairdatasociety/blossom';
import type { DBSchema } from 'idb/build/entry';
// @ts-ignore
import { FdpStoragePersistence, makePrivateKeySigner } from 'y-fdp-storage';

export const dbVersion = 1;
export const DEFAULT_DB_NAME = 'affine-local';
export const DEFAULT_TOPIC = '/crdt/affine';

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

export function createFdpStoragePersistenceMock(topic?: string) {
  const bee = new Bee('http://localhost:1633');
  const postageBatchId =
    'ed214aa124d43bb216b1c30a16bcb14708bd1afd1ff2c3816b06a3f357fbb6e5';

  const testIdentity = {
    privateKey:
      '634fb5a872396d9693e5c9f9d7233cfa93f395c093371017ff44aa9ae6564cdd',
    publicKey:
      '03c32bb011339667a487b6c1c35061f15f7edc36aa9a0f8648aba07a4b8bd741b4',
    address: '8d3766440f0d7b949a5e32995d09619a7f86e632',
  };
  const wallet = makePrivateKeySigner(
    Utils.hexToBytes(testIdentity.privateKey)
  );

  const signer = {
    address: Utils.makeEthAddress(testIdentity.address),
    sign: async (digest: any) => {
      return wallet.sign(digest);
    },
  };
  // Create FdpStoragePersistence object
  const persistence = new FdpStoragePersistence(
    bee,
    signer,
    topic || DEFAULT_TOPIC,
    postageBatchId
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
