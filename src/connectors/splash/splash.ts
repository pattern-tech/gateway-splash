import { SplashConfig } from './splash.config';
import { Cardano } from '../../chains/cardano/cardano';
import { CardanoToken } from '../../chains/cardano/interfaces/cardano.interface';
import { BigNumber } from 'bignumber.js';
import { PriceRequest, TradeRequest } from '../connector.requests';
import { TradeSlippage } from '../../chains/cardano/types/node.types';
import {
  HttpException,
  PRICE_FAILED_ERROR_CODE,
  PRICE_FAILED_ERROR_MESSAGE,
  TRADE_FAILED_ERROR_CODE,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
} from '../../services/error-handler';

export class Splash {
  private static _instances: { [name: string]: Splash };
  private cardano: Cardano;
  private _gasLimitEstimate: number;
  private tokenList: Record<string, CardanoToken> = {};
  private _ready: boolean = false;

  private constructor(network: string, maestro_api_key: string) {
    const config = SplashConfig.config;

    this.cardano = Cardano.getInstance(network, maestro_api_key);
    this._gasLimitEstimate = config.gasLimitEstimate;
  }

  public static getInstance(
    chain: string,
    network: string,
    maestro_api_key: string | undefined,
  ): Splash {
    if (Splash._instances === undefined) {
      Splash._instances = {};
    }
    if (!(chain + network in Splash._instances)) {
      Splash._instances[chain + network] = new Splash(
        network,
        maestro_api_key as any,
      );
    }

    return Splash._instances[chain + network];
  }

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenByAddress(address: string): CardanoToken {
    return this.tokenList[address];
  }

  public async init() {
    if (!this.cardano.ready()) {
      await this.cardano.init();
    }

    this.tokenList = this.cardano._assetMap;

    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  /**
   * Default gas limit for swap transactions.
   */
  public get gasLimitEstimate(): number {
    return this._gasLimitEstimate;
  }

  /**
   * Given the amount of `baseToken` desired to acquire from a transaction,
   * calculate the amount of `quoteToken` needed for the transaction.
   *
   * This is typically used for calculating token prices.
   *
   * @param quoteToken Token input for the transaction
   * @param baseToken Token output from the transaction
   * @param amount Amount of `baseToken` desired from the transaction
   */
  async estimateTrade(req: PriceRequest) {
    try {
      if (req.side === 'SELL')
        return this.cardano.estimate(
          req.base.replace('_', ''),
          req.quote.replace('_', ''),
          BigNumber(req.amount),
          false,
          req.allowedSlippage as TradeSlippage,
        );
      else if (req.side === 'BUY')
        return this.cardano.estimate(
          req.base.replace('_', ''),
          req.quote.replace('_', ''),
          BigNumber(req.amount),
          true,
          req.allowedSlippage as TradeSlippage,
        );
      else
        return this.cardano.estimate(
          req.base.replace('_', ''),
          req.quote.replace('_', ''),
          BigNumber(req.amount),
          true,
          req.allowedSlippage as TradeSlippage,
        );
    } catch (e) {
      if (e instanceof Error) {
        throw new HttpException(
          500,
          PRICE_FAILED_ERROR_MESSAGE + e.message,
          PRICE_FAILED_ERROR_CODE,
        );
      } else {
        throw new HttpException(
          500,
          UNKNOWN_ERROR_MESSAGE,
          UNKNOWN_ERROR_ERROR_CODE,
        );
      }
    }
  }

  /**
   * Given a wallet and a Ergo trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   */
  async executeTrade(req: TradeRequest) {
    try{
    await this.cardano.getAccountFromAddress(req.address as unknown as string);
    if (req.side === 'SELL')
      return this.cardano.swap(
        req.base.replace('_', ''),
        req.quote.replace('_', ''),
        BigNumber(req.amount),
        false,
        String(req.limitPrice),
      );
    else if (req.side === 'BUY')
      return this.cardano.swap(
        req.base.replace('_', ''),
        req.quote.replace('_', ''),
        BigNumber(req.amount),
        true,
        String(req.limitPrice),
      );
    else
      return this.cardano.swap(
        req.base.replace('_', ''),
        req.quote.replace('_', ''),
        BigNumber(req.amount),
        true,
        String(req.limitPrice),
      );
    } catch (e) {
      if (e instanceof Error) {
        throw new HttpException(
          500,
          TRADE_FAILED_ERROR_CODE + e.message,
          TRADE_FAILED_ERROR_CODE
        );
      } else {
        throw new HttpException(
          500,
          UNKNOWN_ERROR_MESSAGE,
          UNKNOWN_ERROR_ERROR_CODE
        );
      }
    }
  }
}
