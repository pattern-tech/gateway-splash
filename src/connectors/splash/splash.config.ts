import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { NetworkConfig } from './interfaces/splash.interface';

const configManager = ConfigManagerV2.getInstance();

export namespace SplashConfig {
  export const config: NetworkConfig = {
    allowedSlippage: configManager.get('cardano.allowedSlippage'),
    gasLimitEstimate: configManager.get('cardano.gasLimitEstimate'),
    tradingTypes: ['AMM'],
    chainType: 'CARDANO',
    availableNetworks: [{ chain: 'cardano', networks: ['mainnet'] }],
  };
}
