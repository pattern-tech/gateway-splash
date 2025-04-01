import * as config from '../../../src/chains/cardano/cardano.config';
import { ConfigManagerV2 } from '../../../src/services/config-manager-v2';

describe('getCardanoConfig', () => {
  const configManager = ConfigManagerV2.getInstance();
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('Should be defined', () => {
    expect(config.getCardanoConfig).toBeDefined();
  });

  it('Should return correct config for Mainnet', () => {
    // Arrange: Mock the get method of ConfigManagerV2 to return specific values for Mainnet
    jest.spyOn(configManager, 'get').mockReturnValueOnce('nodeURL');
    jest
      .spyOn(configManager, 'get')
      .mockReturnValueOnce('maxLRUCacheInstances');
    jest.spyOn(configManager, 'get').mockReturnValueOnce('utxosLimit');
    jest.spyOn(configManager, 'get').mockReturnValueOnce('defaultSlippage');

    const res = config.getCardanoConfig('Mainnet');

    // Assert: Check that the returned configuration matches the expected values for Mainnet
    expect(res).toEqual({
      network: {
        name: 'mainnet',
        nodeURL: 'nodeURL',
        maxLRUCacheInstances: 'maxLRUCacheInstances',
        utxosLimit: 'utxosLimit',
        defaultSlippage: 'defaultSlippage',
      },
    });
    // Assert: Verify that the get method was called exactly 4 times with the expected arguments
    expect(configManager.get).toHaveBeenCalledTimes(4);
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.mainnet.nodeURL',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.mainnet.maxLRUCacheInstances',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.mainnet.utxosLimit',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.mainnet.defaultSlippage',
    );
  });

  it('Should return correct config for Preprod', () => {
    // Arrange: Mock the get method of ConfigManagerV2 to return specific values for Preprod
    jest.spyOn(configManager, 'get').mockReturnValueOnce('nodeURL');
    jest
      .spyOn(configManager, 'get')
      .mockReturnValueOnce('maxLRUCacheInstances');
    jest.spyOn(configManager, 'get').mockReturnValueOnce('utxosLimit');
    jest.spyOn(configManager, 'get').mockReturnValueOnce('defaultSlippage');

    const res = config.getCardanoConfig('Preprod');

    // Assert: Check that the returned configuration matches the expected values for Preprod
    expect(res).toEqual({
      network: {
        name: 'preprod',
        nodeURL: 'nodeURL',
        maxLRUCacheInstances: 'maxLRUCacheInstances',
        utxosLimit: 'utxosLimit',
        defaultSlippage: 'defaultSlippage',
      },
    });
    // Assert: Verify that the get method was called exactly 4 times with the expected arguments
    expect(configManager.get).toHaveBeenCalledTimes(4);
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.preprod.nodeURL',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.preprod.maxLRUCacheInstances',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.preprod.utxosLimit',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.preprod.defaultSlippage',
    );
  });

  it('Should return correct config for Preview', () => {
    // Arrange: Mock the get method of ConfigManagerV2 to return specific values for Preview
    jest.spyOn(configManager, 'get').mockReturnValueOnce('nodeURL');
    jest
      .spyOn(configManager, 'get')
      .mockReturnValueOnce('maxLRUCacheInstances');
    jest.spyOn(configManager, 'get').mockReturnValueOnce('utxosLimit');
    jest.spyOn(configManager, 'get').mockReturnValueOnce('defaultSlippage');

    const res = config.getCardanoConfig('Preview');

    // Assert: Check that the returned configuration matches the expected values for Preview
    expect(res).toEqual({
      network: {
        name: 'preview',
        nodeURL: 'nodeURL',
        maxLRUCacheInstances: 'maxLRUCacheInstances',
        utxosLimit: 'utxosLimit',
        defaultSlippage: 'defaultSlippage',
      },
    });
    // Assert: Verify that the get method was called exactly 4 times with the expected arguments
    expect(configManager.get).toHaveBeenCalledTimes(4);
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.preview.nodeURL',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.preview.maxLRUCacheInstances',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.preview.utxosLimit',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'cardano.networks.preview.defaultSlippage',
    );
  });
});
