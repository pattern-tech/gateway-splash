import LRUCache from 'lru-cache';
import {
  CardanoConfig,
  CardanoConnectedInstance,
  CardanoToken,
  TxRequestParams,
} from './interfaces/cardano.interface';

import dotenv from 'dotenv';
dotenv.config();

import { CardanoController } from './cardano.controller';
import {
  AddressTransaction,
  MaestroClient,
  MaestroSupportedNetworks,
  TransactionInfo,
  TxManagerState,
  Utxo,
} from '@maestro-org/typescript-sdk';
import fse from 'fs-extra';
import {
  cborHexToBytes,
  Currency,
  hexToString,
  Price,
  Splash,
  stringToHex,
  Transaction,
} from '@splashprotocol/sdk';
import { sha256 } from '@ethersproject/solidity';
import { getCardanoConfig } from './cardano.config';
import {
  getAssetsFromPools,
  getMaestroConfig,
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
import { PriceResponse, TradeResponse } from '../../amm/amm.requests';

/**
 * Main Cardano class for interacting with the cardano blockchain.
 */

export class Cardano {
  private static _instances: LRUCache<string, Cardano>;
  public _assetMap: Record<string, CardanoToken> = {};
  private _chain: string = 'cardano';
  private _network: MaestroSupportedNetworks;
  private _node: MaestroClient;
  private _dex: Splash<SplashClientType>;
  private _splashPools: Record<string, SplashPool[]>; // key : nft name16base + pool policy id
  private _ready: boolean = false;
  public minFee: number;
  public controller: CardanoController;
  private utxosLimit: number;
  private timeout: number;
  private defaultSlippage: TradeSlippage;

  /**
   * Creates an instance of Cardano.
   * @param {CardanoNetwork} network - The Cardano network to connect to ('mainnet' or 'testnet')
   */
  private constructor(
    network: MaestroSupportedNetworks,
    config: CardanoConfig,
    minFee: number, //manual
    splashPools: Record<string, SplashPool[]>,
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
    this.defaultSlippage = config.network.defaultSlippage as TradeSlippage;
    this._splashPools = splashPools;
  }

  /**
   * Initializes the Ergo instance
   * @returns {Promise<void>}
   */
  public async init(): Promise<void> {
    await this.loadAssets();
    await this.loadPools();
    this._ready = true;
    return;
  }

  /**
   * Gets or creates an Cardano instance
   * @param {MaestroSupportedNetworksNetwork} network - The supported maestro network to connect to
   * @returns {Cardano}
   * @static
   */
  public static getInstance(
    network: MaestroSupportedNetworks,
    name?: string,
  ): Cardano {
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
      Cardano._instances.set(instanceName, new Cardano(network, config, 1, {}));
    }

    let instance = Cardano._instances.get(instanceName) as Cardano;

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
  public async ready(): Promise<boolean> {
    const protocolParams = (await this._node.general.protocolParameters()).data;

    this.minFee =
      protocolParams.min_fee_coefficient +
      protocolParams.min_fee_constant.ada.lovelace;
    // we load pools then we fetch the tokens from it
    await this.loadPools();

    // fetching tokens from it
    await this.loadAssets();
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

  /** // @arman
   * Gets the current block number
   * @returns {Promise<number>}
   */
  async getCurrentBlockNumber(): Promise<number> {
    const status = await this.getNetworkHeight();
    return status + 1;
  }

  /**
   * Gets either all of the unspent tx's or Utxos with specific address for a given address
   * @param {string} address - The address to get unspent transactions for
   * @param {string} asset - (optional) The asset name
   * @returns {Promise<CardanoBox[]>}
   */
  async getAddressUtxos(address: string, params?: TxRequestParams) {
    let utxos: Array<Utxo> = [];

    utxos = (
      await this._node.addresses.utxosByAddress(address, {
        count: params?.limit || this.utxosLimit,
        order: params?.sortDirection || 'desc',
        cursor: params?.offset || '0',
        asset: params?.asset || null,
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

  // -- checked till here -- //
  /**
   * Gets the balance of a specific asset for an account
   * @param {string} accountAddress - The account to get the balance for
   * @param {string} assetName - The name of the asset
   * @returns {Promise<string>} The balance of the asset
   * @throws {Error} If the asset is not found or there's a problem fetching UTXOs
   */
  public async getAssetBalance(
    accountAddress: string,
    assetName: string,
  ): Promise<string> {
    if (
      assetName.toUpperCase() === 'LOVELACE' ||
      assetName.toUpperCase() === 'ADA'
    ) {
      throw new Error('use `getAdaBalance` function !');
    }
    const CardanoToken = this._assetMap[assetName];
    if (!CardanoToken) {
      throw new Error(`Asset '${assetName}' not found in ${this._chain} Node!`);
    }

    try {
      const utxos = await this.getAddressUtxos(accountAddress, {
        asset: `${CardanoToken.policyId}${stringToHex(CardanoToken.name)}`,
      });

      const balance = utxos.reduce(
        (total, utxo) =>
          utxo.assets.reduce(
            (utxoTotal, asset) => utxoTotal.plus(asset.amount),
            total,
          ),
        BigNumber(0),
      );

      return this.fromRaw(balance, CardanoToken.decimals);
    } catch (error) {
      throw new Error(
        `Error fetching account assets from ${this._chain} Node: ${error}`,
      );
    }
  }

  /**
   * Gets the balance of ADA
   * @param {Utxo[]} utxos - The unspent transaction outputs
   * @returns {Prmoise<string>}
   */
  public async getAdaBalance(accountAddress: string): Promise<string> {
    try {
      return this.fromRaw(
        BigNumber(
          String(
            (await this._node.addresses.addressBalance(accountAddress))
              .lovelace,
          ),
        ),
        6,
      );
    } catch (error) {
      throw new Error(
        `Error while fetching the ${accountAddress} balance, Node: ${error}`,
      );
    }
  }

  /**
   * Gets the balance of ADA and assets from unspent transaction outputs
   * @param {Utxo[]} utxos - The unspent transaction outputs
   * @returns {{ balance: BigNumber, assets: Record<string, BigNumber> }}
   */
  public getBalance(utxos: Utxo[]) {
    const assets: Record<string, BigNumber> = {};

    for (const utxo of utxos) {
      for (const asset of utxo.assets) {
        const { unit, amount } = asset;
        const isAda = unit.toUpperCase() === 'LOVELACE';
        const tokenName = isAda ? 'ADA' : hexToString(unit.slice(56));
        const tokenDecimals = isAda
          ? 6
          : this.findToken(tokenName)?.decimals ?? 6;

        assets[tokenName] = BigNumber(
          this.fromRaw(
            (assets[tokenName] || BigNumber(0)).plus(BigNumber(amount)),
            tokenDecimals,
          ),
        );
      }
    }
    let balance = assets['ADA'];
    delete assets['ADA'];

    return { balance, assets };
  }

  /**
   * Loads assets from the DEX
   * @private
   */
  private async loadAssets() {
    this._assetMap = await getAssetsFromPools(this._node, this._splashPools);
  }

  /**
   * Loads AMM pools
   * @private
   */
  private async loadPools(): Promise<void> {
    this._splashPools = await getSplashPools(this._dex);
  }

  /**
   * Performs a swap operation
   * @param {CardanoWallet} wallet - The wallet performing the swap
   * @param {string} baseToken - The base token name
   * @param {string} quoteToken - The quote token name
   * @param {BigNumber} amount - The amount to swap
   * @param {string} priceLimit - Either the swap is a limit order or a market price swap
   * @param {boolean} sell - Either the swap is sell or buy position
   * @param {TradeSlippage} slippage - The slippage tolerance
   * @returns {Promise<TradeResponse>} The trade response
   */

  public async swap(
    wallet: CardanoWallet,
    baseToken: string,
    quoteToken: string,
    amount: BigNumber,
    priceLimit?: string,
    sell: boolean = false,
    slippage: TradeSlippage = this.defaultSlippage,
  ): Promise<TradeResponse> {
    const [baseCardanoToken, quoteCardanoToken] = this.validateTokens(
      baseToken,
      quoteToken,
    );
    const [inputToken, outputToken] = this.createTokens(
      baseCardanoToken,
      quoteCardanoToken,
      amount,
      sell,
    );

    const poolNftNamesBase16 = getNftBase16Names(
      baseCardanoToken.token.asset.nameBase16,
      quoteCardanoToken.token.asset.nameBase16,
    );

    this.validatePool(poolNftNamesBase16);

    const price = await this.getPrice(
      baseCardanoToken,
      quoteCardanoToken,
      amount,
      priceLimit,
      sell,
    );

    const swapTx = await this.createSwapTransaction(
      inputToken,
      outputToken,
      price,
      Number(slippage),
    );

    const estimatedFee = await this.estimateFee(swapTx);
    const txHash = await this.signAndSubmitTransaction(
      wallet,
      Buffer.from(cborHexToBytes(swapTx.cbor)),
    );

    const minOutput = this.calculateMinOutput(
      amount,
      BigNumber(price.raw),
      outputToken.asset.decimals,
      Number(slippage),
    );

    return this.createTradeResponse(
      baseCardanoToken,
      quoteCardanoToken,
      amount,
      String(price),
      minOutput,
      sell,
      estimatedFee,
      txHash,
    );
  }

  /**
   * Validates the base and quote tokens for a swap
   * @param {string} baseToken - The symbol or name of the base token
   * @param {string} quoteToken - The symbol or name of the quote token
   * @returns {[CardanoToken, CardanoToken]} An array containing the validated base and quote CardanoTokens
   * @throws {Error} If either the base or quote token is not supported by the DEX
   */
  private validateTokens(
    baseToken: string,
    quoteToken: string,
  ): [CardanoToken, CardanoToken] {
    const baseCardanoToken = this.findToken(baseToken.toUpperCase());
    const quoteCardanoToken = this.findToken(quoteToken.toUpperCase());

    if (!baseCardanoToken)
      throw new Error(
        `The ${baseToken.toUpperCase()} token is not supported by splash dex!`,
      );
    if (!quoteCardanoToken)
      throw new Error(
        `The ${quoteToken.toUpperCase()} token is not supported by splash dex!`,
      );

    return [baseCardanoToken, quoteCardanoToken];
  }

  /**
   * Creates Currency objects for the input and output tokens of a swap
   * @param {CardanoToken} baseCardanoToken - The base token
   * @param {CardanoToken} quoteCardanoToken - The quote token
   * @param {BigNumber} amount - The amount to swap
   * @param {boolean} sell - Whether this is a sell operation
   * @returns {[Currency, Currency]} An array containing the input and output Currency objects
   */
  private createTokens(
    baseCardanoToken: CardanoToken,
    quoteCardanoToken: CardanoToken,
    amount: BigNumber,
    sell: boolean,
  ): [Currency, Currency] {
    const createToken = (cardanoToken: CardanoToken) =>
      cardanoToken.token.withAmount(
        BigInt(this.toRaw(amount, cardanoToken.decimals)),
      );

    const inputToken = createToken(baseCardanoToken);
    const outputToken = createToken(quoteCardanoToken);

    baseCardanoToken.token = inputToken;
    quoteCardanoToken.token = outputToken;

    return sell ? [inputToken, outputToken] : [outputToken, inputToken];
  }

  /**
   * Validates that a pool exists for the given token pair
   * @param {Object} poolNftNamesBase16 - Object containing base16 encoded pool NFT names
   * @param {string} poolNftNamesBase16.baseToQuote - Base to quote pool NFT name
   * @param {string} poolNftNamesBase16.quoteToBase - Quote to base pool NFT name
   * @throws {Error} If no pool is found for the token pair
   */
  private validatePool(poolNftNamesBase16: {
    baseToQuote: string;
    quoteToBase: string;
  }): void {
    if (
      !this._splashPools[poolNftNamesBase16.baseToQuote] &&
      !this._splashPools[poolNftNamesBase16.quoteToBase]
    ) {
      throw new Error(
        `The ${poolNftNamesBase16.baseToQuote.slice(0, -6).split('5f')} pair is not supported by splash dex!`,
      );
    }
  }

  /**
   * Gets the price for a swap
   * @param {CardanoToken} baseCardanoToken - The base token
   * @param {CardanoToken} quoteCardanoToken - The quote token
   * @param {BigNumber} amount - The amount to swap
   * @param {string | undefined} priceLimit - Optional price limit for the swap
   * @param {boolean} sell - Whether this is a sell operation
   * @returns {Promise<Price>} A promise that resolves to the price for the swap
   */
  private async getPrice(
    baseCardanoToken: CardanoToken,
    quoteCardanoToken: CardanoToken,
    amount: BigNumber,
    priceLimit: string | undefined,
    sell: boolean,
  ): Promise<Price> {
    if (priceLimit) {
      return Price.new({
        base: baseCardanoToken.token.asset,
        quote: quoteCardanoToken.token.asset,
        raw: priceLimit,
      });
    }

    const orderBook = await this._dex.api.getOrderBook({
      base: baseCardanoToken.token.asset,
      quote: quoteCardanoToken.token.asset,
    });

    return this._dex.utils.selectEstimatedPrice({
      orderBook,
      input: (sell ? baseCardanoToken : quoteCardanoToken).token.withAmount(
        BigInt(amount.toNumber()),
      ),
      priceType: 'average',
    });
  }

  /**
   * Creates a swap transaction
   * @param {Currency} inputToken - The input token for the swap
   * @param {Currency} outputToken - The output token for the swap
   * @param {Price} price - The price for the swap
   * @param {number} slippage - The slippage tolerance for the swap
   * @returns {Promise<Transaction>} A promise that resolves to the created swap transaction
   */
  private async createSwapTransaction(
    inputToken: Currency,
    outputToken: Currency,
    price: Price,
    slippage: number,
  ): Promise<Transaction> {
    return await this._dex
      .newTx()
      .spotOrder({
        input: inputToken,
        outputAsset: outputToken.asset,
        price,
        slippage,
      })
      .complete();
  }

  /**
   * Estimates the fee for a swap transaction
   * @param {Transaction} swapTx - The swap transaction
   * @returns {Promise<number>} A promise that resolves to the estimated fee
   */
  private async estimateFee(swapTx: Transaction): Promise<number> {
    const protocolParams = (await this._node.general.protocolParameters()).data;
    return (
      protocolParams.min_fee_coefficient +
      protocolParams.min_fee_constant.ada.lovelace *
        cborHexToBytes(swapTx.cbor).length
    );
  }

  /**
   * Estimates the price for a swap
   * @param {string} baseToken - The base token symbol
   * @param {string} quoteToken - The quote token symbol
   * @param {BigNumber} amount - The amount to swap
   * @param {TradeSlippage} slippage - The slippage tolerance
   * @returns {Promise<PriceResponse>} The price estimate
   */
  public async estimate(
    baseToken: string,
    quoteToken: string,
    amount: BigNumber,
    slippage: TradeSlippage = this.defaultSlippage,
  ): Promise<PriceResponse> {
    const [realBaseToken, realQuoteToken] = this.validateTokens(
      baseToken.toUpperCase(),
      quoteToken.toUpperCase(),
    );
    let nftBase16Name = getNftBase16Names(
      realBaseToken.token.asset.nameBase16,
      realQuoteToken.token.asset.nameBase16,
    );

    let sell: boolean;

    if (this._splashPools[nftBase16Name.quoteToBase]) {
      sell = true;
    } else if (this._splashPools[nftBase16Name.baseToQuote]) {
      sell = false;
    } else {
      throw new Error("didn't find the pool");
    }

    return this.createPriceResponse(
      realBaseToken,
      realQuoteToken,
      amount,
      sell,
      slippage,
    );
  }

  /**
   * Finds a token by its symbol or name
   * @param {string} symbolOrName - The token symbol or name
   * @returns {CardanoToken}
   */
  private findToken(symbolOrName: string): CardanoToken | undefined {
    const token = this.storedAssetList.find(
      (asset) =>
        asset.symbol === symbolOrName.toUpperCase() ||
        asset.name === symbolOrName.toUpperCase(),
    );
    return token;
  }

  /**
   * Gets the block timestamp
   * @returns {Promise<number>}
   */
  private async getBlockTimestamp(): Promise<number> {
    const blockInfo = await this._node.blocks.blockInfo(
      String(await this.getNetworkHeight()),
    );
    return Number(blockInfo.data.timestamp);
  }

  /**
   * Submits a transaction
   * @param {CardanoWallet} wallet - The wallet submitting the transaction
   * @param {Buffer} tx - The transaction to submit
   */
  private async signAndSubmitTransaction(
    wallet: CardanoWallet,
    tx: Buffer,
  ): Promise<string> {
    try {
      let signedTx = wallet.sing(tx); //separate

      let txHash = await this._node.txManager.txManagerSubmit(signedTx);

      return txHash;
    } catch (err) {
      throw new Error(
        `Error while signing and submitting the transaction: \n ${err}`,
      );
    }
  }

  /**
   * Creates a trade response for a completed swap
   * @param {CardanoToken} baseToken - The base token of the trading pair
   * @param {CardanoToken} quoteToken - The quote token of the trading pair
   * @param {BigNumber} amount - The amount of tokens swapped
   * @param {string} price - The price at which the swap occurred
   * @param {any} minOutput - The minimum output amount for the swap
   * @param {boolean} sell - Whether it's a sell operation (true) or buy operation (false)
   * @param {number} estimatedFee - The estimated fee for the swap
   * @param {any} txHash - The transaction hash of the swap
   * @returns {Promise<TradeResponse>} A promise that resolves to the trade response
   */
  private async createTradeResponse(
    baseToken: CardanoToken,
    quoteToken: CardanoToken,
    amount: BigNumber,
    price: string,
    minOutput: any,
    sell: boolean,
    estimatedFee: number,
    txHash: any,
  ): Promise<TradeResponse> {
    const decimals = sell
      ? (baseToken.decimals as number)
      : (quoteToken.decimals as number);

    return {
      network: this._network,
      timestamp: await this.getBlockTimestamp(),
      latency: 0,
      base: baseToken.symbol,
      quote: quoteToken.symbol,
      amount: this.toRaw(amount, decimals),
      rawAmount: String(amount),
      expectedOut: this.toRaw(minOutput, decimals),
      price,
      gasPrice: this.minFee, // ada price to what ? not applicable
      gasPriceToken: 'ADA',
      gasLimit: this.minFee, // not applicable
      gasCost: String(estimatedFee), // the total transaction fee in ada,
      txHash,
    };
  }

  /**
   * Creates a price response for a potential swap
   * @param {CardanoToken} baseToken - The base token of the trading pair
   * @param {CardanoToken} quoteToken - The quote token of the trading pair
   * @param {BigNumber} amount - The amount of tokens to swap
   * @param {boolean} sell - Whether it's a sell operation (true) or buy operation (false)
   * @param {String} [slippage] - Optional. The slippage tolerance for the swap
   * @param {string} [priceLimit] - Optional. The price limit for the swap
   * @param {string} [estimatedFee] - Optional. The estimated fee for the swap
   * @returns {Promise<PriceResponse>} A promise that resolves to the price response
   */
  private async createPriceResponse(
    baseToken: CardanoToken,
    quoteToken: CardanoToken,
    amount: BigNumber,
    sell: boolean,
    slippage?: String,
    priceLimit?: string,
    estimatedFee?: string,
  ): Promise<PriceResponse> {
    const decimals = sell
      ? (baseToken.decimals as number)
      : (quoteToken.decimals as number);

    let price = String(
      (await this.calculatePrice(baseToken, quoteToken, sell, priceLimit)).raw,
    );

    let minOutput = this.calculateMinOutput(
      amount,
      BigNumber(price),
      decimals,
      Number(slippage),
    );

    return {
      base: baseToken.symbol,
      quote: quoteToken.symbol,
      amount: String(amount), // the raw amount that user entered
      rawAmount: this.toRaw(amount, decimals),
      expectedAmount: this.toRaw(minOutput, decimals),
      price,
      network: this.network,
      timestamp: await this.getBlockTimestamp(),
      latency: 0,
      gasPrice: this.minFee, // ada price to what ? not applicable
      gasPriceToken: 'ADA',
      gasLimit: this.minFee, // not applicable
      gasCost: estimatedFee ?? String(this.minFee), // the total transaction fee in ada,
    };
  }

  /**
   * Calculates the minimum output amount for a swap, considering the given slippage
   * @param {BigNumber} amount - The input amount for the swap
   * @param {BigNumber} price - The price of the asset
   * @param {number} decimals - The number of decimal places for the asset
   * @param {number} slippage - The slippage tolerance as a percentage (e.g., 1 for 1%)
   * @returns {BigNumber} The minimum output amount considering the slippage
   */
  public calculateMinOutput(
    amount: BigNumber,
    price: BigNumber,
    decimals: number,
    slippage: number,
  ): BigNumber {
    return amount
      .multipliedBy(this.fromRaw(price, decimals))
      .multipliedBy(slippage / 100);
  }

  /**
   * Formats an raw amount with proper decimals
   * @param {BigNumber} amount - The amount to format
   * @param {number} decimals - The number of decimals
   * @returns {string}
   */
  private fromRaw(amount: BigNumber, decimals: number): string {
    return amount.div(BigNumber(10).pow(decimals)).toString();
  }

  /**
   * Creates an raw amount with proper decimals
   * @param {BigNumber} amount - The amount to format
   * @param {number} decimals - The number of decimals
   * @returns {string}
   */
  private toRaw(amount: BigNumber, decimals: number): string {
    return amount.multipliedBy(BigNumber(10).pow(decimals)).toString();
  }

  /**
   * Calculates the price
   * @param {CardanoToken} baseToken - The base token
   * @param {CardanoToken} quoteToken - The quote token
   * @param {boolean} sell - Whether it's a sell operation
   * @param {string} [priceLimit] - Optional price limit
   * @returns {Promise<Price>}
   */
  private async calculatePrice(
    baseToken: CardanoToken,
    quoteToken: CardanoToken,
    sell: boolean,
    priceLimit?: string,
  ): Promise<Price> {
    if (priceLimit) {
      return Price.new({
        base: baseToken.token.asset,
        quote: quoteToken.token.asset,
        raw: priceLimit,
      });
    }

    const orderBook = await this._dex.api.getOrderBook({
      base: baseToken.token.asset,
      quote: quoteToken.token.asset,
    });

    const input = (sell ? baseToken : quoteToken).token.withAmount(BigInt(1));

    return this._dex.utils.selectEstimatedPrice({
      orderBook,
      input,
      priceType: 'average',
    });
  }

  /**
   * Gets a pool by its token ids without fetching the latest state of the pool
   * @param {string} x - The base token name cbor hex encoded
   * @param {string} y - The quote token name cbor hex encoded
   * @returns {SplashPool[]} The founded pools
   * @throws {Error} If no pools are found
   */
  public getPoolByToken(x: string, y: string): SplashPool[] {
    const { baseToQuote, quoteToBase } = getNftBase16Names(x, y);

    const pools = [
      ...(this._splashPools[baseToQuote] || []),
      ...(this._splashPools[quoteToBase] || []),
    ];

    if (pools.length === 0) {
      throw new Error('pool not found');
    }

    return pools;
  }

  /**
   * Gets a pool by its token ids with fetching the latest state of the pool
   * @param {string} x - The base token name cbor hex encoded
   * @param {string} y - The quote token name cbor hex encoded
   * @returns {SplashPool[]} The pools matching the token pair
   */
  public async fetchLatestPoolByToken(
    x: string,
    y: string,
  ): Promise<SplashPool[]> {
    this._splashPools = await getSplashPools(this._dex);
    return this.getPoolByToken(x, y);
  }

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
    params?: TxRequestParams,
  ): Promise<AddressTransaction[] | undefined> {
    return (
      await this._node.addresses.txsByAddress(address, {
        count: params?.limit || this.utxosLimit,
        order: params?.sortDirection || 'desc',
        cursor: params?.offset || '0',
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
