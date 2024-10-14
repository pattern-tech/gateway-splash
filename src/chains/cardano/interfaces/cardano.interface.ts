import { Currency } from "@splashprotocol/sdk";
import { Cardano } from "../cardano";
import { UtxosByAddressOrderEnum } from "@maestro-org/typescript-sdk";

export interface PollResponse {}

export interface PoolRequest {
  network: string;
  poolId: string;
}

export interface PoolResponse {
  id: string;
}

export interface PollRequest {
  txHash: string;
}

export interface NonceResponse {}

export interface NonceRequest {}

export interface TokenResponse {}

export interface TokenRequest {}

export interface BalancesResponse {}

export interface BalancesRequest {
  address: string;
}

export interface CardanoToken {
    token: Currency,
    policyId: string,
    decimals: number, 
    name: string, 
    symbol: string
    splashSupport?: boolean
}

export interface CardanoNetworkConfig {
  name: string;
  nodeURL: string;
  timeOut: number;
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
  limit?: number, 
  offset? : string, 
  sortDirection?: UtxosByAddressOrderEnum,
  asset? : string
}