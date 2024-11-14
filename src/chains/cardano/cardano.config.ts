import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { CardanoConfig } from './interfaces/cardano.interface';

/**
 *  This function return configuration for Cardano
 * @param {string} network - mainnet, preprod or testnet
 * @returns CardanoConfig
 * @function
 */
export function getCardanoConfig(network: string): CardanoConfig {
  // getting the config manager
  const configManager = ConfigManagerV2.getInstance();

  let _network = String(network).toLowerCase();

  return {
    network: {
      name: _network,
      nodeURL: configManager.get(`cardano.networks.${_network}.nodeURL`),
      // timeOut: configManager.get(`cardano.networks.${network}.timeOut`),
      maxLRUCacheInstances: configManager.get(
        `cardano.networks.${_network}.maxLRUCacheInstances`,
      ),
      utxosLimit: configManager.get(`cardano.networks.${_network}.utxosLimit`),
      defaultSlippage: configManager.get(
        `cardano.networks.${_network}.defaultSlippage`,
      ),
    },
  };
}
