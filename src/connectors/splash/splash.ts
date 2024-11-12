import { SplashConfig } from './splash.config';
import { Cardano } from '../../chains/cardano/cardano';
import {CardanoToken} from '../../chains/cardano/interfaces/cardano.interface';
import {BigNumber} from "bignumber.js";
import {PriceRequest, TradeRequest} from "../../amm/amm.requests";
import {TradeSlippage} from "../../chains/cardano/types/node.types";

export class Splash {
  private static _instances: { [name: string]: Splash };
  private cardano: Cardano;
  private _gasLimitEstimate: number;
  private tokenList: Record<string, CardanoToken> = {};
  private _ready: boolean = false;

  private constructor(network: string) {
    const config = SplashConfig.config;

    this.cardano = Cardano.getInstance(network);
    this._gasLimitEstimate = config.gasLimitEstimate;
  }

  public static getInstance(chain: string, network: string): Splash {
    if (Splash._instances === undefined) {
      Splash._instances = {};
    }
    if (!(chain + network in Splash._instances)) {
      Splash._instances[chain + network] = new Splash(network);
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
    if (req.side === 'SELL')
      return this.cardano.estimate(
        req.base.replace("_", ""),
        req.quote.replace("_", ""),
        BigNumber(req.amount),
        req.allowedSlippage as TradeSlippage,
      );
    else if (req.side === 'BUY')
      return this.cardano.estimate(
        req.base.replace("_", ""),
        req.quote.replace("_", ""),
        BigNumber(req.amount),
        req.allowedSlippage as TradeSlippage,
      );
    else
      return this.cardano.estimate(
        req.base.replace("_", ""),
        req.quote.replace("_", ""),
        BigNumber(req.amount),
        req.allowedSlippage as TradeSlippage,
      );
  }

  /**
   * Given a wallet and a Ergo trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   */
  async executeTrade(req: TradeRequest) {
    const account = await this.cardano.getAccountFromAddress(
      req.address as unknown as string,
    );
    if (req.side === 'SELL')
      return this.cardano.swap(
        account,
        req.base.replace("_", ""),
        req.quote.replace("_", ""),
        BigNumber(req.amount),
        req.limitPrice,
        true,
        req.allowedSlippage as TradeSlippage,
      );
    else if (req.side === 'BUY')
      return this.cardano.swap(
        account,
        req.base.replace("_", ""),
        req.quote.replace("_", ""),
        BigNumber(req.amount),
        req.limitPrice,
        false,
        req.allowedSlippage as TradeSlippage,
      );
    else
      return this.cardano.swap(
        account,
        req.base.replace("_", ""),
        req.quote.replace("_", ""),
        BigNumber(req.amount),
        req.limitPrice,
        false,
        req.allowedSlippage as TradeSlippage,
      );
  }
}
