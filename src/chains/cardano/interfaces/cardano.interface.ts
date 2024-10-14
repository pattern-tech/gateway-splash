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

// export interface CardanoAccount {
//     wallet: Wallet;
//     address: string;
//     prover: WalletProver;
//   }

// export interface TradeResponse {
//   network: string;
//   timestamp: number;
//   latency: number;
//   base: string;
//   quote: string;
//   amount: string; // traderequest.amount
//   finalAmountReceived?: string; // Cosmos
//   rawAmount: string;
//   finalAmountReceived_basetoken?: string; // Cosmos
//   expectedIn?: string;
//   expectedOut?: string; // Cosmos: expectedAmountReceived
//   expectedPrice?: string; // Cosmos
//   price: string; // Cosmos: finalPrice
//   gasPrice: number;
//   gasPriceToken: string;
//   gasLimit: number;
//   gasWanted?: string; // Cosmos
//   gasCost: string; // Cosmos: gasUsed
//   nonce?: number;
//   txHash: string | any | undefined;
// }

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