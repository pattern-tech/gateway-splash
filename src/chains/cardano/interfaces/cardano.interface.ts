import { Currency } from '@splashprotocol/sdk';
import { Cardano } from '../cardano';
import { UtxosByAddressOrderEnum } from '@maestro-org/typescript-sdk';

export interface CardanoToken {
  token: Currency;
  policyId: string;
  decimals: number;
  name: string;
  symbol: string;
  nameBase16?: string;
  splashSupport?: boolean;
}

export interface CardanoNetworkConfig {
  name: string;
  nodeURL: string;
  // timeOut: number;
  maxLRUCacheInstances: number;
  utxosLimit: number;
  defaultSlippage: string;
}
export interface CardanoConfig {
  network: CardanoNetworkConfig;
}

export interface CardanoConnectedInstance {
  [name: string]: Cardano;
}

export interface TxRequestParams {
  limit?: number;
  offset?: string;
  sortDirection?: UtxosByAddressOrderEnum;
  asset?: string;
}
