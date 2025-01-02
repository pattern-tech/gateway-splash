import { Cardano } from '../../../src/chains/cardano/cardano';
import * as utils from '../../../src/chains/cardano/cardano.utils';
import * as config from '../../../src/chains/cardano/cardano.config';
import { HotWallet, isOOROrder, Price, selectEstimatedPrice } from '@splashprotocol/sdk';
import fse from 'fs-extra';
import { BigNumber } from 'bignumber.js';
import { TxRequestParams } from '../../../src/chains/cardano/interfaces/cardano.interface';
import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';
import axios from 'axios';
import LRUCache from 'lru-cache';

jest.mock('@maestro-org/typescript-sdk', () => ({
  MaestroClient: jest.fn().mockImplementation(() => ({
    transactions: {
      txInfo: jest.fn().mockResolvedValue({ data: 'txData' }),
    },
    txManager: {
      txManagerState: jest.fn().mockResolvedValue('txManagerState'),
    },
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
      txsByAddress: jest.fn().mockResolvedValue({ data: [] }),
      addressBalance: jest.fn().mockResolvedValue({ data: { lovelace: 2 } }),
      decodeAddress: jest.fn().mockRejectedValueOnce(new Error('test error'))
        .mockResolvedValueOnce({ payment_cred: { bech32: 'bech32' } })
    },
    blocks: {
      blockInfo: jest.fn().mockResolvedValue({ data: { timestamp: '123456789' } })
    }
  })),
}));
jest.mock('@splashprotocol/sdk', () => ({
  selectEstimatedPrice: jest.fn().mockReturnValue('priceWithNoPriceLimit' as any),
  isOOROrder: jest.fn(),
  hexToString: jest.fn((hex) => `decoded(${hex})`),
  stringToHex: jest.fn(),
  HotWallet: {
    fromSeed: jest.fn(),
  },
  Price: {
    new: jest.fn().mockReturnValue('price' as any),
  }
}));
jest.mock('../../../src/chains/cardano/wallet.service', () => ({
  CardanoWallet: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(null),
  })),
}));
let cardano: Cardano;

describe('Cardano', () => {
  const baseToken = {
    policyId: 'basePolicy',
    name: 'baseToken',
    symbol: 'baseToken',
    decimals: 6,
    token: {
      asset: {
        name: 'baseToken',
        policyId: 'basePolicy',
        nameBase16: '546f6b656e58',
        isAda: jest.fn().mockReturnValue(false),
      },
      withAmount: jest.fn().mockReturnValue(1),
    }
  } as any;
  const quoteToken = {
    policyId: 'quotePolicy',
    name: 'quoteToken',
    decimals: 3,
    symbol: 'quoteToken',
    token: {
      asset: {
        name: 'quoteToken',
        policyId: 'quotePolicy',
        nameBase16: '341f3b656e34',
        isAda: jest.fn().mockReturnValue(false),
      },
      withAmount: jest.fn().mockReturnValue(1),
    }
  } as any
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
    cardano = new Cardano('mainnet', mockConfig, 100, {} as any, 'maestroApiKey');
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('Should be defined', () => {
    expect(cardano).toBeDefined();
  });

  it('Should call getMaestroConfig and getSplashInstance with the correct parameters when instantiating', () => {
    expect(utils.getMaestroConfig).toHaveBeenCalledWith('Mainnet', 'nodeURL', 'maestroApiKey');
    expect(utils.getSplashInstance).toHaveBeenCalledWith('Mainnet', 'maestroApiKey');
  });
  it('Should create cardano instance when network is equal to "preprod"', () => {
    const preprodInstance = new Cardano('preprod', mockConfig, 100, {} as any, 'maestroApiKey');
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
    it('Should call getTokenMetadataWithBackoff method with correct parameters and update Cardano._tokenMetadata', async () => {
      jest.spyOn(utils, 'getTokenMetadataWithBackoff').mockResolvedValue({ 'token': {} } as any);
      cardano['_assetMap']['tokenName'] = [] as any;
      expect(await cardano['loadTokenMetadata']()).toEqual(undefined);
      expect(utils.getTokenMetadataWithBackoff).toHaveBeenCalledWith([[]], cardano['_node']);
    })
  });

  describe('APIKeyValidation', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })
    it('Should be defined', () => {
      expect(Cardano.APIKeyValidation).toBeDefined()
    })
    it('Should not update the Cardano.maestroApiKey is api key is not valid', async () => {
      Cardano['maestroApiKey'] = undefined;
      jest.spyOn(axios, 'get').mockRejectedValue(new Error('invalid api key'))
      await expect(Cardano.APIKeyValidation('invalid-api-key')).rejects.toThrow('API key is invalid or expired.')
      expect(Cardano['maestroApiKey']).toBeUndefined();
    })
    it('Should update Cardano.maestroApiKey if api key is valid', async () => {
      jest.spyOn(axios, 'get').mockResolvedValue({})
      await Cardano.APIKeyValidation('valid-api-key')
      expect(Cardano['maestroApiKey']).toEqual('valid-api-key')
    })
  })
  describe('getInstance', () => {
    beforeEach(() => {
      jest.spyOn(config, 'getCardanoConfig').mockReturnValue(mockConfig);
    })
    it('Should be defined', () => {
      expect(Cardano.getInstance).toBeDefined();
    });
    it('Should throw new Error when maestroApiKey is not provided', () => {
      expect(() => Cardano.getInstance('mainnet', undefined)).toThrow('Failed to create Cardano instance: Error: Please connect to the gateway first.')
    })
    it('should create a new Cardano instance if it does not exist in the cache', () => {
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

  describe('getAdaBalance', () => {
    it('Should be defined', () => {
      expect(cardano.getAdaBalance).toBeDefined()
    })
    it('handle the case if any error occurs', async () => {
      await expect(cardano.getAdaBalance('accountAddress')).rejects.toThrow('Error while fetching the accountAddress balance, Node: Error: test error')
    })
    it('Should get ADA balance', async () => {
      await expect(cardano.getAdaBalance('accountAddress')).rejects.toThrow('Error while fetching the accountAddress balance, Node: Error: test error')
      jest.spyOn(cardano as any, 'fromRaw').mockReturnValue('5')
      const result = await cardano.getAdaBalance('accountAddress')
      expect(result).toEqual('5');
      expect(cardano['fromRaw']).toHaveBeenCalledTimes(1)
      expect(cardano['fromRaw']).toHaveBeenCalledWith(BigNumber(2), 6)
    })
  })
  describe('getBalance', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    })
    it('Should be defined', () => {
      expect(cardano.getBalance).toBeDefined();
    })
    it('should return zero balance and no assets for an empty UTXO list', async () => {
      const result = cardano.getBalance([]);
      expect(result).toEqual({ balance: BigNumber('0'), assets: {} });
    })
    it('should correctly calculate ADA balance', () => {
      const utxos = [
        {
          assets: [
            {
              unit: 'LOVELACE',
              amount: '1000000',
            },
          ],
        },
      ] as any;
      const result = cardano.getBalance(utxos);
      expect(result.balance).toEqual(BigNumber(1));
    })
    it('should correctly handle multiple assets', () => {
      Cardano['_tokenMetadata'] = new LRUCache<string, Cardano>({
        max: 100,
      }) as any;
      Cardano['_tokenMetadata'].set('DECODED(TESTTOKEN)', {
        decimals: 2,
      } as any)
      const utxos = [
        {
          assets: [
            {
              unit: 'LOVELACE',
              amount: '2000000',
            },
            {
              unit: '0'.repeat(56) + 'testtoken',
              amount: '500',
            },
          ],
        },
      ] as any;
      const result = cardano.getBalance(utxos);
      expect(result.balance).toEqual(BigNumber(2));
      expect(result.assets).toEqual({ "DECODED(TESTTOKEN)": BigNumber(5) });
    })
  })
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
    beforeEach(() => {
      cardano['_ready'] = true;
      jest.spyOn(cardano as any, 'validateTokens').mockReturnValue([
        baseToken,
        quoteToken
      ]);
    })
    afterEach(() => {
      jest.clearAllMocks();
    })
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
      jest.spyOn(utils, 'getTokenMetadata').mockResolvedValueOnce(undefined);
      jest
        .spyOn(utils, 'getTokenMetadata')
        .mockResolvedValueOnce('validTokenMetadata' as any);
      await expect(
        cardano.swap('baseToken', 'quoteToken', BigNumber(1), true, '18'),
      ).rejects.toThrow(
        "Couldn't find the tokens metadata, try a verified token",
      );
    });
    it('should throw error if getTokenMetadata fails to return metadata for quoteMetadata', async () => {
      jest
        .spyOn(utils, 'getTokenMetadata')
        .mockResolvedValueOnce('validTokenMetadata' as any);
      jest.spyOn(utils, 'getTokenMetadata').mockResolvedValueOnce(undefined);
      await expect(
        cardano.swap('baseToken', 'quoteToken', BigNumber(1), true, '18'),
      ).rejects.toThrow(
        "Couldn't find the tokens metadata, try a verified token",
      );
    })
    it('Should create trade pesponse tokens successfully', async () => {
      jest
        .spyOn(utils, 'getTokenMetadata')
        .mockResolvedValueOnce('baseMetadata' as any);
      jest
        .spyOn(utils, 'getTokenMetadata')
        .mockResolvedValueOnce('quoteMetadata' as any);
      jest.spyOn(utils, 'updateTokenMetadata').mockReturnValueOnce(baseToken as any);
      jest.spyOn(utils, 'updateTokenMetadata').mockReturnValueOnce(quoteToken as any);
      jest.spyOn(cardano as any, 'createTokens').mockReturnValue(['inputToken', 'outputToken'] as any)
      jest.spyOn(utils, 'getNftBase16Names').mockReturnValue(['poolNftNames'] as any);
      jest.spyOn(cardano as any, 'validatePool').mockReturnValue({});
      jest.spyOn(cardano as any, 'createSwapTransaction').mockResolvedValue('swapHash');
      jest.spyOn(cardano as any, 'signAndSubmitTransaction').mockResolvedValue('txHash');
      jest.spyOn(cardano, 'estimateFee').mockResolvedValue('0.5');
      jest.spyOn(cardano, 'calculateMinOutput').mockReturnValue(BigNumber(1));
      jest.spyOn(cardano as any, 'createTradeResponse').mockReturnValue('trade response now is cerated')
      jest.spyOn(cardano as any, 'getPrice').mockResolvedValue({ raw: '5', formatted: '1' } as any);
      jest.spyOn(cardano as any, 'validateTokens').mockReturnValue([
        baseToken,
        quoteToken
      ]);
      expect(await cardano.swap('baseToken', 'quoteToken', BigNumber(1), true, '18')).toEqual('trade response now is cerated');
      expect(utils.getTokenMetadata).toHaveBeenCalledTimes(2);
      expect(utils.updateTokenMetadata).toHaveBeenCalledTimes(2);
      expect(utils.getNftBase16Names).toHaveBeenCalledTimes(1);
      expect(cardano['validatePool']).toHaveBeenCalledTimes(1);
      expect(cardano['createSwapTransaction']).toHaveBeenCalledTimes(1);
      expect(cardano['signAndSubmitTransaction']).toHaveBeenCalledTimes(1);
      expect(cardano['estimateFee']).toHaveBeenCalledTimes(1);
      expect(cardano['calculateMinOutput']).toHaveBeenCalledTimes(1);
      expect(cardano['createTradeResponse']).toHaveBeenCalledTimes(1);
      expect(cardano['getPrice']).toHaveBeenCalledTimes(1);
      expect(cardano['validateTokens']).toHaveBeenCalledTimes(1);
      expect(cardano['createTokens']).toHaveBeenCalledTimes(1);
      expect(cardano['createTokens']).toHaveBeenCalledWith(baseToken, quoteToken, BigNumber(1), true);
      expect(cardano['createTradeResponse']).toHaveBeenCalledWith(baseToken, quoteToken, BigNumber(1), '0.005', BigNumber(1), true, '0.5', 'txHash')
    })
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
        .mockReturnValueOnce(baseToken);
      jest
        .spyOn(cardano, 'findToken')
        .mockReturnValueOnce(quoteToken);
      // Act
      const result = cardano['validateTokens']('baseToken', 'quoteToken');
      // Assert
      expect(result).toEqual([
        baseToken,
        quoteToken,
      ]);
      expect(cardano['findToken']).toHaveBeenCalledTimes(2);
      expect(cardano['findToken']).toHaveBeenCalledWith('BASETOKEN');
      expect(cardano['findToken']).toHaveBeenCalledWith('QUOTETOKEN');
    });
  });

  describe('createTokens', () => {
    it('Should be defined', () => {
      expect(cardano['createTokens']).toBeDefined();
    });
    it('Should create input and output tokens correctly', () => {
      // Act
      const result = cardano['createTokens'](baseToken, quoteToken, BigNumber(1), true);
      // Assert
      expect(result).toEqual([1, 1]);
    });
  })

  describe('validatePool', () => {
    it('Should be defined', () => {
      expect(cardano['validatePool']).toBeDefined()
    });
    it('should throw an error for an unsupported pool', () => {
      // Arrange
      cardano['_splashPools'] = {};
      expect(() => {
        cardano['validatePool']({ baseToQuote: 'test15ftest2junkChar', quoteToBase: 'quoteToken' });
      }).toThrow('The decoded(test1),decoded(test2) pair is not supported by splash dex!');
    })
  })
  describe('createSwapTransaction', () => {
    it('Should be defined', () => {
      expect(cardano['createSwapTransaction']).toBeDefined();
    });
    it('Should call "newTx", "spotOrder" & "complete"', async () => {
      jest.spyOn(utils, 'getSplashInstance').mockReturnValue({
        newTx: jest.fn().mockReturnValue({
          spotOrder: jest.fn().mockReturnValue({
            complete: jest.fn(),
          })
        })

      } as any);
      const tempCardano = new Cardano('mainnet', mockConfig, 100, {} as any);
      await tempCardano['createSwapTransaction']({} as any, { asset: 'asset' } as any, 1)
      expect(tempCardano['_dex'].newTx).toHaveBeenCalledTimes(1);
      expect(tempCardano['_dex'].newTx().spotOrder).toHaveBeenCalledTimes(1);
      expect(tempCardano['_dex'].newTx().spotOrder).toHaveBeenCalledWith({
        input: {},
        outputAsset: 'asset',
        slippage: 1
      });
      expect(tempCardano['_dex'].newTx().spotOrder().complete).toHaveBeenCalledTimes(1);
    });
  })

  describe('cancel', () => {
    it('Should be defined', () => {
      expect(cardano['cancel']).toBeDefined();
    });
    it('Should handle error when any error occurs', async () => {
      await expect(cardano['cancel']('txHash', 1)).rejects.toThrow(`TypeError: Cannot read properties of undefined (reading 'submitTx')`);
    });
    it('Should call "newTx", "cancelOperation", "complete" and "submitTx"', async () => {
      jest.spyOn(console, 'log').mockReturnValue({} as any);
      jest.spyOn(utils, 'getSplashInstance').mockReturnValue({
        explorer: {
          submitTx: jest.fn().mockResolvedValue({

          }),
        },
        newTx: jest.fn().mockReturnValue({
          cancelOperation: jest.fn().mockReturnValue({
            complete: jest.fn().mockResolvedValue({
              sign: jest.fn().mockResolvedValue({
                cbor: 'cbor'
              })
            })
          })
        })
      } as any);
      const tempCardano = new Cardano('mainnet', mockConfig, 100, {} as any);
      await tempCardano['cancel']('txHash', 1)
      expect(tempCardano['_dex'].newTx).toHaveBeenCalledTimes(1);
      expect(tempCardano['_dex'].newTx().cancelOperation).toHaveBeenCalledTimes(1);
      expect(tempCardano['_dex'].newTx().cancelOperation).toHaveBeenCalledWith({ txHash: "txHash", index: 1 });
      expect(tempCardano['_dex'].newTx().cancelOperation().complete).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith('order failure, cancelling txHash:1');
    });
  })

  describe('estimateFee', () => {
    it('Should be defined', () => {
      expect(cardano['estimateFee']).toBeDefined();
    })
    it("should return the fee", async () => {
      jest.spyOn(utils, 'getSplashInstance').mockReturnValue({
        api: {
          getSplashOperationConfig: jest.fn().mockResolvedValue({
            operations: {
              spotOrderV3: {
                settings: {
                  worstOrderStepCost: 3,
                  executorFee: 4,
                }
              }
            }
          }),
        },
        explorer: {
          getProtocolParams: jest.fn().mockResolvedValue({
            minUTxOValue: 1,
          }),
        },
        newTx: jest.fn().mockReturnValue({
          spotOrder: jest.fn().mockReturnValue({
            complete: jest.fn().mockResolvedValue({
              wasm: {
                body: jest.fn().mockReturnValue({
                  fee: jest.fn().mockReturnValue(17)
                })
              }
            })
          })
        })
      } as any);
      const tempCardano = new Cardano('mainnet', mockConfig, 100, {} as any);
      jest.spyOn(tempCardano as any, 'fromRaw').mockReturnValue('1');
      console.log('im here')
      const result = await tempCardano['estimateFee']({} as any, { asset: 'asset' } as any)
      console.log(result)
      expect(result).toEqual('4.5')
      expect(tempCardano['fromRaw']).toHaveBeenCalledTimes(3);
      expect(tempCardano['_dex'].api.getSplashOperationConfig).toHaveBeenCalledTimes(1);
      expect(tempCardano['_dex'].newTx).toHaveBeenCalledTimes(1);
      expect(tempCardano['_dex'].newTx().spotOrder).toHaveBeenCalledTimes(1);
      expect(tempCardano['_dex'].newTx().spotOrder).toHaveBeenCalledWith({
        input: {},
        outputAsset: { asset: 'asset' },
      });
      expect(tempCardano['_dex'].newTx().spotOrder().complete).toHaveBeenCalledTimes(1);
    })
    it('Should throw an error when getProtocolParams fails', async () => {
      jest.spyOn(utils, 'getSplashInstance').mockReturnValue({
        newTx: jest.fn().mockReturnValue(undefined),
      } as any);
      const tempCardano = new Cardano('mainnet', mockConfig, 100, {} as any);
      await expect(
        tempCardano['estimateFee']({} as any, { asset: 'asset' } as any)
      ).rejects.toThrow("Failed to the estimate the fee TypeError: Cannot read properties of undefined (reading 'spotOrder')");
    })
  })

  describe('estimate', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    it('Should be defined', () => {
      expect(cardano['estimate']).toBeDefined();
    });
    it('Should throw an error when baseMetadata or quoteMetadata is undefined', async () => {
      jest.spyOn(cardano as any, 'validateTokens').mockReturnValue([
        baseToken,
        quoteToken
      ]);
      jest.spyOn(utils, 'getTokenMetadata').mockResolvedValueOnce(null);
      jest.spyOn(utils, 'getTokenMetadata').mockResolvedValueOnce(quoteToken);
      await expect(cardano.estimate('baseToken', 'quoteToken', BigNumber(1), true)).rejects.toThrow(`Couldn't find the tokens metadata, try a verified token`);
    })
    it('Should call createPriceResponse function with the correct parameters', async () => {
      jest.spyOn(cardano as any, 'validateTokens').mockReturnValue([
        baseToken,
        quoteToken
      ]);
      jest.spyOn(utils, 'updateTokenMetadata').mockReturnValueOnce(baseToken);
      jest.spyOn(utils, 'updateTokenMetadata').mockReturnValueOnce(quoteToken);
      jest.spyOn(utils, 'getTokenMetadata').mockResolvedValueOnce(baseToken);
      jest.spyOn(utils, 'getTokenMetadata').mockResolvedValueOnce(quoteToken);
      jest.spyOn(cardano as any, 'createPriceResponse').mockReturnValue('priceResponse');
      expect(await cardano.estimate('baseToken', 'quoteToken', BigNumber(1), true, '1')).toEqual('priceResponse');
      expect(cardano['createPriceResponse']).toHaveBeenCalledTimes(1);
      expect(cardano['createPriceResponse']).toHaveBeenCalledWith(baseToken, quoteToken, BigNumber(1), true, '1');
      expect(cardano['validateTokens']).toHaveBeenCalledWith('BASETOKEN', 'QUOTETOKEN');
      expect(utils.getTokenMetadata).toHaveBeenCalledTimes(2);
      expect(utils.getTokenMetadata).toHaveBeenCalledWith(baseToken.policyId, baseToken.token.asset.nameBase16, cardano['_node']);
      expect(utils.getTokenMetadata).toHaveBeenCalledWith(quoteToken.policyId, quoteToken.token.asset.nameBase16, cardano['_node']);
      expect(utils.updateTokenMetadata).toHaveBeenCalledTimes(2);
      expect(utils.updateTokenMetadata).toHaveBeenCalledWith(baseToken, baseToken);
      expect(utils.updateTokenMetadata).toHaveBeenCalledWith(quoteToken, quoteToken);
    })
  })

  describe('findToken', () => {
    it('Should be defined', () => {
      expect(cardano['findToken']).toBeDefined();
    });
    it('Should return token if token is found', () => {
      cardano['_assetMap'] = {
        'base': baseToken
      }
      expect(cardano['findToken']('base')).toEqual(baseToken);
    });
    it('Should return undefined if token is not found', () => {
      expect(cardano['findToken']('invalidToken')).toBeUndefined();
    });
  })
  describe('getBlockTimestamp', () => {
    it('Should be defined', () => {
      expect(cardano['getBlockTimestamp']).toBeDefined();
    });
    it('Should return the timestamp of the block', async () => {
      jest.spyOn(cardano, 'getNetworkHeight').mockResolvedValue(1);
      const result = await cardano['getBlockTimestamp']();
      expect(result).toEqual(123456789);
      expect(cardano['_node'].blocks.blockInfo).toHaveBeenCalledWith('1');
    });
  })

  describe('signAndSubmitTransaction', () => {
    it('Should be defined', () => {
      expect(cardano['signAndSubmitTransaction']).toBeDefined();
    });
    it('Should call sign and submit transaction', async () => {
      jest.spyOn(utils, 'getSplashInstance').mockReturnValue({
        explorer: {
          submitTx: jest.fn().mockResolvedValue('txHash')
        },
        sign: jest.fn().mockResolvedValue({
          cbor: 'cbor'
        })
      } as any);

      const tempCardano = new Cardano('mainnet', mockConfig, 100, {} as any);
      const tx = {
        sign: jest.fn().mockResolvedValue({
          cbor: 'cbor',
        })
      } as any;
      const result = await tempCardano['signAndSubmitTransaction'](tx);
      expect(result).toEqual('txHash');
      expect(tempCardano['_dex'].explorer.submitTx).toHaveBeenCalledTimes(1);
      expect(tempCardano['_dex'].explorer.submitTx).toHaveBeenCalledWith('cbor');
    });
    it('Should throw an error when sign fails', async () => {
      const tx = {
        sign: jest.fn().mockRejectedValue(new Error('sign error'))
      } as any;
      await expect(cardano['signAndSubmitTransaction'](tx)).rejects.toThrow('Error while signing and submitting the transaction: \n Error: sign error');
    });
  })

  describe('createTradeResponse', () => {
    it('Should be defined', () => {
      expect(cardano['createTradeResponse']).toBeDefined();
    });
    it('Should create trade response correctly', async () => {
      jest.spyOn(cardano as any, 'getBlockTimestamp').mockResolvedValue(123456789);
      jest.spyOn(cardano as any, 'toRaw').mockReturnValue('0.5');
      const result = await cardano['createTradeResponse']({
        policyId: 'basePolicy',
        name: 'baseToken',
        symbol: 'baseToken',
        decimals: 6,
      } as any, {
        policyId: 'quotePolicy',
        name: 'quoteToken',
        symbol: 'quoteToken',
        decimals: 3,
      } as any, BigNumber(1), '0.005', BigNumber(1), true, '0.5', 'txHash');

      expect(result).toEqual({
        network: 'mainnet',
        timestamp: 123456789,
        latency: 0,
        base: 'baseToken',
        quote: 'quoteToken',
        amount: '1',
        rawAmount: '0.5',
        expectedOut: '1',
        price: '0.005',
        gasPrice: 100,
        gasPriceToken: 'ADA',
        gasLimit: 100,
        gasCost: '0.5',
        txHash: 'txHash',
      });
      expect(cardano['getBlockTimestamp']).toHaveBeenCalledTimes(1);
      expect(cardano['toRaw']).toHaveBeenCalledTimes(1);
      expect(cardano['toRaw']).toHaveBeenCalledWith(BigNumber(1), 6);
    })
  })

  describe('createPriceResponse', () => {
    it('Should be defined', () => {
      expect(cardano['createPriceResponse']).toBeDefined();
    });
    it('Should create price response correctly', async () => {
      jest.spyOn(cardano as any, 'getBlockTimestamp').mockResolvedValue(123456789);
      jest.spyOn(cardano, 'calculateMinOutput').mockReturnValue(BigNumber(1));
      jest.spyOn(cardano as any, 'getPrice').mockResolvedValue({ raw: '5', formatted: '1' });
      jest.spyOn(cardano as any, 'toRaw').mockReturnValue('5');

      // estimatedFee is not provided in the arguments so it should be provided by the estimateFee function
      jest.spyOn(cardano, 'estimateFee').mockResolvedValue('3');

      const result = await cardano['createPriceResponse'](baseToken, quoteToken, BigNumber(1), true, '5', '100');
      expect(result).toEqual({
        base: 'baseToken',
        quote: 'quoteToken',
        amount: '1',
        rawAmount: '5',
        expectedAmount: '1',
        price: "0.005",
        network: 'mainnet',
        timestamp: 123456789,
        latency: 0,
        gasPrice: 100,
        gasPriceToken: 'ADA',
        gasLimit: 100,
        gasCost: '3',
      });
      expect(cardano['toRaw']).toHaveBeenCalledTimes(2);
      expect(cardano['toRaw']).toHaveBeenCalledWith(BigNumber(1), 6);
      expect(cardano['estimateFee']).toHaveBeenCalledTimes(1);
      expect(cardano['estimateFee']).toHaveBeenCalledWith(1, quoteToken.token.asset);
      expect(cardano['calculateMinOutput']).toHaveBeenCalledTimes(1);
      expect(cardano['calculateMinOutput']).toHaveBeenCalledWith(BigNumber(1), BigNumber('0.005'), 5);
      expect(cardano['getPrice']).toHaveBeenCalledTimes(1);
      expect(cardano['getPrice']).toHaveBeenCalledWith(baseToken, quoteToken, true, BigNumber(1), '100');
    })
  })

  describe('calculateMinOutput', () => {
    it('Should be defined', () => {
      expect(cardano['calculateMinOutput']).toBeDefined();
    });
    it('Should calculate min output correctly', () => {
      const result = cardano['calculateMinOutput'](BigNumber(1), BigNumber('0.005'), 5);
      expect(result).toEqual(BigNumber(190));
    })
  })

  describe('fromRaw', () => {
    it('Should be defined', () => {
      expect(cardano['fromRaw']).toBeDefined();
    });
    it('should correctly convert raw amounts with decimals', () => {
      const result = cardano['fromRaw'](BigNumber('1000000'), 6);
      expect(result).toEqual('1');
    })
  });
  describe('toRaw', () => {
    it('Should be defined', () => {
      expect(cardano['toRaw']).toBeDefined();
    });
    it('should correctly convert amounts to raw amounts', () => {
      const result = cardano['toRaw'](BigNumber(1), 6);
      expect(result).toEqual('1000000');
    })
  })
  describe('getPrice', () => {
    it('Should be defined', () => {
      expect(cardano['getPrice']).toBeDefined();
    });
    it('Should return the price when priceLimit is declared', async () => {
      const result = await cardano['getPrice'](baseToken, quoteToken, true, BigNumber(1), '5');
      expect(result).toEqual('price');
      expect(Price.new).toHaveBeenCalledWith({
        base: baseToken.token.asset, quote: quoteToken.token.asset, value: '5'
      })
    });
    it('Should handle the case when any error occurs', async () => {
      jest.spyOn(utils, 'getSplashInstance').mockReturnValue({
        api: {
          getOrderBook: jest.fn().mockRejectedValue(new Error('error'))
        }
      } as any);
      const tempCardano = new Cardano('mainnet', mockConfig, 100, {} as any);
      await expect(tempCardano['getPrice'](baseToken, quoteToken, true, BigNumber(1))).rejects.toThrow('Failed to fetch the estimate the price Error: error');
    });
    it('Should return the price when priceLimit is not declared', async () => {
      jest.spyOn(utils, 'getSplashInstance').mockReturnValue({
        api: {
          getOrderBook: jest.fn().mockResolvedValue({}) // {} as order book
        }
      } as any);
      const tempCardano = new Cardano('mainnet', mockConfig, 100, {} as any);
      expect(await tempCardano['getPrice'](baseToken, quoteToken, true, BigNumber(1))).toEqual('priceWithNoPriceLimit');
      expect(tempCardano['_dex'].api.getOrderBook).toHaveBeenCalledTimes(1);
      expect(tempCardano['_dex'].api.getOrderBook).toHaveBeenCalledWith({ base: baseToken.token.asset, quote: quoteToken.token.asset });
      expect(Price.new).toHaveBeenCalledTimes(0);
      expect(selectEstimatedPrice).toHaveBeenCalledTimes(1);
      expect(selectEstimatedPrice).toHaveBeenCalledWith({ orderBook: {}, input: 1, priceType: 'average' });
    })
  })
  describe('getPoolByPair', () => {
    afterEach(() => {
      jest.clearAllMocks();
    })
    it('Should be defined', () => {
      expect(cardano['getPoolByPair']).toBeDefined();
    });
    it('Should return the pool by pair', () => {
      jest.spyOn(cardano as any, 'validateTokens').mockReturnValue([baseToken, quoteToken]);
      jest.spyOn(utils, 'getNftBase16Names').mockReturnValue({ baseToQuote: 'ADA-SPLASH', quoteToBase: 'SPLASH-ADA' });
      cardano['_splashPools']['ADA-SPLASH'] = ['pool'] as any; // Mock the pool
      const result = cardano['getPoolByPair']('ada', 'splash');
      expect(result).toEqual(['pool']);
      expect(cardano['validateTokens']).toHaveBeenCalledTimes(1);
      expect(cardano['validateTokens']).toHaveBeenCalledWith('ADA', 'SPLASH');
      expect(utils.getNftBase16Names).toHaveBeenCalledTimes(1);
      expect(utils.getNftBase16Names).toHaveBeenCalledWith('546f6b656e58', '341f3b656e34');
    })
    it('should throw an error when the pool is not found', () => {
      jest.spyOn(cardano as any, 'validateTokens').mockReturnValue([baseToken, quoteToken]);
      jest.spyOn(utils, 'getNftBase16Names').mockReturnValue({ baseToQuote: 'ADA-SPLASH', quoteToBase: 'SPLASH-ADA' });
      expect(() => cardano['getPoolByPair']('ada', 'splash')).toThrow('pool not found');
    })
  })
  describe('fetchLatestPoolByToken', () => {
    it('Should be defined', () => {
      expect(cardano['fetchLatestPoolByToken']).toBeDefined();
    })
    it('Should return the latest pool by token', async () => {
      jest.spyOn(utils, 'getSplashPools').mockResolvedValue({})
      jest.spyOn(cardano, 'getPoolByPair').mockReturnValue(['pool'] as any);
      expect(await cardano['fetchLatestPoolByToken']('x', 'y')).toEqual(['pool']);
      expect(utils.getSplashPools).toHaveBeenCalledTimes(1);
      expect(cardano['getPoolByPair']).toHaveBeenCalledTimes(1);
      expect(cardano['getPoolByPair']).toHaveBeenCalledWith('x', 'y');
    })
  })
  describe('getTx', () => {
    it('Should be defined', () => {
      expect(cardano['getTx']).toBeDefined();
    });
    it('Should return the transaction data', async () => {
      const result = await cardano['getTx']('txHash');
      expect(result).toEqual('txData');
    })
  })
  describe('getAddressTxs', () => {
    it('Should be defined', () => {
      expect(cardano['getAddressTxs']).toBeDefined();
    });
    it('Should return the address transactions', async () => {
      const result = await cardano['getAddressTxs']('address');
      expect(result).toEqual([]);
    })
  })
  describe('getTxState', () => {
    it('Should be defined', () => {
      expect(cardano['getTxState']).toBeDefined();
    })
    it('Should return the transaction state', async () => {
      const result = await cardano['getTxState']('txHash');
      expect(result).toEqual('txManagerState');
    })
  })
})
