import { SplashConfig } from './splash.config';
import { Cardano } from '../../chains/cardano/cardano';
import {CardanoToken} from '../../chains/cardano/interfaces/cardano.interface';
import {MaestroSupportedNetworks} from "@maestro-org/typescript-sdk";

export class Splash {
  private static _instances: { [name: string]: Splash };
  private cardano: Cardano;
  private _gasLimitEstimate: number;
  private tokenList: Record<string, CardanoToken> = {};
  private _ready: boolean = false;

  private constructor(network: MaestroSupportedNetworks) {
    const config = SplashConfig.config;

    this.cardano = Cardano.getInstance(network);
    this._gasLimitEstimate = config.gasLimitEstimate;
  }

  public static getInstance(chain: string, network: MaestroSupportedNetworks): Splash {
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
}
