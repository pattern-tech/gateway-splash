import { Currency } from "@splashprotocol/sdk";
import { Cardano } from "../cardano";

export interface PollResponse {}

export interface PollRequest {}

export interface NonceResponse {}

export interface NonceRequest {}

export interface tokenResponse {}

export interface tokenRequest {}

export interface balancesResponse {}

export interface balancesRequest {}

export interface CardanoAccount {
    wallet: Wallet;
    address: string;
    prover: WalletProver;
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