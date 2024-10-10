import { Currency } from "@splashprotocol/sdk";
import { Cardano } from "../cardano";

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

export interface CardanoAccount {
    wallet: Wallet;
    address: string;
  }

export interface CardanoToken {
    token: Currency,
    policyId: string,
    decimals: number,
    name: string,
    splashSupport?: boolean
}

export interface CardanoNetworkConfig {
  name: string;
  nodeURL: string;
  timeOut: number;
  maxLRUCacheInstances: number;
  utxosLimit: number;
  defaultSlippage: number;
}
export interface CardanoConfig {
  network: CardanoNetworkConfig;
}

export interface CardanoConnectedInstance {
    [name: string]: Cardano;
  }