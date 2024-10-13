import LRUCache from 'lru-cache';
import {
  CardanoConfig,
  CardanoConnectedInstance,
  CardanoToken,
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
  TxsByAddressOrderEnum,
  Utxo,
} from '@maestro-org/typescript-sdk';
import fse from 'fs-extra';
import {
  cborHexToBytes,
  Currency,
  hexToString,
  Price,
  Splash,
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
  private _assetMap: Record<string, CardanoToken> = {};
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
      Cardano._instances.set(
        instanceName,
        new Cardano(network, config, 1, {}, {}),
      );
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
    wallet: CardanoWallet,
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

    let txHash = this.signAndSubmitTransaction(
      wallet,
      Buffer.from(cborHexToBytes(swapTx.cbor)),
    );

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

  /**
   * Estimates the price for a swap
   * @param {string} baseToken - The base token symbol
   * @param {string} quoteToken - The quote token symbol
   * @param {BigNumber} value - The amount to swap
   * @param {number} [slippage] - The slippage tolerance
   * @returns {Promise<PriceResponse>} The price estimate
   */
  public async estimate(
    baseToken: string,
    quoteToken: string,
    value: BigNumber,
    slippage?: number,
  ): Promise<PriceResponse> {
    // fetching the tokens
    let realBaseToken = this.findToken(baseToken);
    let realQuoteToken = this.findToken(quoteToken);

    if (!realBaseToken || !realQuoteToken) {
      throw new Error('unsupported token ?');
    }

    // const config = getCardanoConfig(this.network);

    let sell: boolean;

    if (
      this._splashPools[
        getNftBase16Names(
          realBaseToken.token.asset.nameBase16,
          realQuoteToken.token.asset.nameBase16,
        ).quoteToBase
      ]
    ) {
      sell = true;
    } else if (
      this._splashPools[
        getNftBase16Names(
          realBaseToken.token.asset.nameBase16,
          realQuoteToken.token.asset.nameBase16,
        ).baseToQuote
      ]
    ) {
      sell = false;
    } else {
      throw new Error("didn't found the pool");
    }

    return this.createPriceResponse(
      realBaseToken,
      realQuoteToken,
      value,
      // from,
      // minOutput,
      // pool,
      sell,
      // config,
      // price,
      slippage ? String(slippage) : '1',
      // -----
      // baseToken: CardanoToken,
      // quoteToken: CardanoToken,
      // amount: BigNumber,
      // minOutput: any,
      // sell: boolean,
      // priceLimit: string,
      // estimatedFee: number,
    );
  }

  /**
   * Finds a token by its symbol
   * @param {string} symbol - The token symbol
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
   * @param {CardanoWallet} account - The account submitting the transaction
   * @param {any} tx - The transaction to submit
   */
  private async signAndSubmitTransaction(
    wallet: CardanoWallet,
    tx: Buffer,
  ): Promise<string> {
    try {
      let signedtx = wallet.sing(tx); //separate

      let txHash = await this._node.txManager.txManagerSubmit(signedtx);

      return txHash;
    } catch (err) {
      throw new Error(
        `Error while signing and submitting the transaction: \n ${err}`,
      );
    }
  }

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
      expectedOut:this.toRaw(minOutput,decimals),
      price,
      gasPrice: this.minFee, // ada price to what ? not applicable
      gasPriceToken: 'ADA',
      gasLimit: this.minFee, // not applicable
      gasCost: String(estimatedFee), // the total transaction fee in ada,
      txHash,
    };
  }

  /**
   * Creates a price response
   * @param {CardanoToken} realBaseToken - The base token
   * @param {CardanoToken} realQuoteToken - The quote token
   * @param {BigNumber} amount - The amount
   * @param {any} from - The from asset
   * @param {any} minOutput - The minimum output
   * @param {boolean} sell - Whether it's a sell operation
   * @param {any} config - The Cardano configuration
   * @param {BigNumber} expectedAmount - The expected amount
   * @returns {PriceResponse}
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

    let minOutput = this.calculateMinOutput(amount, BigNumber(price), decimals, Number(slippage));

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

  public calculateMinOutput(amount:  BigNumber, price : BigNumber, decimals: number, slippage: number ): BigNumber {
    return amount
    .multipliedBy(this.fromRaw(price, decimals))
    .multipliedBy(slippage / 100);
  }

  /**
   * Formats an amount with proper decimals
   * @param {BigNumber} amount - The amount to format
   * @param {number} decimals - The number of decimals
   * @returns {string}
   */
  private fromRaw(amount: BigNumber, decimals: number): string {
    return amount.div(BigNumber(10).pow(decimals)).toString();
  }

  /**
   * Formats an amount with proper decimals
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
