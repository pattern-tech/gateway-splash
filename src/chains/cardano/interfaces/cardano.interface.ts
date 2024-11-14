import { Currency } from "@splashprotocol/sdk";
import { Cardano } from "../cardano";
import { UtxosByAddressOrderEnum } from "@maestro-org/typescript-sdk";
import {NetworkSelectionRequest} from "../../../services/common-interfaces";

export interface PollResponse {}

export interface PoolRequest {
  network: string;
  x: string;
  y: string
}

export interface PoolResponse {
  id: string;
}

export interface PollRequest {
  txHash: string;
}

export interface BalancesRequest extends NetworkSelectionRequest {
  address: string;
  privateKey: string;
}


export interface CardanoToken {
  token: Currency;
  policyId: string;
  decimals: number;
  name: string;
  symbol: string;
  nameBase16?: string;
  splashSupport?: boolean;
}

export interface CardanoTokenResponse {
  decimals: number;
  name: string;
  symbol: string;
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

export interface AssetsResponse {
  assets: CardanoTokenResponse[];
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

