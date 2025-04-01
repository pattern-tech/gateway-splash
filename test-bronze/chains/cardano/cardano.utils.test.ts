import * as utils from '../../../src/chains/cardano/cardano.utils';
import { MaestroClient, Configuration as MaestroConfig } from '@maestro-org/typescript-sdk';
import {
  SplashBuilder,
  MaestroExplorer,
  Currency,
} from '@splashprotocol/sdk';
import { SplashPool } from '../../../src/chains/cardano/types/cardano.types';


jest.mock('@maestro-org/typescript-sdk', () => {
  return {
    Configuration: jest.fn().mockReturnValue({}),
    MaestroClient: jest.fn().mockReturnValue({
      assets: {
        assetInfo: jest.fn().mockResolvedValue({
          data: {
            token_registry_metadata: {
              decimals: 6,
              description: '',
              logo: '',
              name: 'TokenX',
              ticker: 'TokenX',
              url: '',
            }
          }
        }),
      }
    })
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
jest.mock('crypto-js', () => {
  return {
    sha256: {
      sha256: jest.fn(),
    },
    enc: {
      Hex: {
        stringify: jest.fn().mockReturnValue('5f4dcc3b5aa765d61d8327deb882cf99'),
      },
    },
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

describe('getNftBase16Names', () => {
  it('Should be defined', () => {
    expect(utils.getNftBase16Names).toBeDefined();
  });
  it('Should be a function', () => {
    expect(typeof utils.getNftBase16Names).toBe('function');
  });
  it('should correctly concatenate baseName16 and quoteName16 to form baseToQuote and quoteToBase', () => {
    const baseName16 = '414441'; // 'ADA' in hex
    const quoteName16 = '546f6b656e58'; // 'TokenX' in hex

    const expected = {
      baseToQuote: '4144415f546f6b656e585f4e4654',
      quoteToBase: '546f6b656e585f4144415f4e4654',
    };
    const result = utils.getNftBase16Names(baseName16, quoteName16);
    expect(result).toEqual(expected);
  })
})

describe('getTokenMetadata', () => {
  const policyId = 'policy123';
  const base16Name = '546f6b656e58';
  const mockedMaestroClient = new MaestroClient({} as any);
  afterEach(() => {
    jest.clearAllMocks()
  })
  it('Should be defined', () => {
    expect(utils.getTokenMetadata).toBeDefined();
  });
  it('Should be a function', () => {
    expect(typeof utils.getTokenMetadata).toBe('function');
  });
  it('should return metadata if base16Name is "414441"', async () => {
    const policyId = 'policy123';
    const base16Name = '414441';
    const result = await utils.getTokenMetadata(null, policyId, base16Name
      , {} as any);
    expect(result).toEqual({
      decimals: 6,
      description: '',
      logo: '',
      name: 'ADA',
      ticker: 'ADA',
      url: '',
    });
  });
  it('should call assetInfo if base16Name is not "414441"', async () => {
    const result = await utils.getTokenMetadata(null, policyId, base16Name
      , mockedMaestroClient);
    expect(result).toEqual({
      decimals: 6,
      description: '',
      logo: '',
      name: 'TokenX',
      ticker: 'TokenX',
      url: '',
    });
  });
  it('should return undefined if assetInfo throws an error', async () => {
    jest.spyOn(mockedMaestroClient.assets, 'assetInfo').mockRejectedValue(new Error('test error'));
    const result = await utils.getTokenMetadata(null, policyId, base16Name
      , mockedMaestroClient);
    expect(result).toBeUndefined();
  });
  it('should return current metadata if exists and decimals is less than or equal 1', async () => {
    const current_metadata = {
      decimals: 0,
      description: 'current metadata',
      logo: 'currentMetadataLogo',
      name: 'current_metadata',
      ticker: 'current_metadata',
      url: 'current_metadata.com'
    }
    const result = await utils.getTokenMetadata(current_metadata, policyId, base16Name
      , mockedMaestroClient);
    expect(result).toEqual(current_metadata);
  });
});

describe('getTokenMetadataWithBackoff', () => {
  const mockedMaestroClient = new MaestroClient({} as any);
  const mockTokenX = {
    asset: {
      name: 'TokenX',
      policyId: 'policy123',
      nameBase16: '546f6b656e58',
    },
  } as any;

  const mockTokenY = {
    asset: {
      name: 'TokenY',
      policyId: 'policy456',
      nameBase16: '546f6b656e59',
    },
  };
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('Should be defined', () => {
    expect(utils.getTokenMetadataWithBackoff).toBeDefined();
  })
  it('Should be a function', () => {
    expect(typeof utils.getTokenMetadataWithBackoff).toBe('function');
  });
  it('should fetch metadata for all tokens successfully', async () => {
    const tokens = [
      {
        token: mockTokenX,
        policyId: 'policy123',
        decimals: 6,
        name: 'TokenX',
        symbol: 'TokenX',
        nameBase16: '546f6b656e58',
      },
      {
        token: mockTokenY,
        policyId: 'policy456',
        decimals: 6,
        name: 'TokenY',
        symbol: 'TokenY',
        nameBase16: '546f6b656e59',
      },
      {
        token: {
          asset: {
            name: 'ADA',
            policyId: '',
            nameBase16: '414441',
          },
        },
        policyId: '',
        decimals: 6,
        name: 'ADA',
        symbol: 'ADA',
        nameBase16: '414441',
      },
    ];
    jest.spyOn(mockedMaestroClient.assets, 'assetInfo').mockResolvedValueOnce({
      data: {
        token_registry_metadata: {
          decimals: 6,
          description: '',
          logo: '',
          name: 'TokenX',
          ticker: 'TokenX',
          url: '',
        }
      }
    } as any);
    jest.spyOn(mockedMaestroClient.assets, 'assetInfo').mockResolvedValueOnce({
      data: {
        token_registry_metadata: {
          decimals: 6,
          description: '',
          logo: '',
          name: 'TOKENY',
          ticker: 'TOKENY',
          url: '',
        }
      }
    } as any);

    const result = await utils.getTokenMetadataWithBackoff(tokens, mockedMaestroClient);

    expect(mockedMaestroClient.assets.assetInfo).toHaveBeenCalledTimes(2);
    expect(mockedMaestroClient.assets.assetInfo).toHaveBeenCalledWith('policy123546f6b656e58');
    expect(mockedMaestroClient.assets.assetInfo).toHaveBeenCalledWith('policy456546f6b656e59');

    expect(result.get('TOKENX')).toEqual({
      decimals: 6,
      description: '',
      logo: '',
      name: 'TokenX',
      ticker: 'TokenX',
      url: '',
    });
    expect(result.get('TOKENY')).toEqual({
      decimals: 6,
      description: '',
      logo: '',
      name: 'TOKENY',
      ticker: 'TOKENY',
      url: '',
    });
  });
  it('should log error and retry fetching metadata on unexpected error', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const tokens = [
      {
        token: mockTokenX,
        policyId: 'policy123',
        decimals: 6,
        name: 'TokenX',
        symbol: 'TokenX',
        nameBase16: '546f6b656e58',
      } as any,
    ];

    jest.spyOn(mockedMaestroClient.assets, 'assetInfo')
      .mockRejectedValueOnce(new Error('Unexpected error'))
      .mockResolvedValueOnce({
        data: {
          token_registry_metadata: {
            decimals: 6,
            description: '',
            logo: '',
            name: 'TokenX',
            ticker: 'TokenX',
            url: '',
          },
        },
      } as any);

    const result = await utils.getTokenMetadataWithBackoff(tokens, mockedMaestroClient);

    expect(mockedMaestroClient.assets.assetInfo).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching metadata for TokenX: Error: Unexpected error');
    expect(consoleLogSpy).toHaveBeenCalledWith('trying again in 1 second ...');
    expect(result.get('TOKENX')).toEqual({
      decimals: 6,
      description: '',
      logo: '',
      name: 'TokenX',
      ticker: 'TokenX',
      url: '',
    });
  });
  it('should log error and retry fetching metadata on code with code 429', async () => {
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    const tokens = [
      {
        token: mockTokenX,
        policyId: 'policy123',
        decimals: 6,
        name: 'TokenX',
        symbol: 'TokenX',
        nameBase16: '546f6b656e58',
      } as any,
    ];

    jest.spyOn(mockedMaestroClient.assets, 'assetInfo')
      .mockRejectedValueOnce(new Error('code 429'))
      .mockResolvedValueOnce({
        data: {
          token_registry_metadata: {
            decimals: 6,
            description: '',
            logo: '',
            name: 'TokenX',
            ticker: 'TokenX',
            url: '',
          },
        },
      } as any);

    const result = await utils.getTokenMetadataWithBackoff(tokens, mockedMaestroClient);

    expect(mockedMaestroClient.assets.assetInfo).toHaveBeenCalledTimes(2);
    expect(result.get('TOKENX')).toEqual({
      decimals: 6,
      description: '',
      logo: '',
      name: 'TokenX',
      ticker: 'TokenX',
      url: '',
    });
  });
  it('should log error and retry fetching metadata on code with code 404', async () => {
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    const tokens = [
      {
        token: mockTokenX,
        policyId: 'policy123',
        decimals: 6,
        name: 'TokenX',
        symbol: 'TokenX',
        nameBase16: '546f6b656e58',
      } as any,
    ];

    jest.spyOn(mockedMaestroClient.assets, 'assetInfo')
      .mockRejectedValueOnce(new Error('code 404'))

    const result = await utils.getTokenMetadataWithBackoff(tokens, mockedMaestroClient);

    expect(mockedMaestroClient.assets.assetInfo).toHaveBeenCalledTimes(1);
    expect(result.get('TOKENX')).toEqual({
      decimals: 1,
      description: '',
      logo: '',
      name: 'TOKENX',
      ticker: 'TOKENX',
      url: '',
    });
  });
})
describe('getSplashPools', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  const mockedPools: SplashPool[] = [
    { nft: { nameBase16: 'name1' } } as SplashPool,
    { nft: { nameBase16: 'name2' } } as SplashPool,
    { nft: { nameBase16: 'name1' } } as SplashPool,
  ];
  const splashClient = {
    api: {
      getSplashPools: jest.fn().mockResolvedValueOnce(mockedPools)
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('test error')),

    }
  } as any;

  it('Should be defined', () => {
    expect(utils.getSplashPools).toBeDefined();
  });
  it('Should be a function', () => {
    expect(typeof utils.getSplashPools).toBe('function');
  });
  it('should return a correctly mapped pool map when successful', async () => {
    const result = await utils.getSplashPools(splashClient);
    expect(result).toEqual({
      name1: [mockedPools[0], mockedPools[2]],
      name2: [mockedPools[1]],
    });
    expect(splashClient.api.getSplashPools).toHaveBeenCalledTimes(1);
  });
  it('should handle empty pool list', async () => {
    const result = await utils.getSplashPools(splashClient);
    expect(result).toEqual({});
    expect(splashClient.api.getSplashPools).toHaveBeenCalledTimes(1);
  });
  it('should handle error fetching pools', async () => {
    jest.spyOn(console, 'error').mockReturnValue;
    await expect(utils.getSplashPools(splashClient)).rejects.toThrow('Failed to fetch the splash pools Error: test error');
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe('generateHash', () => {
  it('Should be defined', () => {
    expect(utils.generateHash).toBeDefined();
  });
  it('Should be a function', () => {
    expect(typeof utils.generateHash).toBe('function');
  });
  it('should return a hash of the input', () => {
    const result = utils.generateHash('testNetwork');
    expect(result).toEqual('5f4dcc3b5aa765d61d8327deb882cf99'.slice(0, 16));
  });
})

describe('updateTokenMetadata', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('Should be defined', () => {
    expect(utils.updateTokenMetadata).toBeDefined();
  });
  it('Should be a function', () => {
    expect(typeof utils.updateTokenMetadata).toBe('function');
  });
  it('should update token metadata with new values', () => {
    const token = {
      decimals: 18,
      symbol: 'OLD',
      policyId: 'policy123',
      token: {
        asset: {
          name: 'TokenY',
          policyId: 'policy456',
          nameBase16: '546f6b656e59',
          metadata: {},
        }
      },
    } as any;

    const metadata = {
      decimals: 8,
      ticker: 'NEW',
      additionalProperty: 'Some value',
    } as any;
    const updatedToken = utils.updateTokenMetadata(token, metadata);
    expect(updatedToken.decimals).toEqual(8);
    expect(updatedToken).toEqual({
      decimals: 8,
      symbol: 'NEW',
      policyId: 'policy123',
      token: {
        asset: {
          name: 'TokenY',
          policyId: 'policy456',
          nameBase16: '546f6b656e59',
          metadata: {
            policyId: 'policy123',
            subject: '',
            decimals: 8,
            ticker: 'NEW',
            additionalProperty: 'Some value',
          },
        }
      },
    })
  });
})