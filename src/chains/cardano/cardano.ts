import LRUCache from 'lru-cache';
import {
  CardanoConfig,
  CardanoConnectedInstance,
  CardanoToken,
  TradeResponse,
} from './interfaces/cardano.interface';
// import { CardanoNetwork, NetworkPrefix } from './types/cardano.types';
// import { MaestroNode } from './?node.service';

import dotenv from 'dotenv';
dotenv.config();

import { CardanoController } from './cardano.controller';
import {
  AddressTransaction,
  MaestroClient,
  MaestroSupportedNetworks,
  TransactionInfo,
  TxManagerState,
  TxsByAddressOrderEnum,
  Utxo,
} from '@maestro-org/typescript-sdk';
import fse from 'fs-extra';
import {
  AssetInfo,
  cborHexToBytes,
  Currency,
  hexToString,
  Price,
  Splash,
  stringToHex,
} from '@splashprotocol/sdk';
import { sha256 } from '@ethersproject/solidity';
import { getCardanoConfig } from './cardano.config';
import {
  getAssetsFromPools,
  getMaestroConfig,
  getNftBase16Name,
  getNftBase16Names,
  getSplashInstance,
  getSplashPools,
} from './cardano.utils';
import { SplashPool } from './types/cardano.types';
import { SplashClientType, TradeSlippage } from './types/node.types';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { BigNumber } from 'bignumber.js';
import { CardanoWallet } from './wallet.service';
import { walletPath } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';

/**
 * Main Cardano class for interacting with the cardano blockchain.
 */

export class Cardano {
  private static _instances: LRUCache<string, Cardano>;
  private _assetMap: Record<string, CardanoToken> = {};
  private _chain: string = 'cardano';
  private _network: MaestroSupportedNetworks;
  //   private _networkPrefix: NetworkPrefix;
  private _node: MaestroClient;
  //   private _explorer: CardanoExplorer; // we use splash
  private _dex: Splash<SplashClientType>;
  private _splashPools: Record<string, SplashPool[]>; // nft name16base + pool policy id
  private _ready: boolean = false;
  public minFee: number;
  public controller: CardanoController;
  private utxosLimit: number;
  private timeout: number;
  private defaultSlippage: number;

  /**
   * Creates an instance of Cardano.
   * @param {CardanoNetwork} network - The Cardano network to connect to ('mainnet' or 'testnet')
   */
  private constructor(
    network: MaestroSupportedNetworks,
    config: CardanoConfig,
    minFee: number,
    splashPools: Record<string, SplashPool[]>,
    assets: Record<string, CardanoToken>,
  ) {
    if (
      network !== 'Mainnet' &&
      network !== 'Preprod' &&
      network !== 'Preview'
    ) {
      throw new Error('network should be `mainnet`, `preprod` or `preview`');
    }

    this._network = network;
    this._node = new MaestroClient(
      getMaestroConfig(network, config.network.nodeURL),
    );

    this._dex = getSplashInstance(network);
    this.controller = CardanoController;
    this.minFee = minFee; // the "1" is the init number, must be changed for each transaction based on the transaction size
    this.utxosLimit = config.network.utxosLimit; // maximum number of utxos while using the `getUtxosByAddress`
    this.timeout = config.network.timeOut;
    this.defaultSlippage = config.network.defaultSlippage;
    this._splashPools = splashPools;
  }

  /**
   * Gets or creates an Cardano instance
   * @param {MaestroSupportedNetworksNetwork} network - The supported maestro network to connect to
   * @returns {Cardano}
   * @static
   */
  public async getInstance(
    network: MaestroSupportedNetworks,
    name?: string,
  ): Promise<Cardano> {
    const instanceName =
      name ||
      sha256(
        ['number', 'string'] as const,
        [Date.now(), String(network)] as const,
      ).slice(0, 16);

    if (Cardano._instances.has(instanceName)) {
      Cardano._instances.get(instanceName);
    }

    if (
      network !== 'Mainnet' &&
      network !== 'Preprod' &&
      network !== 'Preview'
    ) {
      throw new Error('network should be `mainnet`, `preprod` or `preview`');
    }

    const config = getCardanoConfig(network);

    if (!Cardano._instances) {
      Cardano._instances = new LRUCache<string, Cardano>({
        max: config.network.maxLRUCacheInstances,
      });
    }

    if (!Cardano._instances.has(instanceName)) {
      Cardano._instances.set(
        instanceName,
        new Cardano(network, config, 1, {}, {}),
      );
    }
    let instance = Cardano._instances.get(instanceName) as Cardano;

    let protocolParams = (await instance._node.general.protocolParameters())
      .data;

    instance.minFee =
      protocolParams.min_fee_coefficient +
      protocolParams.min_fee_constant.ada.lovelace * 1;

    // we load pools then we fetch the tokens from it
    await instance.loadPools();

    // fetching tokens from it
    await instance.loadAssets();

    this._ready = true;

    return instance;
  }

  /**
   * Gets the Maestro client object
   * @returns {MaestroClient}
   */
  public get node(): MaestroClient {
    return this._node;
  }

  /**
   * Gets the current network
   * @returns {MaestroSupportedNetworks}
   */
  public get network(): MaestroSupportedNetworks {
    return this._network;
  }

  /**
   * Gets the list of stored assets
   * @returns {Array<CardanoToken>}
   */
  public get storedAssetList(): Array<CardanoToken> {
    return Object.values(this._assetMap);
  }

  /**
   * Checks if the Cardano instance is ready
   * @returns {boolean}
   */
  public ready(): boolean {
    return this._ready;
  }

  /**
   * Gets the current network height
   * @returns {Promise<number>}
   */
  public async getNetworkHeight() {
    return (await this._node.general.chainTip()).data.height;
  }

  /**
   * Closes the Cardano instance (placeholder for future implementation)
   * @returns {Promise<void>}
   */
  async close() {
    return;
  }

  /**
   * Gets all connected Cardano instances
   * @returns {CardanoConnectedInstance}
   * @static
   */
  public static getConnectedInstances(): CardanoConnectedInstance {
    const connectedInstances: CardanoConnectedInstance = {};

    if (this._instances) {
      const keys = Array.from(this._instances.keys());

      for (const instance of keys) {
        if (instance) {
          connectedInstances[instance] = this._instances.get(
            instance,
          ) as Cardano;
        }
      }
    }

    return connectedInstances;
  }

  /**
   * Gets the current block number
   * @returns {Promise<number>}
   */
  async getCurrentBlockNumber(): Promise<number> {
    const status = await this.getNetworkHeight();
    return status + 1; // ask
  }

  /**
   * Gets either all of the unspent tx's or Utxos with specific address for a given address
   * @param {string} address - The address to get unspent transactions for
   * @param {string} asset - (optional) The asset name
   * @returns {Promise<CardanoBox[]>}
   */
  async getAddressUtxos(address: string, asset?: string) {
    let utxos: Array<Utxo> = [];
    let offset = 0;

    utxos = (
      await this._node.addresses.utxosByAddress(address, {
        count: this.utxosLimit,
        order: 'desc',
        cursor: String(offset),
        asset: asset || null,
      })
    ).data;

    return utxos;
  }

  /**
   * Gets an Cardano account from a mnemonic phrase
   * @param {string} mnemonic - The mnemonic phrase
   * @returns {CardanoAccount}
   */
  public getAccountFromMnemonic(mnemonic: string): CardanoWallet {
    let wallet = new CardanoWallet(mnemonic);

    wallet.initialize();

    return wallet;
  }

  /**
   * Encrypts a secret using a password
   * @param {string} secret - The secret to encrypt
   * @param {string} password - The password to use for encryption
   * @returns {string} The encrypted secret
   */
  public encrypt(secret: string, password: string): string {
    const iv = randomBytes(16);
    const key = Buffer.alloc(32);

    key.write(password);

    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Gets an Cardano account from an address
   * @param {string} address - The address to get the account for
   * @returns {Promise<CardanoAccount>}
   */
  public async getAccountFromAddress(address: string): Promise<CardanoWallet> {
    const path = `${walletPath}/${this._chain}`;
    const encryptedMnemonic: string = await fse.readFile(
      `${path}/${address}.json`,
      'utf8',
    );
    const passphrase = ConfigManagerCertPassphrase.readPassphrase();
    if (!passphrase) {
      throw new Error('missing passphrase');
    }
    const mnemonic = this.decrypt(encryptedMnemonic, passphrase);
    return this.getAccountFromMnemonic(mnemonic);
  }

  /**
   * Decrypts an encrypted secret using a password
   * @param {string} encryptedSecret - The encrypted secret
   * @param {string} password - The password to use for decryption
   * @returns {string} The decrypted secret
   */
  public decrypt(encryptedSecret: string, password: string): string {
    const [iv, encryptedKey] = encryptedSecret.split(':');
    const key = Buffer.alloc(32);

    key.write(password);

    const decipher = createDecipheriv(
      'aes-256-cbc',
      key,
      Buffer.from(iv, 'hex'),
    );
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedKey, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString();
  }

  /**
   * Gets the balance of a specific asset for an account
   * @param {accountAddress} account - The account to get the balance for
   * @param {string} assetName - The name of the asset
   * @returns {Promise<string>} The balance of the asset
   */
  public async getAssetBalance(
    accountAddress: string,
    assetName: string,
  ): Promise<string> {
    const CardanoAsset = this._assetMap[assetName];
    let balance = BigNumber(0);

    if (!CardanoAsset)
      throw new Error(`assetName not found ${this._chain} Node!`);
    try {
      const utxos = await this.getAddressUtxos(
        accountAddress,
        CardanoAsset.name.concat(CardanoAsset.policyId),
      );
      utxos.forEach((utxo) =>
        utxo.assets.forEach((asset) => {
          balance.plus(asset.amount);
        }),
      );
    } catch (error: any) {
      throw new Error(
        `problem during finding account assets ${this._chain} Node!`,
      );
    }

    return balance.toString();
  }

  /**
   * Gets the balance of ERG and assets from unspent boxes
   * @param {Utxo[]} utxos - The unspent transaction outputs
   * @returns {{ balance: BigNumber, assets: Record<string, BigNumber> }}
   */
  public getBalance(utxos: Utxo[]): {
    balance: BigNumber;
    assets: Record<string, BigNumber>;
  } {
    let balance: BigNumber = BigNumber(0);
    let assets: Record<string, BigNumber> = {};

    utxos.forEach((utxo) =>
      utxo.assets.forEach((asset) => {
        if (asset.unit == 'lovelace') {
          // its ada
          balance.plus(BigNumber(asset.amount));
        } else {
          assets[hexToString(asset.unit.slice(56))] = BigNumber(asset.amount);
          // we can return the currency obj at this stage as well
        }
      }),
    );

    return { balance, assets };
  }

  /**
   * Loads assets from the DEX
   * @private
   */
  private async loadAssets() {
    this._assetMap = await getAssetsFromPools(this._node, this._splashPools);
  }

  // /**
  //  * Retrieves asset data from the DEX
  //  * @private
  //  * @returns {Promise<any>} Asset data
  //  */
  // private async getAssetData() {
  //   return await this._node.assets.assetInfo.api.getAssetsMetadata();
  // } // we have stored asset list

  /**
   * Loads AMM pools
   * @private
   */
  private async loadPools(): Promise<void> {
    this._splashPools = await getSplashPools(this._dex);
  }

  /**
   * Performs a swap operation
   * @param {CardanoAccount} account - The account performing the swap
   * @param {string} baseToken - The base token symbol
   * @param {string} quoteToken - The quote token symbol
   * @param {BigNumber} value - The amount to swap
   * @param {string} output_address - The address to receive the output
   * @param {string} return_address - The address for change return
   * @param {number} [slippage] - The slippage tolerance
   * @returns {Promise<TradeResponse>} The trade response
   */
  public async swap(
    cardanoWallet: CardanoWallet,
    baseToken: string,
    quoteToken: string,
    amount: BigNumber,
    priceLimit?: string,
    sell?: boolean,
    // output_address: string,
    // return_address: string,
    slippage?: TradeSlippage,
  ): Promise<TradeResponse> {
    let inputToken: Currency;
    let outputToken: Currency;
    let price: Price;
    let _slippage: TradeSlippage = slippage || '1';

    // if we even have these tokens
    let baseCardanoToken = this._assetMap[baseToken.toUpperCase()];
    let quoteCardanoToken = this._assetMap[quoteToken.toUpperCase()];

    if (baseCardanoToken) {
      inputToken = baseCardanoToken.token.withAmount(
        BigInt(
          amount
            .multipliedBy(BigNumber(10).pow(baseCardanoToken.decimals))
            .toNumber(),
        ),
      );
      baseCardanoToken.token = inputToken;
    } else {
      throw new Error(
        `The ${baseToken.toUpperCase()} token is not supported by splash dex !`,
      );
    }

    if (quoteCardanoToken) {
      outputToken = quoteCardanoToken.token.withAmount(
        BigInt(
          amount
            .multipliedBy(BigNumber(10).pow(quoteCardanoToken.decimals))
            .toNumber(),
        ),
      );
      quoteCardanoToken.token = outputToken;
    } else {
      throw new Error(
        `The ${quoteToken.toUpperCase()} token is not supported by splash dex !`,
      );
    }

    // if we have the pool for this pair
    let poolNftNamesBase16 = getNftBase16Names(
      baseCardanoToken.token.asset.nameBase16,
      quoteCardanoToken.token.asset.nameBase16,
    );

    let pairPoolBtq = this._splashPools[poolNftNamesBase16.baseToQuote];
    let pairPoolQtb = this._splashPools[poolNftNamesBase16.quoteToBase];

    if (!pairPoolBtq && !pairPoolQtb) {
      throw new Error(
        `The ${baseToken.toUpperCase()}/${quoteToken.toUpperCase()}  pair is not supported by splash dex !`,
      );
    }

    if (!priceLimit) {
      // fetching the pair from splash
      price = this._dex.utils.selectEstimatedPrice({
        orderBook: await this._dex.api.getOrderBook({
          base: baseCardanoToken.token.asset,
          quote: quoteCardanoToken.token.asset,
        }),
        input: sell
          ? baseCardanoToken.token.withAmount(BigInt(amount.toNumber()))
          : quoteCardanoToken.token.withAmount(BigInt(amount.toNumber())),
        priceType: 'average',
      });
    } else {
      price = Price.new({
        base: baseCardanoToken.token.asset,
        quote: quoteCardanoToken.token.asset,
        raw: priceLimit,
      });
    }

    // swapping
    // creating the swap transaction
    let swapTx = await this._dex
      .newTx()
      .spotOrder({
        input: sell ? inputToken : outputToken,
        outputAsset: sell
          ? quoteCardanoToken.token.asset
          : baseCardanoToken.token.asset,
        price: price,
        slippage: Number(_slippage),
      })
      .complete();
    // const tx = await actions.swap(swapParams, txContext);

    let protocolParams = (await this._node.general.protocolParameters()).data;

    let estimatedFee =
      protocolParams.min_fee_coefficient +
      protocolParams.min_fee_constant.ada.lovelace *
        cborHexToBytes(swapTx.cbor).length;

    let swapTxSigned = cardanoWallet.sing(Buffer.from(swapTx.cbor, 'hex'));

    let txHash = await this._node.txManager.txManagerSubmit(swapTxSigned);

    // await this.submitTransaction(account, tx);

    let minOutput = amount.multipliedBy(price.raw);

    // returning
    return this.createTradeResponse(
      baseCardanoToken,
      quoteCardanoToken,
      amount,
      String(price),
      // from:,
      minOutput,
      // pool:,
      sell ?? false,
      // config:,
      // timestamp:,
      estimatedFee,
      txHash,
    );
  }

  // /**
  //  * Estimates the price for a swap
  //  * @param {string} baseToken - The base token symbol
  //  * @param {string} quoteToken - The quote token symbol
  //  * @param {BigNumber} value - The amount to swap
  //  * @param {number} [slippage] - The slippage tolerance
  //  * @returns {Promise<PriceResponse>} The price estimate
  //  */
  // public async estimate(
  //   baseToken: string,
  //   quoteToken: string,
  //   value: BigNumber,
  //   slippage?: number,
  // ): Promise<PriceResponse> {
  //   const { realBaseToken, realQuoteToken, pool } = await this.findBestPool(
  //     baseToken,
  //     quoteToken,
  //     value,
  //     slippage,
  //   );
  //   const { sell, amount, from, minOutput } = this.calculateSwapParameters(
  //     pool,
  //     realBaseToken,
  //     value,
  //     slippage,
  //   );

  //   const config = getCardanoConfig(this.network);
  //   const expectedAmount = this.calculateExpectedAmount(minOutput, pool, sell);

  //   return this.createPriceResponse(
  //     realBaseToken,
  //     realQuoteToken,
  //     amount,
  //     from,
  //     minOutput,
  //     pool,
  //     sell,
  //     config,
  //     expectedAmount,
  //   );
  // }

  // /**
  //  * Finds the best pool for a given token pair and amount
  //  * @param {string} baseToken - The base token symbol
  //  * @param {string} quoteToken - The quote token symbol
  //  * @param {BigNumber} value - The amount to swap
  //  * @param {number} [slippage] - The slippage tolerance
  //  * @returns {Promise<{ realBaseToken: CardanoAsset, realQuoteToken: CardanoAsset, pool: Pool }>}
  //  */
  // private async findBestPool(
  //   baseToken: string,
  //   quoteToken: string,
  //   value: BigNumber,
  //   slippage?: number,
  // ): Promise<{
  //   realBaseToken: CardanoAsset;
  //   realQuoteToken: CardanoAsset;
  //   pool: Pool;
  // }> {
  //   const pools = this.getPoolByToken(baseToken, quoteToken);
  //   if (!pools.length)
  //     throw new Error(`Pool not found for ${baseToken} and ${quoteToken}`);

  //   const realBaseToken = this.findToken(baseToken);
  //   const realQuoteToken = this.findToken(quoteToken);
  //   if (!realBaseToken || !realQuoteToken)
  //     throw new Error(`Pool not found for ${baseToken} and ${quoteToken}`);
  //   let bestPool: Pool | null = null;
  //   let bestExpectedOut = BigNumber(0);

  //   for (const pool of pools) {
  //     const { minOutput } = this.calculateSwapParameters(
  //       pool,
  //       realBaseToken,
  //       value,
  //       slippage,
  //     );
  //     const expectedOut = this.calculateExpectedAmount(
  //       minOutput,
  //       pool,
  //       pool.x.asset.id !== realBaseToken.tokenId,
  //     );

  //     if (expectedOut.gt(bestExpectedOut)) {
  //       bestPool = pool;
  //       bestExpectedOut = expectedOut;
  //     }
  //   }

  //   if (!bestPool)
  //     throw new Error(
  //       `No suitable pool found for ${baseToken} and ${quoteToken}`,
  //     );

  //   return { realBaseToken, realQuoteToken, pool: bestPool };
  // }

  /**
   * Finds a token by its symbol
   * @param {string} symbol - The token symbol
   * @returns {CardanoToken}
   */
  private findToken(symbol: string): CardanoToken | undefined {
    const token = this.storedAssetList.find((asset) => asset.symbol === symbol);
    return token;
  }

  /**
   * Calculates swap parameters for a given pool and amount
   * @param {Pool} pool - The pool to use for the swap
   * @param {CardanoAsset} baseToken - The base token
   * @param {BigNumber} value - The amount to swap
   * @param {number} [slippage] - The slippage tolerance
   * @returns {{ sell: boolean, amount: BigNumber, from: any, to: any, minOutput: any }}
   */
  private calculateSwapParameters(
    pool: Pool,
    baseToken: CardanoAsset,
    value: BigNumber,
    slippage?: number,
  ) {
    const config = getCardanoConfig(this.network);
    const sell = pool.x.asset.id !== baseToken.tokenId;
    const amount = this.calculateAmount(pool, value, sell);

    const max_to = {
      asset: { id: sell ? pool.x.asset.id : pool.y.asset.id },
      amount: BigInt(amount.toString()),
    };

    const from = {
      asset: {
        id: sell ? pool.y.asset.id : pool.x.asset.id,
        decimals: sell ? pool.y.asset.decimals : pool.x.asset.decimals,
      },
      amount: pool.outputAmount(
        max_to as any,
        slippage || config.network.defaultSlippage,
      ).amount,
    };
    if (from.amount === BigInt(0))
      throw new Error(`${amount} asset from ${max_to.asset.id} is not enough!`);
    const to = {
      asset: {
        id: sell ? pool.x.asset.id : pool.y.asset.id,
        decimals: sell ? pool.x.asset.decimals : pool.y.asset.decimals,
      },
      amount: BigInt(amount.toString()),
    };

    const { minOutput } = getBaseInputParameters(pool, {
      inputAmount: from,
      slippage: slippage || config.network.defaultSlippage,
    });

    return { sell, amount, from, to, minOutput };
  }

  /**
   * Calculates the amount with proper decimals
   * @param {Pool} pool - The pool to use for the calculation
   * @param {BigNumber} value - The input value
   * @param {boolean} sell - Whether it's a sell operation
   * @returns {BigNumber}
   */
  private calculateAmount(
    pool: Pool,
    value: BigNumber,
    sell: boolean,
  ): BigNumber {
    const decimals = sell ? pool.x.asset.decimals : pool.y.asset.decimals;
    return value.multipliedBy(BigNumber(10).pow(decimals as number));
  }

  /**
   * Calculates the expected amount from the minimum output
   * @param {any} minOutput - The minimum output
   * @param {Pool} pool - The pool used for the swap
   * @param {boolean} sell - Whether it's a sell operation
   * @returns {BigNumber}
   */
  private calculateExpectedAmount(
    minOutput: any,
    pool: Pool,
    sell: boolean,
  ): BigNumber {
    const decimals = sell ? pool.x.asset.decimals : pool.y.asset.decimals;
    return BigNumber(minOutput.amount.toString()).div(
      BigNumber(10).pow(decimals as number),
    );
  }

  // /** // pool action is properly specified in the splash dex
  //  * Gets pool actions for the swap
  //  * @param {string} output_address - The output address
  //  * @param {CardanoAccount} account - The account performing the swap
  //  * @param {DefaultTxAssembler} txAssembler - The transaction assembler
  //  * @returns {Function}
  //  */
  // private getPoolActions(
  //   output_address: string,
  //   account: CardanoAccount,
  //   txAssembler: DefaultTxAssembler,
  // ) {
  //   return makeWrappedNativePoolActionsSelector(
  //     output_address,
  //     account.prover,
  //     txAssembler,
  //   );
  // }

  /**
   * Calculates swap variables
   * @param {any} config - The Cardano configuration
   * @param {any} minOutput - The minimum output
   * @returns {[number, SwapExtremums]}
   */
  private calculateSwapVariables(
    config: any,
    minOutput: any,
  ): [number, SwapExtremums] {
    const swapVariables = swapVars(
      BigInt(config.network.defaultMinerFee.multipliedBy(3).toString()),
      config.network.minNitro,
      minOutput,
    );
    if (!swapVariables) throw new Error('Error in swap vars!');
    return swapVariables;
  }

  /**
   * Prepares inputs for the swap
   * @param {any[]} utxos - The unspent transaction outputs
   * @param {any} from - The from asset
   * @param {BigInt} baseInputAmount - The base input amount
   * @param {any} config - The Cardano configuration
   * @param {SwapExtremums} extremum - The swap extremums
   * @returns {any[]}
   */
  private prepareInputs(
    utxos: any[],
    from: any,
    baseInputAmount: BigNumber,
    config: any,
    extremum: SwapExtremums,
  ): BoxSelection {
    return getInputs(
      utxos.map((utxo) => ({
        ...utxo,
        value: BigNumber(utxo.value),
        assets: utxo.assets.map((asset: any) => ({
          ...asset,
          amount: BigNumber(asset.amount),
        })),
      })),
      [new AssetAmount(from.asset, BigInt(baseInputAmount.toString()))],
      {
        minerFee: BigInt(config.network.defaultMinerFee.toString()),
        uiFee: BigInt(config.network.defaultMinerFee.toString()),
        exFee: BigInt(extremum.maxExFee.toString()),
      },
    );
  }

  /**
   * Creates swap parameters
   * @param {Pool} pool - The pool to use for the swap
   * @param {string} output_address - The output address
   * @param {any} baseInput - The base input
   * @param {any} to - The to asset
   * @param {[number, SwapExtremums]} swapVariables - The swap variables
   * @param {any} config - The Cardano configuration
   * @returns {SwapParams<NativeExFeeType>}
   */
  private createSwapParams(
    pool: Pool,
    output_address: string,
    baseInput: any,
    to: any,
    swapVariables: [number, SwapExtremums],
    config: any,
  ): SwapParams<NativeExFeeType> {
    const [exFeePerToken, extremum] = swapVariables;
    const pk = publicKeyFromAddress(output_address);
    if (!pk) throw new Error(`output_address is not defined.`);

    return {
      poolId: pool.id,
      pk,
      baseInput,
      minQuoteOutput: extremum.minOutput.amount,
      exFeePerToken,
      uiFee: BigInt(config.network.defaultMinerFee.toString()),
      quoteAsset: to.asset.id,
      poolFeeNum: pool.poolFeeNum,
      maxExFee: extremum.maxExFee,
    };
  }

  // /** // don't context in the cardano transactions
  //  * Creates transaction context
  //  * @param {any[]} inputs - The transaction inputs
  //  * @param {NetworkContext} networkContext - The network context
  //  * @param {string} return_address - The return address
  //  * @param {any} config - The Cardano configuration
  //  * @returns {TransactionContext}
  //  */
  // private createTxContext(
  //   inputs: BoxSelection,
  //   networkContext: NetworkContext,
  //   return_address: string,
  //   config: any,
  // ): TransactionContext {
  //   return getTxContext(
  //     inputs,
  //     networkContext,
  //     return_address,
  //     BigInt(config.network.defaultMinerFee.toString()),
  //   );
  // }

  /**
   * Gets the block timestamp
   * @param {MaestroSupportedNetworks} networkContext - The network context
   * @returns {Promise<number>}
   */
  private async getBlockTimestamp(
    network: MaestroSupportedNetworks,
  ): Promise<number> {
    const blockInfo = await this._node.blocks.blockInfo(
      String(await this.getNetworkHeight()),
    );
    return Number(blockInfo.data.timestamp);
  }

  // /**
  //  * Submits a transaction
  //  * @param {CardanoAccount} account - The account submitting the transaction
  //  * @param {any} tx - The transaction to submit
  //  */
  // private async submitTransaction(
  //   account: CardanoAccount,
  //   tx: any,
  // ): Promise<void> {
  //   const submit_tx = await account.prover.submit(tx);
  //   if (!submit_tx.id) throw new Error(`Error during submit tx!`);
  // }

  /**
   * Creates a trade response
   * @param {CardanoToken} realBaseToken - The base token
   * @param {CardanoToken} realQuoteToken - The quote token
   * @param {BigNumber} amount - The amount
   * @param {any} from - The from asset
   * @param {any} minOutput - The minimum output
   * @param {Pool} pool - The pool used for the swap
   * @param {boolean} sell - Whether it's a sell operation
   * @param {any} config - The Cardano configuration
   * @param {number} timestamp - The transaction timestamp
   * @param {any} tx - The transaction
   * @returns {TradeResponse}
   */
  private createTradeResponse(
    realBaseToken: CardanoToken,
    realQuoteToken: CardanoToken,
    amount: BigNumber,
    price: string,
    // from: any,
    minOutput: any,
    // pool: SplashPool,
    sell: boolean,
    // config: any,
    // timestamp: number,
    estimatedFee: number,
    txHash: any,
  ): TradeResponse {
    const xDecimals = realBaseToken.decimals;
    const yDecimals = realQuoteToken.decimals;

    return {
      network: this._network,
      timestamp: await this.getBlockTimestamp(this._network),
      latency: 0,
      base: realBaseToken.symbol,
      quote: realQuoteToken.symbol,
      amount: sell
        ? String(amount.multipliedBy(10).pow(xDecimals))
        : String(amount.multipliedBy(10).pow(yDecimals)),
      rawAmount: String(amount),
      expectedOut: sell
        ? String(minOutput.multipliedBy(10).pow(xDecimals))
        : String(minOutput.multipliedBy(10).pow(yDecimals)),

      price,
      gasPrice: this.minFee, // ada price to what ? not applicable
      gasPriceToken: 'ADA',
      gasLimit: this.minFee, // not applicable
      gasCost: String(estimatedFee), // the total transaction fee in ada,
      txHash,
      // --------------
      // network: this.network,
      // timestamp,
      // latency: 0,
      // base: realBaseToken.symbol,
      // quote: realQuoteToken.symbol,
      // amount: String(amount),
      // // rawAmount: sell ? String(amount.multipliedBy(10).pow(xDecimals)) : String(amount.multipliedBy(10).pow(yDecimals)),
      // expectedOut: this.formatAmount(
      //   BigNumber(minOutput.amount.toString()),
      //   sell ? xDecimals : yDecimals,
      // ),
      // price: this.calculatePrice(minOutput, from, sell, xDecimals, yDecimals),
      // gasPrice: this.calculateGas(config.network.minTxFee),
      // gasPriceToken: 'ERG',
      // gasLimit: this.calculateGas(config.network.minTxFee),
      // gasCost: this.calculateGas(config.network.minTxFee).toString(),
      // txHash: tx.id,
    };
  }

  // /**
  //  * Creates a price response
  //  * @param {CardanoToken} realBaseToken - The base token
  //  * @param {CardanoToken} realQuoteToken - The quote token
  //  * @param {BigNumber} amount - The amount
  //  * @param {any} from - The from asset
  //  * @param {any} minOutput - The minimum output
  //  * @param {Pool} pool - The pool used for the swap
  //  * @param {boolean} sell - Whether it's a sell operation
  //  * @param {any} config - The Cardano configuration
  //  * @param {BigNumber} expectedAmount - The expected amount
  //  * @returns {PriceResponse}
  //  */
  // private createPriceResponse(
  //   realBaseToken: CardanoToken,
  //   realQuoteToken: CardanoToken,
  //   amount: BigNumber,
  //   from: any,
  //   minOutput: any,
  //   pool: SplashPool,
  //   sell: boolean,
  //   config: any,
  //   expectedAmount: BigNumber,
  // ): PriceResponse {
  //   const xDecimals = pool.x.asset.decimals as number;
  //   const yDecimals = pool.y.asset.decimals as number;

  //   return {
  //     base: realBaseToken.symbol,
  //     quote: realQuoteToken.symbol,
  //     amount: this.formatAmount(amount, sell ? xDecimals : yDecimals),
  //     rawAmount: this.formatAmount(amount, sell ? xDecimals : yDecimals),
  //     expectedAmount: expectedAmount.toString(),
  //     price: this.calculatePrice(minOutput, from, sell, xDecimals, yDecimals),
  //     network: this.network,
  //     timestamp: Date.now(),
  //     latency: 0,
  //     gasPrice: this.calculateGas(config.network.minTxFee),
  //     gasPriceToken: 'ERG',
  //     gasLimit: this.calculateGas(config.network.minTxFee),
  //     gasCost: this.calculateGas(config.network.minTxFee).toString(),
  //   };
  // }

  // /**
  //  * Formats an amount with proper decimals
  //  * @param {BigNumber} amount - The amount to format
  //  * @param {number} decimals - The number of decimals
  //  * @returns {string}
  //  */
  // private formatAmount(amount: BigNumber, decimals: number): string {
  //   return amount.div(BigNumber(10).pow(decimals)).toString();
  // }

  // /**
  //  * Calculates the price
  //  * @param {any} minOutput - The minimum output
  //  * @param {any} from - The from asset
  //  * @param {boolean} sell - Whether it's a sell operation
  //  * @param {number} xDecimals - The decimals of the x asset
  //  * @param {number} yDecimals - The decimals of the y asset
  //  * @returns {string}
  //  */
  // private calculatePrice(
  //   minOutput: any,
  //   from: any,
  //   sell: boolean,
  //   xDecimals: number,
  //   yDecimals: number,
  // ): string {
  //   if (sell) {
  //     return BigNumber(1)
  //       .div(
  //         BigNumber(minOutput.amount.toString())
  //           .div(BigNumber(10).pow(xDecimals))
  //           .div(
  //             BigNumber(from.amount.toString()).div(
  //               BigNumber(10).pow(yDecimals),
  //             ),
  //           ),
  //       )
  //       .toString();
  //   } else {
  //     return BigNumber(minOutput.amount.toString())
  //       .div(BigNumber(10).pow(yDecimals))
  //       .div(
  //         BigNumber(from.amount.toString()).div(BigNumber(10).pow(xDecimals)),
  //       )
  //       .toString();
  //   }
  // }

  // /**
  //  * Calculates gas-related values
  //  * @param {number} minTxFee - The minimum transaction fee
  //  * @returns {number}
  //  */
  // private calculateGas(minTxFee: number): number {
  //   return BigNumber(minTxFee).div(BigNumber(10).pow(6)).toNumber();
  // }

  // /**
  //  * Gets a pool by its ID
  //  * @param {string} id - The pool ID
  //  * @returns {Pool} The pool
  //  */
  // public getPool(id: string): Pool {
  //   return <Pool>this.ammPools.find((ammPool) => ammPool.id === id);
  // } // i don't think we need it (@arman)

  // /**
  //  * Gets pools by token pair
  //  * @param {string} baseToken - The base token symbol
  //  * @param {string} quoteToken - The quote token symbol
  //  * @returns {Pool[]} The pools matching the token pair
  //  */
  // public getPoolByToken(baseToken: string, quoteToken: string): Pool[] {
  //   const realBaseToken = this.storedAssetList.find(
  //     (asset) => asset.symbol === baseToken,
  //   );
  //   const realQuoteToken = this.storedAssetList.find(
  //     (asset) => asset.symbol === quoteToken,
  //   );
  //   if (!realBaseToken || !realQuoteToken)
  //     throw new Error(`Pool not found for ${baseToken} and ${quoteToken}`);
  //   return <Pool[]>(
  //     this.ammPools.filter(
  //       (ammPool) =>
  //         (ammPool.x.asset.id === realBaseToken.tokenId &&
  //           ammPool.y.asset.id === realQuoteToken.tokenId) ||
  //         (ammPool.x.asset.id === realQuoteToken.tokenId &&
  //           ammPool.y.asset.id === realBaseToken.tokenId),
  //     )
  //   );
  // } // i don't think we need it (@arman)

  /**
   * Gets a transaction by its hash
   * @param {string} txHash - The transaction hash
   * @returns {Promise<TransactionInfo | undefined>} The transaction details
   */
  public async getTx(txHash: string): Promise<TransactionInfo | undefined> {
    return (await this._node.transactions.txInfo(txHash)).data;
  }

  /**
   * Gets a transactions of a address
   * @param {string} address - The address included with the transactions
   * @returns {Promise<AddressTransaction[] | undefined>} The transaction details
   */
  public async getAddressTxs(
    address: string,
    limit?: number,
    sortDirection?: string,
    offset?: string,
  ): Promise<AddressTransaction[] | undefined> {
    return (
      await this._node.addresses.txsByAddress(address, {
        count: limit || 100,
        cursor: offset || '0',
        order: (sortDirection as TxsByAddressOrderEnum) || 'desc',
      })
    ).data;
  }

  /**
   * Gets the stats of a transaction
   * @param {string} txHash - The transaction hash
   * @returns {Promise<TxManagerState | undefined>} The transaction details
   */
  public async getTxState(txHash: string): Promise<TxManagerState | undefined> {
    return await this._node.txManager.txManagerState(txHash);
  }
}
