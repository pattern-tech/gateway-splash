import { Cardano } from '../../../src/chains/cardano/cardano';
import * as utils from '../../../src/chains/cardano/cardano.utils';
import * as config from '../../../src/chains/cardano/cardano.config';
import { HotWallet, isOOROrder } from '@splashprotocol/sdk';
import fse from 'fs-extra';
import { BigNumber } from 'bignumber.js';
import { TxRequestParams } from '../../../src/chains/cardano/interfaces/cardano.interface';
import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';
jest.mock('@maestro-org/typescript-sdk', () => ({
  MaestroClient: jest.fn().mockImplementation(() => ({
    general: {
      chainTip: jest.fn().mockResolvedValue({
        data: {
          height: 12345,
        },
      }),
    },
    addresses: {
      utxosByAddress: jest.fn().mockResolvedValue({
        data: [
          { tx_hash: 'tx1', index: 0, slot: 100 },
          { tx_hash: 'tx2', index: 1, slot: 101 },
        ],
      }),
    },
  })),
}));
jest.mock('@splashprotocol/sdk', () => ({
  isOOROrder: jest.fn(),
  stringToHex: jest.fn(),
  HotWallet: {
    fromSeed: jest.fn(),
  },
}));
jest.mock('../../../src/chains/cardano/wallet.service', () => ({
  CardanoWallet: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(null),
  })),
}));
let cardano: Cardano;

describe('Cardano', () => {
  const mockConfig: any = {
    network: {
      name: 'name',
      nodeURL: 'nodeURL',
      maxLRUCacheInstances: 100,
      utxosLimit: 100,
      defaultSlippage: '17',
    },
  };
  const network = 'mainnet';
  beforeEach(() => {
    jest.spyOn(utils, 'getMaestroConfig').mockReturnValue({} as any);
    jest.spyOn(utils, 'getSplashInstance').mockReturnValue({} as any);
    cardano = new Cardano('mainnet', mockConfig, 100, {} as any);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('Should be defined', () => {
    expect(cardano).toBeDefined();
  });

  it('Should call getMaestroConfig and getSplashInstance with the correct parameters when instantiating', () => {
    expect(utils.getMaestroConfig).toHaveBeenCalledWith('Mainnet', 'nodeURL');
    expect(utils.getSplashInstance).toHaveBeenCalledWith('Mainnet');
  });
  it('Should create cardano instance when network is equal to "preprod"', () => {
    const preprodInstance = new Cardano('preprod', mockConfig, 100, {} as any);
    expect(preprodInstance.network).toEqual('preprod');
  });
  it('Should create cardano instance with "preview" network, when network is not equal to "mainnet" and "preprod"', () => {
    const preprodInstance = new Cardano(
      'someOtherNetwork',
      mockConfig,
      100,
      {} as any,
    );
    expect(preprodInstance.network).toEqual('preview');
  });

  describe('init', () => {
    it('Should be defined', () => {
      expect(cardano.init).toBeDefined();
    });

    it('Should call loadPools, loadAssets, loadTokenMetadata methods and update the "ready" status', async () => {
      // Arrange
      jest.spyOn(cardano as any, 'loadPools').mockResolvedValue({});
      jest.spyOn(cardano as any, 'loadAssets').mockResolvedValue({});
      jest.spyOn(cardano as any, 'loadTokenMetadata').mockResolvedValue({});
      // Act
      await cardano.init();
      // Assert
      expect(cardano['loadPools']).toHaveBeenCalled();
      expect(cardano['loadAssets']).toHaveBeenCalled();
      expect(cardano['loadTokenMetadata']).toHaveBeenCalled();
      expect(cardano['_ready']).toEqual(true);
    });
  });

  describe('loadTokenMetadata', () => {
    it('Should be defined', () => {
      expect(cardano['loadTokenMetadata']).toBeDefined();
    });
    // it('should throw an error if _assetMap is an empty object', async () => {
    //   // Arrange
    //   jest.spyOn(console, 'error').mockReturnValue({} as any);
    //   cardano['_assetMap'] = {};
    //   // Act
    //   await cardano['loadTokenMetadata']();
    //   // Assert
    //   expect(console.error).toHaveBeenCalledWith('try to re-init the object !');
    // });
  });

  describe('getInstance', () => {
    it('Should be defined', () => {
      expect(Cardano.getInstance).toBeDefined();
    });
    it('should create a new Cardano instance if it does not exist in the cache', () => {
      // Arrange
      jest.spyOn(config, 'getCardanoConfig').mockReturnValue(mockConfig);
      // Act
      const cardanoInstance = Cardano.getInstance(network, 'api-key');
      expect(config.getCardanoConfig).toHaveBeenCalledWith(network);
      expect(cardanoInstance).toBeDefined();
    });

    it('should return an existing Cardano instance from the cache', () => {
      // Arrange
      const cachedInstance = new Cardano(network, mockConfig, 1, {});
      // Act
      const cardanoInstance = Cardano.getInstance(network, 'api-key');
      // Assert
      expect(JSON.stringify(cardanoInstance)).toBe(
        JSON.stringify(cachedInstance),
      );
    });
    it('should throw an error if creating new Cardano instance fails', () => {
      jest.spyOn(config, 'getCardanoConfig').mockReturnValue('junkData' as any);

      expect(() => Cardano.getInstance('mockNetwork', 'api-key')).toThrow(
        `Failed to create Cardano instance: TypeError: Cannot read properties of undefined (reading 'nodeURL')`,
      );
    });
  });

  describe('node', () => {
    it('Should be defined', () => {
      expect(cardano.node).toBeDefined();
    });
    it('Shopuld return the cardano node', () => {
      cardano['_node'] = {} as any;
      expect(cardano.node).toEqual(cardano['_node']);
    });
  });
  describe('network', () => {
    it('Should be defined', () => {
      expect(cardano.network).toBeDefined();
    });
    it('Shopuld return the cardano node', () => {
      expect(cardano.network).toEqual('mainnet');
    });
  });

  describe('checkSatisfaction', () => {
    it('Should be defined', () => {
      expect(cardano.checkSatisfaction).toBeDefined();
    });
    it('Should call isOOROrder method with the correct parameters', async () => {
      await cardano.checkSatisfaction('hash');
      expect(isOOROrder).toHaveBeenCalledWith('hash:0', {});
    });
  });

  describe('storedAssetList', () => {
    it('Should be defined', () => {
      expect(cardano.storedAssetList).toBeDefined();
    });
    it('Shopuld return the _assetMap value', () => {
      expect(cardano.storedAssetList).toEqual([]);
    });
  });
  describe('ready', () => {
    it('Should be defined', () => {
      expect(cardano.ready).toBeDefined();
    });
    it('Shopuld return the ready status', () => {
      cardano['_ready'] = false;
      expect(cardano.ready()).toEqual(false);
    });
  });
  describe('getNetworkHeight', () => {
    it('Should be defined', () => {
      expect(cardano.getNetworkHeight).toBeDefined();
    });
    it('Shopuld return the Network height', async () => {
      expect(await cardano.getNetworkHeight()).toEqual(12345);
    });
  });
  describe('close', () => {
    it('Should be defined', () => {
      expect(cardano.close).toBeDefined();
    });
    it('Should return nothing', async () => {
      expect(await cardano.close()).not.toBeDefined();
    });
  });
  describe('getConnectedInstances', () => {
    it('Should be defined', () => {
      expect(Cardano.getConnectedInstances).toBeDefined();
    });
    it('should return a correct object when instances are connected', () => {
      // Arrange: Mock _instances with multiple Cardano instances
      const mockInstance1 = { someProperty: 'value1' };
      const mockInstance2 = { someProperty: 'value2' };
      Cardano['_instances'] = new Map([
        ['instance1', mockInstance1],
        ['instance2', mockInstance2],
      ]) as any;
      const result = Cardano.getConnectedInstances();
      expect(result).toEqual({
        instance1: mockInstance1,
        instance2: mockInstance2,
      });
    });
    it('should return an empty object when no instances are connected', () => {
      Cardano['_instances'] = undefined as any;
      const result = Cardano.getConnectedInstances();
      expect(result).toEqual({});
    });
  });
  describe('getCurrentBlockNumber', () => {
    it('Should be defined', () => {
      expect(cardano.getCurrentBlockNumber).toBeDefined();
    });
    it('Shopuld return the Network height', async () => {
      jest.spyOn(cardano, 'getNetworkHeight').mockResolvedValue(123);
      expect(await cardano.getCurrentBlockNumber()).toEqual(124);
    });
  });

  describe('getAddressUtxos', () => {
    it('Should be defined', () => {
      expect(cardano.getAddressUtxos).toBeDefined();
    });
    it('should return utxos successfully when the node responds correctly', async () => {
      const result = await cardano.getAddressUtxos('mockAddress');

      // Assert: Ensure the result matches the mock UTXOs
      expect(result).toEqual([
        { tx_hash: 'tx1', index: 0, slot: 100 },
        { tx_hash: 'tx2', index: 1, slot: 101 },
      ]);
      expect(cardano['_node'].addresses.utxosByAddress).toHaveBeenCalledWith(
        'mockAddress',
        {
          count: cardano['utxosLimit'],
          order: 'desc',
          cursor: null,
          asset: null,
        },
      );
    });
    it('should return utxos with custom params when provided', async () => {
      // Arrange: Mock the response from the node with custom params
      const customParams: TxRequestParams = {
        limit: 5,
        sortDirection: 'asc',
        offset: '10',
        asset: 'mockAsset',
      };
      // Act: Call the method with custom params
      const result = await cardano.getAddressUtxos(
        [
          { tx_hash: 'tx1', index: 0, slot: 100 },
          { tx_hash: 'tx2', index: 1, slot: 101 },
        ] as any,
        customParams,
      );

      // Assert: Ensure the result matches the mock UTXOs and that the correct params were used
      expect(result).toEqual([
        { tx_hash: 'tx1', index: 0, slot: 100 },
        { tx_hash: 'tx2', index: 1, slot: 101 },
      ]);
      expect(cardano['_node'].addresses.utxosByAddress).toHaveBeenCalledWith(
        [
          { tx_hash: 'tx1', index: 0, slot: 100 },
          { tx_hash: 'tx2', index: 1, slot: 101 },
        ],
        {
          asset: 'mockAsset',
          count: 5,
          cursor: '10',
          order: 'asc',
        },
      );
    });
    it('should throw an error when the node fails to respond', async () => {
      jest
        .spyOn(cardano['_node'].addresses, 'utxosByAddress')
        .mockRejectedValue(new Error('Network Error'));
      await expect(cardano.getAddressUtxos('mockAddress')).rejects.toThrow(
        'Network Error',
      );
    });
  });

  describe('getAccountFromMnemonic', () => {
    it('Should be defined', () => {
      expect(cardano.getAccountFromMnemonic).toBeDefined();
    });
    it('Should create wallet initialize and activate it', async () => {
      // Arrange
      jest.spyOn(cardano, 'activateWallet').mockResolvedValue();
      // Act
      await cardano.getAccountFromMnemonic('fakeMnemonic');
      // Assert
      expect(cardano.activateWallet).toHaveBeenCalledWith('fakeMnemonic');
    });
  });

  describe('activateWallet', () => {
    it('Should be defined', () => {
      expect(cardano.activateWallet).toBeDefined();
    });
    it('Should call selectWallet with the correct parameters', async () => {
      cardano['_dex'] = {
        selectWallet: jest.fn(),
        explorer: 'mockExplorer',
      } as any; // Mock _dex object
      // Act
      await cardano.activateWallet('fakeMnemonic');
      // Assert
      expect(cardano['_dex'].selectWallet).toHaveBeenCalledTimes(1);
      expect(cardano['_dex'].selectWallet).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });
    it('Should call fromSeed method from HotWallet with the correct parameters', async () => {
      // Mock the necessary utils and the getSplashInstance return value
      jest.spyOn(utils, 'getSplashInstance').mockReturnValue({
        explorer: 'mockExplorer',
        selectWallet: jest.fn(), // Mock the selectWallet method
      } as any);
      // Create a new instance of Cardano and mock _dex
      const newCardano = new Cardano('mainnet', mockConfig, 100, {} as any);
      jest.spyOn(HotWallet, 'fromSeed').mockResolvedValue({} as any);
      const selectWalletMock = newCardano['_dex'].selectWallet as jest.Mock;
      selectWalletMock.mockImplementationOnce((callback) => {
        callback(); // This will call HotWallet.fromSeed
      });
      // Act
      await newCardano.activateWallet('fakeMnemonic');
      // Assert
      expect(newCardano['_dex'].selectWallet).toHaveBeenCalledTimes(1);
      expect(HotWallet.fromSeed).toHaveBeenCalledTimes(1);
      expect(HotWallet.fromSeed).toHaveBeenCalledWith(
        'fakeMnemonic',
        'mockExplorer',
      );
    });
  });

  describe('encrypt', () => {
    const secret = 'mySecret';
    const password = 'myPassword';
    it('Should be defined', () => {
      expect(cardano.encrypt).toBeDefined();
    });
    it('Should encrypt a secret with a given password', () => {
      const encryptedText = cardano.encrypt(secret, password);
      expect(encryptedText).toMatch(/^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/);
    });

    it('Should produce different encryption outputs for different secrets', () => {
      const encryptedText1 = cardano.encrypt('secret1', password);
      const encryptedText2 = cardano.encrypt('secret2', password);
      expect(encryptedText1).not.toBe(encryptedText2);
    });

    it('Should produce different encryption outputs for different passwords', () => {
      const encryptedText1 = cardano.encrypt(secret, 'password1');
      const encryptedText2 = cardano.encrypt(secret, 'password2');
      expect(encryptedText1).not.toBe(encryptedText2);
    });

    it('Should produce different IVs for different encryptions', () => {
      const encryptedText1 = cardano.encrypt(secret, password);
      const encryptedText2 = cardano.encrypt(secret, password);
      // Extract IVs from the encrypted texts
      const [iv1] = encryptedText1.split(':');
      const [iv2] = encryptedText2.split(':');
      expect(iv1).not.toBe(iv2);
    });

    it('Should handle edge case where password is longer than 32 bytes', () => {
      const longPassword = 'a'.repeat(50); // 50 bytes password
      const encryptedText = cardano.encrypt(secret, longPassword);
      expect(encryptedText).toMatch(/^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/);
    });
  });
  describe('getAccountFromAddress', () => {
    beforeEach(() => {
      jest.spyOn(fse, 'readFile').mockResolvedValue('file' as any);
    });
    it('Should be defined', () => {
      expect(cardano.getAccountFromAddress).toBeDefined();
    });
    it('Should throw new Error if passphrase is invalid', async () => {
      jest
        .spyOn(ConfigManagerCertPassphrase, 'readPassphrase')
        .mockReturnValue(undefined);
      await expect(cardano.getAccountFromAddress('address')).rejects.toThrow(
        'missing passphrase',
      );
      expect(fse.readFile).toHaveBeenCalledWith(
        './conf/wallets/cardano/address.json',
        'utf8',
      );
    });
    it('Should return account from address given', async () => {
      jest
        .spyOn(ConfigManagerCertPassphrase, 'readPassphrase')
        .mockReturnValue('passphrase');
      jest.spyOn(cardano, 'decrypt').mockReturnValue('mnemonic');
      jest
        .spyOn(cardano, 'getAccountFromMnemonic')
        .mockReturnValue('cardano Accont' as any);
      const result = await cardano.getAccountFromAddress('address');
      expect(cardano.decrypt).toHaveBeenCalledWith('file', 'passphrase');
      expect(ConfigManagerCertPassphrase.readPassphrase).toHaveBeenCalled();
      expect(fse.readFile).toHaveBeenCalledWith(
        './conf/wallets/cardano/address.json',
        'utf8',
      );
      expect(cardano.getAccountFromMnemonic).toHaveBeenCalledWith('mnemonic');
      expect(result).toEqual('cardano Accont');
    });
  });

  describe('decrypt', () => {
    const secret = 'mySecret';
    it('Should be defined', () => {
      expect(cardano.decrypt).toBeDefined();
    });
    it('Should decrypt an encrypted secret correctly', () => {
      // Arrange: Set up the secret and password, and encrypt the secret
      const password = 'myPassword';
      const encryptedText = cardano.encrypt(secret, password);
      // Act: Call the decrypt method
      const decryptedText = cardano.decrypt(encryptedText, password);
      // Assert: Verify that the decrypted text matches the original secret
      expect(decryptedText).toBe(secret);
    });

    it('Should fail to decrypt with wrong password', () => {
      // Arrange: Set up the secret, correct password, wrong password, and encrypt the secret
      const correctPassword = 'correctPassword';
      const wrongPassword = 'wrongPassword';
      const encryptedText = cardano.encrypt(secret, correctPassword);
      // Act & Assert: Call the decrypt method with the wrong password and expect an error
      expect(() => {
        cardano.decrypt(encryptedText, wrongPassword);
      }).toThrow();
    });

    it('Should handle edge case where password is longer than 32 bytes', () => {
      // Arrange: Set up the secret and a long password, and encrypt the secret
      const longPassword = 'a'.repeat(50); // 50 bytes password
      const encryptedText = cardano.encrypt(secret, longPassword);
      const decryptedText = cardano.decrypt(encryptedText, longPassword);
      // Assert: Verify that the decrypted text matches the original secret
      expect(decryptedText).toBe(secret);
    });

    it('Should handle case where password is exactly 32 bytes', () => {
      const exact32BytesPassword = 'a'.repeat(32); // 32 bytes password
      const encryptedText = cardano.encrypt(secret, exact32BytesPassword);
      const decryptedText = cardano.decrypt(
        encryptedText,
        exact32BytesPassword,
      );
      expect(decryptedText).toBe(secret);
    });
  });

  describe('getAssetBalance', () => {
    it('Should be defined', () => {
      expect(cardano.getAssetBalance).toBeDefined();
    });
    it(`Should throw new Error when assetName is equal to 'LOVELACE' or 'ADA'`, async () => {
      await expect(cardano.getAssetBalance('1', 'LOVELACE')).rejects.toThrow(
        'use `getAdaBalance` function !',
      );

      await expect(cardano.getAssetBalance('1', 'ADA')).rejects.toThrow(
        'use `getAdaBalance` function !',
      );
    });
    it('Should throw new Error when asset name is not valid on the chian', async () => {
      jest.spyOn(cardano, 'findToken').mockReturnValue(undefined);
      await expect(
        cardano.getAssetBalance('1', 'someInvalidToken'),
      ).rejects.toThrow(`Asset 'someInvalidToken' not found in cardano Node!`);
    });
    it('Should throw new Error when token metadata is not found', async () => {
      jest
        .spyOn(cardano, 'findToken')
        .mockReturnValue({ policyId: '123', name: 'validToken' } as any);
      jest.spyOn(utils, 'getTokenMetadata').mockResolvedValue(null);

      await expect(cardano.getAssetBalance('1', 'validToken')).rejects.toThrow(
        `Error fetching account assets from cardano Node:`,
      );
    });
    it('Should calculate token balance correctly', async () => {
      const token: any = {
        token: { asset: { name: 'name' } },
        policyId: '123',
        name: 'validToken',
        decimals: 2,
        symbol: 'VLT',
      };
      jest.spyOn(cardano, 'findToken').mockReturnValue(token);
      jest
        .spyOn(utils, 'getTokenMetadata')
        .mockResolvedValue({ decimals: 2, ticker: 'VLT' } as any);
      jest
        .spyOn(cardano, 'getAddressUtxos')
        .mockResolvedValue([
          { assets: [{ unit: '123validToken', amount: '10' }] },
          { assets: [{ unit: '123validToken', amount: '20' }] },
        ] as any);
      jest.spyOn(cardano as any, 'fromRaw').mockReturnValue('30.00');

      const result = await cardano.getAssetBalance('1', 'validToken');
      expect(result).toBe('30.00');
    });
  });
  describe('loadAssets', () => {
    it('Should be defined', () => {
      expect(cardano['loadAssets']).toBeDefined();
    });
    it('Should load assets and update _assetMap on cardano class', async () => {
      // Arrange
      jest.spyOn(utils, 'getAssetsFromPools').mockReturnValue({});
      // Act
      await cardano['loadAssets']();
      // Assert
      expect(cardano['_assetMap']).toEqual({});
      expect(utils.getAssetsFromPools).toHaveBeenCalled();
    });
  });
  describe('loadPools', () => {
    it('Should be defined', () => {
      expect(cardano['loadPools']).toBeDefined();
    });
    it('Should load pools and update _splashPools on cardano class', async () => {
      // Arrange
      jest.spyOn(utils, 'getSplashPools').mockResolvedValue({});
      // Act
      await cardano['loadPools']();
      // Assert
      expect(cardano['_splashPools']).toEqual({});
      expect(utils.getSplashPools).toHaveBeenCalledWith(cardano['_dex']);
    });
  });
  describe('swap', () => {
    it('Should be defined', () => {
      expect(cardano.swap).toBeDefined();
    });
    it('Should throw new Error when Cardano instance is not ready', async () => {
      // Arrange
      cardano['_ready'] = false;
      // Act & Assert
      await expect(
        cardano.swap('baseToken', 'quoteToken', BigNumber(1), true, '18'),
      ).rejects.toThrow('Cardano instance not initialized');
    });
    it('Should throw new Error when amoumt is negative or zero', async () => {
      // Arrange
      cardano['_ready'] = true;
      // Act & Assert
      await expect(
        cardano.swap('baseToken', 'quoteToken', BigNumber(-1), true, '18'),
      ).rejects.toThrow('Invalid swap amount');
      await expect(
        cardano.swap('baseToken', 'quoteToken', BigNumber(0), true, '18'),
      ).rejects.toThrow('Invalid swap amount');
    });
    it('Should throw error if getTokenMetadata fails to return metadata for baseMetadata', async () => {
      // Arrange
      cardano['_ready'] = true;
      jest.spyOn(cardano as any, 'validateTokens').mockReturnValue([
        { policyId: 'basePolicy', name: 'baseToken' },
        { policyId: 'quotePolicy', name: 'quoteToken' },
      ]);
      jest.spyOn(utils, 'getTokenMetadata').mockResolvedValue(undefined);
      jest
        .spyOn(utils, 'getTokenMetadata')
        .mockResolvedValue('validTokenMetadata' as any);
      await expect(
        cardano.swap('baseToken', 'quoteToken', BigNumber(1), true, '18'),
      ).rejects.toThrow(
        "Couldn't find the tokens metadata, try a verified token",
      );
    });
  });
  describe('validateTokens', () => {
    it('Should be defined', () => {
      expect(cardano['validateTokens']).toBeDefined();
    });
    it('Should throw new Error when baseCardanoToken is undefined', () => {
      // Arrange
      jest.spyOn(cardano, 'findToken').mockReturnValueOnce(undefined);
      jest
        .spyOn(cardano, 'findToken')
        .mockReturnValueOnce('someValidCardanoToken' as any);
      // Assert
      expect(() => {
        cardano['validateTokens']('baseToken', 'quoteToken');
      }).toThrow('The BASETOKEN token is not supported by splash dex!');
      expect(cardano['findToken']).toHaveBeenCalledTimes(2);
      expect(cardano['findToken']).toHaveBeenCalledWith('BASETOKEN');
      expect(cardano['findToken']).toHaveBeenCalledWith('QUOTETOKEN');
    });
    it('Should throw new Error when quoteCardanoToken is undefined', () => {
      // Arrange
      jest
        .spyOn(cardano, 'findToken')
        .mockReturnValueOnce('someValidCardanoToken' as any);
      jest.spyOn(cardano, 'findToken').mockReturnValueOnce(undefined);
      // Assert
      expect(() => {
        cardano['validateTokens']('baseToken', 'quoteToken');
      }).toThrow('The QUOTETOKEN token is not supported by splash dex!');
      expect(cardano['findToken']).toHaveBeenCalledTimes(2);
      expect(cardano['findToken']).toHaveBeenCalledWith('BASETOKEN');
      expect(cardano['findToken']).toHaveBeenCalledWith('QUOTETOKEN');
    });
    it('Should return baseCardanoToken and quoteCardanoToken if both exist', () => {
      // Arrange
      jest
        .spyOn(cardano, 'findToken')
        .mockReturnValueOnce('someValidCardanoToken' as any);
      jest
        .spyOn(cardano, 'findToken')
        .mockReturnValueOnce('someOtherValidCardanoToken' as any);
      // Act
      const result = cardano['validateTokens']('baseToken', 'quoteToken');
      // Assert
      expect(result).toEqual([
        'someValidCardanoToken',
        'someOtherValidCardanoToken',
      ]);
      expect(cardano['findToken']).toHaveBeenCalledTimes(2);
      expect(cardano['findToken']).toHaveBeenCalledWith('BASETOKEN');
      expect(cardano['findToken']).toHaveBeenCalledWith('QUOTETOKEN');
    });
  });
});
