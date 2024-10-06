import { Utxo } from '@maestro-org/typescript-sdk';
import { Dictionary, Operation } from '@splashprotocol/sdk';

export type SplashClientType = Dictionary<Operation<any>>;

export type SplashToken = {
  address: string;
  decimals: number;
  name: string;
  ticker: string;
  logoURI: string;
  description: string;
};

// export type MaestroError = {
//   code: number;
//   error: string;
//   message: string;
// };
