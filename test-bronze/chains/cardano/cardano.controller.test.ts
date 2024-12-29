// import { CardanoController } from '../../../src/chains/cardano/cardano.controller';
import { Cardano } from '../../../src/chains/cardano/cardano';
import { CardanoController } from '../../../src/chains/cardano/cardano.controller';
import * as utils from '../../../src/chains/cardano/cardano.utils';
import { BigNumber } from 'bignumber.js';

jest.mock('@maestro-org/typescript-sdk', () => ({
  MaestroClient: jest.fn(),
}));

describe('CardanoController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  })
  jest.spyOn(utils, 'getMaestroConfig').mockReturnValue({} as any);
  jest.spyOn(utils, 'getSplashInstance').mockReturnValue({} as any);
  const cardano = new Cardano(
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

  it('Should be defined', () => {

    expect(CardanoController).toBeDefined();
  });
  describe('balances', () => {
    beforeEach(() => {
      jest.spyOn(cardano, 'ready').mockReturnValue(true);
      jest.spyOn(cardano, 'init').mockResolvedValue();
      jest.spyOn(cardano, 'getAddressUtxos').mockResolvedValue([]);
      jest.spyOn(cardano, 'getBalance').mockReturnValue({
        balance: BigNumber(1),
        assets: {},
      });
    })
    it('should be defined', () => {
      expect(CardanoController.balances).toBeDefined();
    });
    it('should be a function', () => {
      expect(typeof CardanoController.balances).toBe('function');
    })
    it('Should call init if not ready', async () => {
      jest.spyOn(utils, 'getMaestroConfig').mockReturnValue({} as any);
      jest.spyOn(utils, 'getSplashInstance').mockReturnValue({} as any);
      jest.spyOn(cardano, 'ready').mockReturnValue(false);
      // jest.spyOn(chain, 'init').mockResolvedValue();
      await CardanoController.balances(cardano, {
        address: 'address',
        privateKey: 'privateKey',
        chain: '',
        network: ''
      });
      expect(cardano.init).toHaveBeenCalled();
    });
    it('Should call getAddressUtxos & getBalance with correct parameters', async () => {
      await CardanoController.balances(cardano, {
        address: 'address',
        privateKey: 'privateKey',
        chain: '',
        network: ''
      });
      expect(cardano.init).not.toHaveBeenCalled();
      expect(cardano.getBalance).toHaveBeenCalledWith([]);
      expect(cardano.getAddressUtxos).toHaveBeenCalledWith('address');
    })
    it('should return correct response', async () => {
      jest.spyOn(cardano, 'getBalance').mockReturnValue({
        balance: BigNumber(1),
        assets: {
          'USDT': new BigNumber(100),
          'SPLASH': new BigNumber(200),
        },
      });
      const response = await CardanoController.balances(cardano, {
        address: 'address',
        privateKey: '',
        chain: '',
        network: ''
      });
      expect(response).toEqual({
        network: 'mainnet',
        timestamp: expect.any(Number),
        latency: 0,
        balances: {
          ADA: '1',
          USDT: '100',
          SPLASH: '200',
        }
      })
    });
  });
});
