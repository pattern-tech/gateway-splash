import { Currency } from "@splashprotocol/sdk";
import { Cardano } from "../cardano";
import { UtxosByAddressOrderEnum } from "@maestro-org/typescript-sdk";

export interface PollResponse {}

export interface PollRequest {}

export interface NonceResponse {}

export interface NonceRequest {}

export interface tokenResponse {}

export interface tokenRequest {}

export interface balancesResponse {}

export interface balancesRequest {}

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