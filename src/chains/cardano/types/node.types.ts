
import { Api, BuilderLegacy, Dictionary, Operation, SplashBackend } from '@splashprotocol/sdk';

export type SplashInstance = BuilderLegacy<Api<SplashBackend>, Dictionary<Operation<any, Api<SplashBackend>, any>>>;

export type SplashToken = {
  address: string;
  decimals: number;
  name: string;
  ticker: string;
  logoURI: string;
  description: string;
};

export type TradeSlippage = '1' | '5' | '10' | '15' | '25';

export type poolNftNames = {
  baseToQuote: string;
  quoteToBase: string;
};

