import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { CardanoConfig } from './interfaces/cardano.interface';
import { MaestroSupportedNetworks } from '@maestro-org/typescript-sdk';

/**
 *  This function return configuration for Cardano
 * @param {string} network - mainnet, preprod or testnet
 * @returns CardanoConfig
 * @function
 */
export function getCardanoConfig(network: MaestroSupportedNetworks): CardanoConfig {
  // getting the config manger
  const configManager = ConfigManagerV2.getInstance();

  return {
    network: {
      name: network,
      nodeURL: configManager.get(`cardano.networks.${network}.nodeURL`),
      timeOut: configManager.get(`cardano.networks.${network}.timeOut`),
      maxLRUCacheInstances: configManager.get(
        `cardano.networks.${network}.maxLRUCacheInstances`,
      ),
      utxosLimit: configManager.get(`cardano.networks.${network}.utxosLimit`),
      defaultSlippage: configManager.get(
        `cardano.networks.${network}.defaultSlippage`,
      ),
    },
  };
}
