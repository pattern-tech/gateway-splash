import * as utils from '../../../src/chains/cardano/cardano.utils';
import { Configuration as MaestroConfig } from '@maestro-org/typescript-sdk';
import {
  SplashBuilder,
  MaestroExplorer,
  Currency,
} from '@splashprotocol/sdk';

// SET ``` NODE_OPTIONS=--experimental-vm-modules ``` in package.json to run cardano.utils.ts tests

jest.mock('@maestro-org/typescript-sdk', () => {
  return {
    __esModule: true,
    Configuration: jest.fn().mockReturnValue({})
  };
});
jest.mock('@splashprotocol/sdk', () => {
  return {
    SplashBuilder: jest.fn().mockReturnValue({} as any),
    SplashApi: jest.fn().mockReturnValue({} as any),
    MaestroExplorer: {
      new: jest.fn().mockReturnValue({})
    },
    Currency: {
      ada: jest.fn().mockReturnValue({
        asset: {
          name: 'ADA',
          policyId: '',
          nameBase16: '414441',
        },
      })
    }
  };
});
describe('getMaestroConfig', () => {
  it('Should be defined', () => {
    expect(utils.getMaestroConfig).toBeDefined();
  });
  it('Should be a function', () => {
    expect(typeof utils.getMaestroConfig).toBe('function');
  });
  it('Should return a MaestroConfig object', () => {
    const result = utils.getMaestroConfig('Mainnet', 'url', 'apiKey');
    expect(result).toEqual({})
    expect(MaestroConfig).toHaveBeenCalledWith({
      apiKey: 'apiKey',
      baseUrl: 'url',
      network: 'Mainnet',
    });
  })
})
describe('getSplashInstance', () => {
  it('Should be defined', () => {
    expect(utils.getSplashInstance).toBeDefined();
  });
  it('Should be a function', () => {
    expect(typeof utils.getSplashInstance).toBe('function');
  });
  it('Should return a SplashInstance object', () => {
    const result = utils.getSplashInstance('Mainnet', 'apiKey');
    expect(result).toEqual({})
    expect(MaestroExplorer.new).toHaveBeenCalledWith('mainnet', 'apiKey');
    expect(SplashBuilder).toHaveBeenCalledWith({}, {});
  })
})

describe('getAssetsFromPools', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  const mockAdaCurrency = {
    asset: {
      name: 'ADA',
      policyId: '',
      nameBase16: '414441',
    },
  };
  it('Should be defined', () => {
    expect(utils.getAssetsFromPools).toBeDefined();
  });
  it('Should be a function', () => {
    expect(typeof utils.getAssetsFromPools).toBe('function');
  });
  it('should return tokens with only ADA when splashPools is empty', () => {
    // Arrange
    const splashPools = {};

    // Act
    const tokens = utils.getAssetsFromPools(splashPools);

    // Assert
    expect(Currency.ada).toHaveBeenCalledTimes(1);
    expect(tokens).toHaveProperty('ADA');
    expect(Object.keys(tokens)).toHaveLength(1);
    expect(tokens['ADA']).toEqual({
      token: mockAdaCurrency,
      policyId: '',
      decimals: 6,
      name: 'ADA',
      symbol: 'ADA',
      nameBase16: '414441',
    });
  });
  it('should include ADA and additional tokens from pools', () => {
    // Arrange
    const mockTokenX = {
      asset: {
        name: 'TokenX',
        policyId: 'policy123',
        nameBase16: '546f6b656e58',
      },
    };

    const mockTokenY = {
      asset: {
        name: 'TokenY',
        policyId: 'policy456',
        nameBase16: '546f6b656e59',
      },
    };

    const splashPools = {
      pool1: [
        {
          x: mockTokenX as Currency,
          y: mockAdaCurrency as Currency,
        },
        {
          x: mockAdaCurrency as Currency,
          y: mockTokenY as Currency,
        },
      ],
    } as any;

    // Act
    const tokens = utils.getAssetsFromPools(splashPools);

    // Assert
    expect(Currency.ada).toHaveBeenCalledTimes(1);
    expect(tokens).toHaveProperty('ADA');
    expect(tokens).toHaveProperty('TOKENX');
    expect(tokens).toHaveProperty('TOKENY');
    expect(Object.keys(tokens)).toHaveLength(3);

    // Verify ADA token
    expect(tokens['ADA']).toEqual({
      token: mockAdaCurrency,
      policyId: '',
      decimals: 6,
      name: 'ADA',
      symbol: 'ADA',
      nameBase16: '414441',
    });

    // Verify TokenX
    expect(tokens['TOKENX']).toEqual({
      token: mockTokenX,
      policyId: 'policy123',
      decimals: 1,
      name: 'TOKENX',
      symbol: 'TOKENX',
      nameBase16: '546f6b656e58',
      splashSupport: true,
    });

    // Verify TokenY
    expect(tokens['TOKENY']).toEqual({
      token: mockTokenY,
      policyId: 'policy456',
      decimals: 1,
      name: 'TOKENY',
      symbol: 'TOKENY',
      nameBase16: '546f6b656e59',
      splashSupport: true,
    });
  });
})