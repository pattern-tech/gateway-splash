import { Cardano } from '../../../src/chains/cardano/cardano';
import * as node from '../../../src/chains/cardano/cardano.utils';
import * as config from '../../../src/chains/cardano/cardano.config';

jest.mock('@maestro-org/typescript-sdk', () => ({
  MaestroClient: jest.fn(),
}));
let cardano: Cardano;

describe('Cardano', () => {
  beforeAll(() => {
    jest.spyOn(node, 'getMaestroConfig').mockReturnValue({} as any);
    jest.spyOn(node, 'getSplashInstance').mockReturnValue({} as any);
    cardano = new Cardano(
      'mainnet',
      {
        network: {
          nodeURL: 'nodeURL',
          utxosLimit: 'utxosLimit',
          defaultSlippage: 'defaultSlippage',
        },
      } as any,
      100,
      {} as any,
    );
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
      expect(config.getCardanoConfig).toHaveBeenCalledWith(network);
      expect(cardanoInstance).toEqual(cachedInstance);
    });
  });
});
