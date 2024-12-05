import { Cardano } from '../../../src/chains/cardano/cardano';
import * as node from '../../../src/chains/cardano/cardano.utils';
import * as config from '../../../src/chains/cardano/cardano.config';
import { isOOROrder } from '@splashprotocol/sdk';
jest.mock('@maestro-org/typescript-sdk', () => ({
  MaestroClient: jest.fn().mockImplementation(() => ({
    general: {
      chainTip: jest.fn().mockResolvedValue({
        data: {
          height: 12345,
        },
      }),
    },
  })),
}));
jest.mock('@splashprotocol/sdk', () => ({
  isOOROrder: jest.fn(),
  stringToHex: jest.fn(),
}));
let cardano: Cardano;

describe('Cardano', () => {
  const mockConfig: any = {
    network: {
      name: 'name',
      nodeURL: 'nodeURL',
      maxLRUCacheInstances: 100,
      utxosLimit: 100,
      defaultSlippage: '0.1',
    },
  };
  const network = 'mainnet';
  beforeEach(() => {
    jest.spyOn(node, 'getMaestroConfig').mockReturnValue({} as any);
    jest.spyOn(node, 'getSplashInstance').mockReturnValue({} as any);
    cardano = new Cardano('mainnet', mockConfig, 100, {} as any);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('Should be defined', () => {
    expect(cardano).toBeDefined();
  });

  it('Should call getMaestroConfig and getSplashInstance with the correct parameters when instantiating', () => {
    expect(node.getMaestroConfig).toHaveBeenCalledWith('Mainnet', 'nodeURL');
    expect(node.getSplashInstance).toHaveBeenCalledWith('Mainnet');
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

  // describe('loadTokenMetadata', () => {
  //   it('Should be defined', () => {
  //     expect(cardano['loadTokenMetadata']).toBeDefined();
  //   });
  //   it('should throw an error if _assetMap is an empty object', async () => {
  //     // Arrange
  //     jest.spyOn(console, 'error').mockReturnValue({} as any);
  //     cardano['_assetMap'] = {};
  //     // Act
  //     await cardano['loadTokenMetadata']();
  //     // Assert
  //     expect(console.error).toHaveBeenCalledWith('try to re-init the object !');
  //   });
  // });

  describe('getInstance', () => {
    it('Should be defined', () => {
      expect(Cardano.getInstance).toBeDefined();
    });
    it('should create a new Cardano instance if it does not exist in the cache', () => {
      // Arrange
      jest.spyOn(config, 'getCardanoConfig').mockReturnValue(mockConfig);
      // Act
      const cardanoInstance = Cardano.getInstance(network);
      expect(config.getCardanoConfig).toHaveBeenCalledWith(network);
      expect(cardanoInstance).toBeDefined();
    });

    it('should return an existing Cardano instance from the cache', () => {
      // Arrange
      const cachedInstance = new Cardano(network, mockConfig, 1, {});
      // Act
      const cardanoInstance = Cardano.getInstance(network);
      // Assert
      expect(JSON.stringify(cardanoInstance)).toBe(
        JSON.stringify(cachedInstance),
      );
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
  describe('getCurrentBlockNumber', () => {
    it('Should be defined', () => {
      expect(cardano.getCurrentBlockNumber).toBeDefined();
    });
    it('Shopuld return the Network height', async () => {
      jest.spyOn(cardano, 'getNetworkHeight').mockResolvedValue(123);
      expect(await cardano.getCurrentBlockNumber()).toEqual(124);
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
      jest.spyOn(node, 'getTokenMetadata').mockResolvedValue(null);

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
        .spyOn(node, 'getTokenMetadata')
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
});
