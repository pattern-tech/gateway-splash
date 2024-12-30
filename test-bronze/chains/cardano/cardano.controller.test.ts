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
  it('should be defined', () => {
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
    it('should call init if not ready', async () => {
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
    it('should call getAddressUtxos & getBalance with correct parameters', async () => {
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

  describe('getTokens', () => {
    it('should be defined', () => {
      expect(CardanoController.getTokens).toBeDefined();
    });
    it('should be a function', () => {
      expect(typeof CardanoController.getTokens).toBe('function');
    })
    it('should return tokens with proper structure when cardano is ready', async () => {
      jest.spyOn(cardano, 'ready').mockReturnValue(true);
      jest.spyOn(cardano, 'storedAssetList', 'get').mockReturnValue([
        { decimals: 18, name: 'USDT' },
        { decimals: 6, name: 'SPLASH' },
      ] as any);

      const response = await CardanoController.getTokens(cardano, {});
      expect(response.assets).toHaveLength(2);
      expect(response.assets[0]).toEqual({
        decimals: 18,
        name: 'USDT',
        symbol: 'USDT',
      });
      expect(response.assets[1]).toEqual({
        decimals: 6,
        name: 'SPLASH',
        symbol: 'SPLASH',
      });
    });
    it('should initialize cardano if not ready', async () => {
      jest.spyOn(cardano, 'ready').mockReturnValue(false);
      await CardanoController.getTokens(cardano, {});
      expect(cardano.init).toHaveBeenCalledTimes(1);
    });
    it('should return empty asset list if storedAssetList is empty', async () => {
      jest.spyOn(cardano, 'storedAssetList', 'get').mockReturnValue([]);
      const response = await CardanoController.getTokens(cardano, {});
      expect(response.assets).toHaveLength(0);
    });
  });

  describe('allowances', () => {
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
      expect(CardanoController.allowances).toBeDefined();
    });
    it('should be a function', () => {
      expect(typeof CardanoController.allowances).toBe('function');
    })
    it('should call init if not ready', async () => {
      jest.spyOn(utils, 'getMaestroConfig').mockReturnValue({} as any);
      jest.spyOn(utils, 'getSplashInstance').mockReturnValue({} as any);
      jest.spyOn(cardano, 'ready').mockReturnValue(false);
      await CardanoController.allowances(cardano, {
        address: 'address',
        spender: 'spender',
        tokenSymbols: [],
        chain: '',
        network: ''
      });
      expect(cardano.init).toHaveBeenCalled();
    });
    it('should call getAddressUtxos & getBalance with correct parameters', async () => {
      await CardanoController.allowances(cardano, {
        address: 'address',
        spender: 'spender',
        tokenSymbols: [],
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
      const response = await CardanoController.allowances(cardano, {
        address: 'address',
        spender: 'spender',
        tokenSymbols: [],
        chain: '',
        network: ''
      });
      expect(response).toEqual({
        network: 'mainnet',
        timestamp: expect.any(Number),
        latency: 0,
        spender: 'spender',
        approvals: {
          ADA: '1',
          USDT: '100',
          SPLASH: '200',
        }
      })
    });
  })
  describe('poll', () => {
    beforeEach(() => {
      jest.spyOn(cardano, 'ready').mockReturnValue(true);
      jest.spyOn(cardano, 'init').mockResolvedValue();
      jest.spyOn(cardano, 'getTx').mockResolvedValue(undefined);
    })
    it('should be defined', () => {
      expect(CardanoController.poll).toBeDefined();
    });
    it('should be a function', () => {
      expect(typeof CardanoController.poll).toBe('function');
    });
    it('should initialize cardano if not ready', async () => {
      jest.spyOn(cardano, 'ready').mockReturnValue(false);
      await CardanoController.poll(cardano, { txHash: 'txHash' });
      expect(cardano.init).toHaveBeenCalledTimes(1);
    });
    it('should return default response when transaction is not found', async () => {
      const response = await CardanoController.poll(cardano, { txHash: 'txHash' });
      expect(response).toEqual({
        id: '',
        inputs: [],
        dataInputs: [],
        outputs: [],
        size: 0,
        currentBlock: 0,
        txBlock: 0,
        txHash: '',
        fee: 0,
      });
    });

    it('should return transaction details when transaction is found', async () => {
      jest.spyOn(cardano, 'getTx').mockResolvedValue({
        tx_hash: 'txHash',
        block_height: 100,
        fee: 200,
        inputs: [],
        dataInputs: [],
        outputs: [],
      } as any);
      const response: any = await CardanoController.poll(cardano, { txHash: 'txHash' });
      expect(response).toEqual({
        tx_hash: 'txHash',
        block_height: 100,
        fee: 200,
        inputs: [],
        dataInputs: [],
        outputs: [],
        currentBlock: 100,
        txBlock: 100,
        txHash: 'txHash'
      })
    });
  })
})
