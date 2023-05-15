import { CallbackSet } from '@affine/workspace/utils';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { Bee, Utils } from '@ethersphere/bee-js';
import { Blossom } from '@fairdatasociety/blossom';
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
    topic,
    postageBatchId
  );

  return persistence as FdpStoragePersistence;
}
export const createFdpProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): any => {
  const Y = BlockSuiteWorkspace.Y;
  const doc = blockSuiteWorkspace.doc;

  const callbacks = new CallbackSet();
  const persistence = createFdpStoragePersistenceMock(
    `/crdt/workspace/${blockSuiteWorkspace.id}`
  );
  const closeAuto = persistence.autoUpdate(doc, 3000);
  const close = persistence.subscribe(doc, 5000);
  return {
    flavour: 'fdp-channel',
    background: true,
    get connected() {
      return callbacks.ready;
    },
    callbacks,
    connect: () => {
      // const docDiff = Y.encodeStateVector(doc);
      const docUpdateV2 = Y.encodeStateAsUpdate(doc);
      // const awarenessUpdate = encodeAwarenessUpdate(awareness, [
      //   awareness.clientID,
      // ]);
      persistence.storeUpdate(docUpdateV2).then();
      // awareness.on('update', handleAwarenessUpdate);
      callbacks.ready = true;
    },
    disconnect: () => {
      // awareness.off('update', handleAwarenessUpdate);
      callbacks.ready = false;
      close();
      closeAuto();
    },
    cleanup: () => {
      // awareness.off('update', handleAwarenessUpdate);
      // close();
    },
  };
};
