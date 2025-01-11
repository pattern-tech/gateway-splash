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
  Asset,
  MaestroClient,
  MaestroSupportedNetworks,
  TokenRegistryMetadata,
  TransactionInfo,
  TxManagerState,
  UtxoWithSlot,
} from '@maestro-org/typescript-sdk';
import fse from 'fs-extra';
import {
  AssetInfo,
  Currency,
  hexToString,
  Price,
  stringToHex,
  Transaction,
  selectEstimatedPrice,
  HotWallet,
  isOOROrder,
} from '@splashprotocol/sdk';
import { getCardanoConfig } from './cardano.config';
import {
  getAssetsFromPools,
  getMaestroConfig,
  getNftBase16Names,
  getSplashInstance,
  getSplashPools,
  getTokenMetadata,
  getTokenMetadataWithBackoff,
  updateTokenMetadata,
} from './cardano.utils';
import { SplashPool } from './types/cardano.types';
import { SplashInstance, TradeSlippage } from './types/node.types';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { BigNumber } from 'bignumber.js';
import { CardanoWallet } from './wallet.service';
import { walletPath } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { PriceResponse, TradeResponse } from '../../amm/amm.requests';
import axios from 'axios';

/**
 * Main Cardano class for interacting with the cardano blockchain.
 */

export class Cardano {
  private static _instances: LRUCache<string, Cardano>;
  private static _tokenMetadata: LRUCache<string, TokenRegistryMetadata>;
  public _assetMap: Record<string, CardanoToken> = {};
  private _chain: string = 'cardano';
  private _network: MaestroSupportedNetworks;
  private _node: MaestroClient;
  private _dex: SplashInstance;
  private _splashPools: Record<string, SplashPool[]>; // key : nft name16base + pool policy id
  private _ready: boolean = false;
  public minFee: number;
  public controller: CardanoController;
  private utxosLimit: number;
  private defaultSlippage: TradeSlippage;
  private static maestroApiKey: string | undefined;

  /**
   * Synchronously Creates an instance of Cardano.
   * @param {CardanoNetwork} network - The Cardano network to connect to ('mainnet', 'preprod' or 'testnet')
   */
  public constructor(
    network: string,
    config: CardanoConfig,
    minFee: number, //manual
    splashPools: Record<string, SplashPool[]>,
    maestroApiKey?: string | undefined,
  ) {
    Cardano.maestroApiKey = maestroApiKey;
    let new_network: MaestroSupportedNetworks;
    network = network.toLowerCase();
    if (network === 'mainnet') {
      new_network = 'Mainnet';
    } else if (network === 'preprod') new_network = 'Preprod';
    else new_network = 'Preview';
    this._network = new_network;
    this._node = new MaestroClient(
      getMaestroConfig(new_network, config.network.nodeURL),
    );

    this._dex = getSplashInstance(new_network);
    this.controller = CardanoController;
    this.minFee = minFee; // the "1" is the init number, must be changed for each transaction based on the transaction size
    this.utxosLimit = config.network.utxosLimit; // maximum number of utxos while using the `getAddressUtxos`
    // this.timeout = config.network.timeOut;
    this.defaultSlippage = config.network.defaultSlippage as TradeSlippage;
    this._splashPools = splashPools;
  }

  /**
   * Asynchronously Initializes the Cardano instance
   * @returns {Promise<void>}
   */
  public async init(): Promise<void> {
    await this.loadPools();
    await this.loadAssets();
    // // fetching and caching the tokens metadata if not cached yet
    await this.loadTokenMetadata();
    this._ready = true;
    return;
  }

  /**
   * Asynchronously loads the tokens metadata in batches
   * @requires  loadAssets Requires the loadAssets to be called before
   * @requires  loadPools Requires the loadPools to be called before
   * @returns {Promise<void>}
   */
  private async loadTokenMetadata(): Promise<void> {
    // loading the metadata with backoff
    try {
      Cardano._tokenMetadata = await getTokenMetadataWithBackoff(
        Object.values(this._assetMap),
        this._node,
      );
    } catch {
      this._node = new MaestroClient(
        getMaestroConfig('Mainnet', 'https://mainnet.gomaestro-api.org/v1'),
      );
      await this.updateSplash();
    }
    return;
  }

  /**
   * Checks the validation of the given Maestro API key
   * @returns {Promise<void>}
   */
  static async APIKeyValidation(
    maestroApiKey: string | undefined,
  ): Promise<void> {
    if (Cardano.maestroApiKey != undefined || maestroApiKey != undefined) {
      try {
        const url = 'https://mainnet.gomaestro-api.org/v1/chain-tip';
        await axios.get(url, {
          headers: { 'api-key': maestroApiKey },
        });
        if (maestroApiKey != '' || maestroApiKey != undefined) {
          Cardano.maestroApiKey = maestroApiKey;
        }
      } catch {
        if (Cardano.maestroApiKey == '' || Cardano.maestroApiKey == undefined) {
          throw new Error('API key is invalid or expired.');
        }
      }
    }
  }
  /**
   * Gets or creates a Cardano instance
   * @param {MaestroSupportedNetworksNetwork} network - The supported maestro network to connect to
   * @param name - The name of the network
   * @returns {Cardano}
   * @static
   */
  public static getInstance(
    network: string,
    maestroApiKey: string | undefined,
    name?: string,
  ): Cardano {
    try {
      const instanceName = name || network;

      // Initialize _instances if it doesn't exist
      if (!Cardano._instances) {
        const config = getCardanoConfig(network);
        Cardano._instances = new LRUCache<string, Cardano>({
          max: Number(config.network.maxLRUCacheInstances),
        });
      }

      // Try to get existing instance
      const cardanoInstance = Cardano._instances.get(instanceName);

      if (cardanoInstance) {
        return cardanoInstance;
      }
      if (maestroApiKey == '' || maestroApiKey == undefined) {
        throw new Error('Please connect to the gateway first.');
      }

      const config = getCardanoConfig(network);

      Cardano._instances.set(
        instanceName,
        new Cardano(
          network as MaestroSupportedNetworks,
          config,
          1,
          {},
          maestroApiKey,
        ),
      );

      let instance = Cardano._instances.get(instanceName) as Cardano;

      return instance;
      
    } catch (error) {
      throw new Error(`Failed to create Cardano instance: ${error}`);
    }
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
  public get network(): string {
    return String(this._network).toLowerCase();
  }
  /**
   * Checks if the trade is placed and done in the dex.
   * @param {string} hash -  The transaction hash
   * @param {number} index - The order tx index
   * @returns {Promise<boolean>}
   */
  public async checkSatisfaction(
    hash: string,
    index: number = 0,
  ): Promise<boolean> {
    return await isOOROrder(`${hash}:${index}`, this._dex);
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
  public async getNetworkHeight(): Promise<number> {
    try {
      return (await this._node.general.chainTip()).data.height;
    } catch {
      this._node = new MaestroClient(
        getMaestroConfig('Mainnet', 'https://mainnet.gomaestro-api.org/v1'),
      );
      let address = await this._dex.api.getActiveAddress()
      this._dex = getSplashInstance("Mainnet");
      await this.getAccountFromAddress(address);
      return 1;
    }
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
    return status + 1;
  }

  /**
   * Gets either all of the unspent tx's or Utxos with specific address for a given address
   * @param {string} address - The address to get unspent transactions for
   * @param {TxRequestParams} params - Tx request filters
   * @returns {Promise<UtxoWithSlot[]>}
   */
  async getAddressUtxos(
    address: string,
    params?: TxRequestParams,
  ): Promise<UtxoWithSlot[]> {
    try {
      let utxos: Array<UtxoWithSlot> = [];
      utxos = (
        await this._node.addresses.utxosByAddress(address, {
          count: params?.limit || this.utxosLimit,
          order: params?.sortDirection || 'desc',
          cursor: params?.offset || null,
          asset: params?.asset || null,
        })
      ).data;
      return utxos;
    } catch (err) {
      this._node = new MaestroClient(
        getMaestroConfig('Mainnet', 'https://mainnet.gomaestro-api.org/v1'),
      );
      let address = await this._dex.api.getActiveAddress()
      this._dex = getSplashInstance("Mainnet");
      await this.getAccountFromAddress(address);
      throw new Error(String(err));
    }
  }

  /**
   * Gets an Cardano account from a mnemonic phrase
   * @param {string} mnemonic - The mnemonic phrase
   * @returns {CardanoAccount}
   */
  public async getAccountFromMnemonic(
    mnemonic: string,
  ): Promise<CardanoWallet> {
    let wallet = new CardanoWallet(mnemonic);

    await wallet.initialize();
    await this.activateWallet(mnemonic);
    return wallet;
  }

  /**
   * Bridges a hot wallet to cip30 wallet and selects it into the Splash instance.
   * @param {string} mnemonic - The mnemonic phrase
   * @returns {Promise<void>}
   */
  public async activateWallet(mnemonic: string): Promise<void> {
    this._dex.selectWallet(
      async () => await HotWallet.fromSeed(mnemonic, this._dex.explorer),
    );
    return;
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
   * @param {string} accountAddress - The account to get the balance for
   * @param {string} assetName - The name of the asset
   * @returns {Promise<string>} The balance of the asset
   * @throws {Error} If the asset is not found or there's a problem fetching UTXOs
   */
  public async getAssetBalance(
    accountAddress: string,
    assetName: string,
  ): Promise<string> {
    try {
      if (['LOVELACE', 'ADA'].includes(assetName.toUpperCase())) {
        throw new Error('use `getAdaBalance` function !');
      }

      const cardanoToken = this.findToken(assetName);

      if (!cardanoToken) {
        throw new Error(
          `Asset '${assetName}' not found in ${this._chain} Node !`,
        );
      }

      // fetching the fresh metadata
      let tokenMetadata = await getTokenMetadata(
        Cardano._tokenMetadata.get(assetName.toUpperCase()) ?? null,
        cardanoToken.policyId,
        cardanoToken.token.asset.nameBase16 != ''
          ? cardanoToken.token.asset.nameBase16
          : stringToHex(cardanoToken.name),
        this._node,
      );

      [cardanoToken.decimals, cardanoToken.symbol] = tokenMetadata
        ? [tokenMetadata.decimals, tokenMetadata.ticker]
        : [0, cardanoToken.name];

      const utxos = await this.getAddressUtxos(accountAddress, {
        asset: `${cardanoToken.policyId}${stringToHex(cardanoToken.token.asset.name)}`,
      });

      let balance: Asset[] = [];
      for (const utxo of utxos) {
        for (const asset of utxo.assets) {
          if (
            asset.unit ==
            `${cardanoToken.policyId}${stringToHex(cardanoToken.token.asset.name)}`
          ) {
            balance.push(asset);
          }
        }
      }

      return this.fromRaw(
        BigNumber(
          balance.reduce((acc, obj) => acc + parseFloat(obj.amount), 0),
        ),
        cardanoToken.decimals,
      );
    } catch (error) {
      throw new Error(
        `Error fetching account assets from ${this._chain} Node: ${error}`,
      );
    }
  }

  /**
   * Gets the balance of ADA
   * @param {string} accountAddress - The user address
   * @returns {Promise<string>}
   */
  public async getAdaBalance(accountAddress: string): Promise<string> {
    try {
      return this.fromRaw(
        BigNumber(
          String(
            (
              (await this._node.addresses.addressBalance(
                String(
                  (await this._node.addresses.decodeAddress(accountAddress))
                    .payment_cred?.bech32,
                ),
              )) as any
            ).data.lovelace,
          ),
        ),
        6,
      );
    } catch (error) {
      this._node = new MaestroClient(
        getMaestroConfig('Mainnet', 'https://mainnet.gomaestro-api.org/v1'),
      );
      let address = await this._dex.api.getActiveAddress()
      this._dex = getSplashInstance("Mainnet");
      await this.getAccountFromAddress(address);
      throw new Error(
        `Error while fetching the ${accountAddress} balance, Node: ${error}`,
      );
    }
  }

  /**
   * Gets the balance of ADA and assets from unspent transaction outputs
   * @param {UtxoWithSlot[]} utxos - The unspent transaction outputs
   * @returns {{ balance: BigNumber, assets: Record<string, BigNumber> }}
   */
  public getBalance(utxos: UtxoWithSlot[]): {
    balance: BigNumber;
    assets: Record<string, BigNumber>;
  } {
    const assets: Record<string, BigNumber> = {};
    if (utxos.length == 0) {
      return { balance: BigNumber(0), assets };
    }
    for (const utxo of utxos) {
      for (const asset of utxo.assets) {
        const { unit, amount } = asset;

        const isAda = unit.toUpperCase() === 'LOVELACE';
        const tokenName = isAda ? 'ADA' : hexToString(unit.slice(56));

        const tokenDecimals = isAda
          ? 6
          : Cardano._tokenMetadata.get(tokenName.toUpperCase())?.decimals ?? 0;
        if (assets[tokenName.toUpperCase()] === undefined) {
          assets[tokenName.toUpperCase()] = BigNumber(0);
        }

        assets[tokenName.toUpperCase()] = BigNumber(
          this.fromRaw(
            BigNumber(
              this.toRaw(assets[tokenName.toUpperCase()], tokenDecimals),
            ).plus(BigNumber(amount)),
            tokenDecimals,
          ),
        );
      }
    }

    let balance = assets['ADA'] ?? BigNumber(0);
    delete assets['ADA'];
    return { balance, assets };
  }

  /**
   * Loads assets from the DEX pools
   * @private
   */
  private async loadAssets(): Promise<void> {
    this._assetMap = getAssetsFromPools(this._splashPools);
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
   * @param {string} baseToken - The base token name
   * @param {string} quoteToken - The quote token name
   * @param {BigNumber} amount - The amount to swap
   * @param {boolean} buy - Either the swap is buy or sell position
   * @param {string} priceLimit - Either the swap is a limit order or a market price swap
   * @param {TradeSlippage} slippage - The slippage tolerance
   * @returns {Promise<TradeResponse>} The trade response
   */

  public async swap(
    baseToken: string,
    quoteToken: string,
    amount: BigNumber,
    buy: boolean = true,
    priceLimit: string,
    slippage: TradeSlippage = this.defaultSlippage,
  ): Promise<TradeResponse> {
    // don't touch
    if (priceLimit) {
      console.log('');
    }

    if (!this._ready) {
      throw new Error('Cardano instance not initialized');
    }

    if (!amount || amount.lte(0)) {
      throw new Error('Invalid swap amount');
    }
    if (!['1', '2', '5', '10', '15', '25'].includes(slippage)) {
      slippage = this.defaultSlippage;
    }

    baseToken = baseToken.toUpperCase();
    quoteToken = quoteToken.toUpperCase();

    let [baseCardanoToken, quoteCardanoToken] = this.validateTokens(
      baseToken,
      quoteToken,
    );
    // fetching fresh token decimals
    let baseMetadata = await getTokenMetadata(
      Cardano._tokenMetadata.get(baseToken) ?? null,
      baseCardanoToken.policyId,
      baseCardanoToken.token.asset.nameBase16 != ''
        ? baseCardanoToken.token.asset.nameBase16
        : stringToHex(baseCardanoToken.name),
      this._node,
    );
    let quoteMetadata = await getTokenMetadata(
      Cardano._tokenMetadata.get(quoteToken) ?? null,
      quoteCardanoToken.policyId,
      quoteCardanoToken.token.asset.nameBase16 != ''
        ? quoteCardanoToken.token.asset.nameBase16
        : stringToHex(quoteCardanoToken.name),
      this._node,
    );

    if (!baseMetadata || !quoteMetadata) {
      throw new Error(
        "Couldn't find the tokens metadata, try a verified token",
      );
    }

    baseCardanoToken = updateTokenMetadata(baseCardanoToken, baseMetadata);
    quoteCardanoToken = updateTokenMetadata(quoteCardanoToken, quoteMetadata);

    const [inputToken, outputToken] = this.createTokens(
      baseCardanoToken,
      quoteCardanoToken,
      amount,
      buy,
    );

    const poolNftNamesBase16 = getNftBase16Names(
      baseCardanoToken.nameBase16 || baseCardanoToken.token.asset.nameBase16,
      quoteCardanoToken.nameBase16 || quoteCardanoToken.token.asset.nameBase16,
    );

    this.validatePool(poolNftNamesBase16);

    const rawPrice = await this.getPrice(
      baseCardanoToken,
      quoteCardanoToken,
      buy,
      amount,
    );

    const decimals = buy
      ? (baseCardanoToken.decimals as number)
      : (quoteCardanoToken.decimals as number);

    const outputDecimals = buy
      ? (quoteCardanoToken.decimals as number)
      : (baseCardanoToken.decimals as number);

    let price = BigNumber(rawPrice.raw)
      .multipliedBy(BigNumber(10).pow(outputDecimals))
      .dividedBy(BigNumber(10).pow(decimals))
      .toString();

    const swapTx = await this.createSwapTransaction(
      inputToken,
      outputToken,
      Number(slippage),
    );

    const estimatedFee = await this.estimateFee(inputToken, outputToken.asset);

    const minOutput = this.calculateMinOutput(
      amount,
      BigNumber(price),
      Number(slippage),
    );

    let txHash = await this.signAndSubmitTransaction(swapTx);

    // let confirmResult = await this.confirmOrder(txHash, 0, orderTimeout); // if using, use with delay, generally this line is not needed

    return this.createTradeResponse(
      buy ? baseCardanoToken : quoteCardanoToken,
      buy ? quoteCardanoToken : baseCardanoToken,
      amount,
      String(price),
      minOutput,
      buy,
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

    if (!baseCardanoToken) {
      throw new Error(
        `The ${baseToken.toUpperCase()} token is not supported by splash dex!`,
      );
    }
    if (!quoteCardanoToken) {
      throw new Error(
        `The ${quoteToken.toUpperCase()} token is not supported by splash dex!`,
      );
    }

    return [baseCardanoToken, quoteCardanoToken];
  }

  /**
   * Creates Currency objects for the input and output tokens of a swap
   * @param {CardanoToken} baseCardanoToken - The base token
   * @param {CardanoToken} quoteCardanoToken - The quote token
   * @param {BigNumber} amount - The amount to swap
   * @param {boolean} buy - Whether this is a buy operation
   * @returns {[Currency, Currency]} An array containing the input and output Currency objects
   */
  private createTokens(
    baseCardanoToken: CardanoToken,
    quoteCardanoToken: CardanoToken,
    amount: BigNumber,
    buy: boolean,
  ): [Currency, Currency] {
    const createToken = (cardanoToken: CardanoToken) =>
      cardanoToken.token.withAmount(
        BigInt(
          Math.trunc(parseFloat(this.toRaw(amount, cardanoToken.decimals))),
        ),
      );
    const inputToken = createToken(baseCardanoToken);
    const outputToken = createToken(quoteCardanoToken);

    return buy ? [outputToken, inputToken] : [inputToken, outputToken];
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
        `The ${poolNftNamesBase16.baseToQuote
          .slice(0, -8)
          .split('5f')
          .map((base16name) =>
            hexToString(base16name),
          )} pair is not supported by splash dex!`,
      );
    }
  }

  /**
   * Creates a swap transaction with the market price
   * @param {Currency} inputToken - The input token for the swap
   * @param {Currency} outputToken - The output token for the swap
   * @param {number} slippage - The slippage tolerance for the swap
   * @returns {Promise<Transaction>} A promise that resolves to the created swap transaction
   */
  private async createSwapTransaction(
    inputToken: Currency,
    outputToken: Currency,
    slippage: number,
  ): Promise<Transaction> {
    return await this._dex
      .newTx()
      .spotOrder({
        input: inputToken,
        outputAsset: outputToken.asset,
        slippage,
      })
      .complete();
  }

  /**
   * Cancels an unfilled spot order by its submitter tx hash.
   * @param {string} txHash - The transaction that initiated the spot order
   * @param {number} index - The index which the order is placed in the tx objects
   * @returns {Promise<string>} cancellation tx hash
   */
  public async cancel(txHash: string, index: number = 0): Promise<string> {
    try {
      console.log(`order failure, cancelling ${txHash}:${index}`);
      let cancelTxHash = await this._dex.explorer.submitTx(
        (
          await (
            await this._dex
              .newTx()
              .cancelOperation({
                txHash,
                index,
              })
              .complete()
          ).sign()
        ).cbor,
      );
      return cancelTxHash;
    } catch (error) {
      this._node = new MaestroClient(
        getMaestroConfig(
          'Mainnet',
          'https://mainnet.gomaestro-api.org/v1',
        ),
      );
      let address = await this._dex.api.getActiveAddress()
      this._dex = getSplashInstance("Mainnet");
      await this.getAccountFromAddress(address);
      throw new Error(`${error}`);
    }
  }

  /**
   * Estimates the fee for a swap transaction
   * @param {Currency} input - The input token with amount
   * @param {AssetInfo} outputAsset - The output token asset information
   * @returns {Promise<string>} A promise that resolves to the estimated fee as a string
   */
  public async estimateFee(
    input: Currency,
    outputAsset: AssetInfo,
  ): Promise<string> {
    try {
      const tx = await this._dex
        .newTx()
        .spotOrder({
          input,
          outputAsset,
        })
        .complete();

      let orderFee = this.fromRaw(
        BigNumber(tx.wasm.body().fee().toString()),
        6,
      );

      let minUTxoValue = BigNumber(
        (await this._dex.explorer.getProtocolParams()).minUTxOValue.toString(),
      );

      let splashOps = (await this._dex.api.getSplashOperationConfig())
        .operations.spotOrderV3.settings;

      let total_fee = BigNumber(orderFee)
        .plus(
          BigNumber(this.fromRaw(BigNumber(splashOps.worstOrderStepCost), 6)),
        )
        .plus(BigNumber(this.fromRaw(BigNumber(splashOps.executorFee), 6)))
        .plus(BigNumber.max(BigNumber(1.5), minUTxoValue));

      return total_fee.toString();
    } catch (error) {
      this._node = new MaestroClient(
        getMaestroConfig(
          'Mainnet',
          'https://mainnet.gomaestro-api.org/v1',
        ),
      );
      let address = await this._dex.api.getActiveAddress()
      this._dex = getSplashInstance("Mainnet");
      await this.getAccountFromAddress(address);
      throw new Error(`Failed to the estimate the fee ${error}`);
    }
  }

  /**
   * Estimates the price for a swap
   * @param {string} baseToken - The base token symbol
   * @param {string} quoteToken - The quote token symbol
   * @param {BigNumber} amount - The amount to swap
   * @param {boolean} buy - either buying the base token or selling it.
   * @param {TradeSlippage} slippage - The slippage tolerance
   * @returns {Promise<PriceResponse>} The price estimate
   */
  public async estimate(
    baseToken: string,
    quoteToken: string,
    amount: BigNumber,
    buy: boolean,
    slippage: TradeSlippage = this.defaultSlippage,
  ): Promise<PriceResponse> {
    if (!['1', '2', '5', '10', '15', '25'].includes(slippage)) {
      slippage = this.defaultSlippage;
    }
    baseToken = baseToken.toUpperCase();
    quoteToken = quoteToken.toUpperCase();
    let [realBaseToken, realQuoteToken] = this.validateTokens(
      baseToken,
      quoteToken,
    );

    let current_base_metadata = Cardano._tokenMetadata.get(baseToken);
    let current_quote_metadata = Cardano._tokenMetadata.get(quoteToken);

    let baseMetadata = await getTokenMetadata(
      current_base_metadata ?? null,
      realBaseToken.policyId,
      realBaseToken.token.asset.nameBase16 != ''
        ? realBaseToken.token.asset.nameBase16
        : stringToHex(realBaseToken.name),
      this._node,
    );

    let quoteMetadata = await getTokenMetadata(
      current_quote_metadata ?? null,
      realQuoteToken.policyId,
      realQuoteToken.token.asset.nameBase16 != ''
        ? realQuoteToken.token.asset.nameBase16
        : stringToHex(realQuoteToken.name),
      this._node,
    );

    if (!baseMetadata || !quoteMetadata) {
      throw new Error(
        "Couldn't find the tokens metadata, try a verified token",
      );
    }

    // updating metadata
    if (!current_base_metadata) {
      Cardano._tokenMetadata.set(baseToken, baseMetadata);
    }
    if (!current_quote_metadata) {
      Cardano._tokenMetadata.set(quoteToken, quoteMetadata);
    }

    realBaseToken = updateTokenMetadata(realBaseToken, baseMetadata);
    realQuoteToken = updateTokenMetadata(realQuoteToken, quoteMetadata);

    return this.createPriceResponse(
      realBaseToken,
      realQuoteToken,
      amount,
      buy,
      slippage,
    );
  }

  /**
   * Finds a token by its symbol or name
   * @param {string} symbolOrName - The token symbol or name
   * @returns {CardanoToken | undefined}
   */
  public findToken(symbolOrName: string): CardanoToken | undefined {
    const token = this._assetMap[symbolOrName];
    return token;
  }

  /**
   * Gets the latest block timestamp
   * @returns {Promise<number>}
   */
  private async getBlockTimestamp(): Promise<number> {
    try {
      const blockInfo = await this._node.blocks.blockInfo(
        String(await this.getNetworkHeight()),
      );
      return parseInt(blockInfo.data.timestamp.replace(/[-: ]/g, ''));
    } catch {
      this._node = new MaestroClient(
        getMaestroConfig('Mainnet', 'https://mainnet.gomaestro-api.org/v1'),
      );
      let address = await this._dex.api.getActiveAddress()
      this._dex = getSplashInstance("Mainnet");
      await this.getAccountFromAddress(address);
      return 1;
    }

    // return parseInt(blockInfo.data.timestamp.replace(/[-: ]/g, ''));
  }

  /**
   * Submits a transaction
   * @param {Transaction} tx - unsigned built transaction object
   * @returns {Promise<string>} Submitted transaction hash
   */
  private async signAndSubmitTransaction(tx: Transaction): Promise<string> {
    try {
      let txCbor = (await tx.sign()).cbor;

      let txHash = await this._dex.explorer.submitTx(txCbor);

      return txHash;
    } catch (err) {
      this._node = new MaestroClient(
        getMaestroConfig(
          'Mainnet',
          'https://mainnet.gomaestro-api.org/v1',
        ),
      );
      let address = await this._dex.api.getActiveAddress()
      this._dex = getSplashInstance("Mainnet");
      await this.getAccountFromAddress(address);
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
   * @param {BigNumber} minOutput - The minimum output amount for the swap
   * @param {boolean} buy - Whether it's a buy operation (true) or sell operation (false)
   * @param {number} estimatedFee - The estimated fee for the swap
   * @param {string} txHash - The transaction hash of the swap
   * @returns {Promise<TradeResponse>} A promise that resolves to the trade response
   */
  private async createTradeResponse(
    baseToken: CardanoToken,
    quoteToken: CardanoToken,
    amount: BigNumber,
    price: string,
    minOutput: BigNumber,
    buy: boolean,
    estimatedFee: string,
    txHash: string,
  ): Promise<TradeResponse> {
    const decimals = buy
      ? (quoteToken.decimals as number)
      : (baseToken.decimals as number);

    return {
      network: this.network,
      timestamp: await this.getBlockTimestamp(),
      latency: 0,
      base: baseToken.symbol,
      quote: quoteToken.symbol,
      amount: amount.toString(),
      rawAmount: this.toRaw(amount, decimals),
      expectedOut: minOutput.toString(),
      price,
      gasPrice: this.minFee, // ada price to what ? not applicable
      gasPriceToken: 'ADA',
      gasLimit: this.minFee, // not applicable
      gasCost: estimatedFee, // the total transaction fee in ada,
      txHash,
    };
  }

  /**
   * Creates a price response for a potential swap
   * @param {CardanoToken} baseToken - The base token of the trading pair
   * @param {CardanoToken} quoteToken - The quote token of the trading pair
   * @param {BigNumber} amount - The amount of tokens to swap
   * @param {boolean} buy - Whether it's a buy operation (true) or sell operation (false)
   * @param {String} [slippage] - Optional. The slippage tolerance for the swap
   * @param {string} [priceLimit] - Optional. The price limit for the swap
   * @param {string} [estimatedFee] - Optional. The estimated fee for the swap
   * @returns {Promise<PriceResponse>} A promise that resolves to the price response
   */
  private async createPriceResponse(
    baseToken: CardanoToken,
    quoteToken: CardanoToken,
    amount: BigNumber,
    buy: boolean,
    slippage?: String,
    priceLimit?: string,
    estimatedFee?: string,
  ): Promise<PriceResponse> {
    const decimals = buy
      ? (quoteToken.decimals as number)
      : (baseToken.decimals as number);

    const outputDecimals = buy
      ? (baseToken.decimals as number)
      : (quoteToken.decimals as number);

    let rawPrice = (
      await this.getPrice(baseToken, quoteToken, buy, amount, priceLimit)
    ).raw;

    let price = BigNumber(rawPrice)
      .multipliedBy(BigNumber(10).pow(outputDecimals))
      .dividedBy(BigNumber(10).pow(decimals))
      .toString();

    let minOutput = this.calculateMinOutput(
      amount,
      BigNumber(price),
      Number(slippage),
    );

    if (!estimatedFee) {
      const temp_base = buy ? quoteToken : baseToken;
      const temp_quote = buy ? baseToken : quoteToken;
      if (temp_base.name === temp_quote.name) estimatedFee = '0';
      estimatedFee = await this.estimateFee(
        temp_base.token.withAmount(
          BigInt(Math.trunc(parseFloat(this.toRaw(amount, decimals)))),
        ),
        temp_quote.token.asset,
      );
    }

    return {
      base: baseToken.symbol === '' ? baseToken.name : baseToken.symbol,
      quote: quoteToken.symbol === '' ? quoteToken.name : quoteToken.symbol,
      amount: String(amount),
      rawAmount: this.toRaw(amount, decimals),
      expectedAmount: minOutput.toString(),
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
   * @param {number} slippage - The slippage tolerance as a percentage (e.g. 1 for 1%)
   * @returns {BigNumber} The minimum output amount considering the slippage
   */
  public calculateMinOutput(
    amount: BigNumber,
    price: BigNumber,
    slippage: number,
  ): BigNumber {
    const minOutputBase = amount.div(price).multipliedBy(1 - slippage * 0.01);

    return minOutputBase;
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
   * @param {boolean} buy - Whether it's a buy operation
   * @param {BigNumber} amount - the amount to swap
   * @param {string} [priceLimit] - Optional price limit
   * @returns {Promise<Price>}
   */
  private async getPrice(
    baseToken: CardanoToken,
    quoteToken: CardanoToken,
    buy: boolean,
    amount: BigNumber,
    priceLimit?: string,
  ): Promise<Price> {
    try {
      if (priceLimit) {
        return Price.new({
          base: baseToken.token.asset,
          quote: quoteToken.token.asset,
          value: priceLimit,
        });
      }

      [baseToken.token.asset, quoteToken.token.asset] = [
        baseToken,
        quoteToken,
      ].map((token) =>
        token.token.asset.isAda()
          ? AssetInfo.fromString('', '')
          : token.token.asset,
      );

      const orderBook = await this._dex.api.getOrderBook({
        base: baseToken.token.asset,
        quote: quoteToken.token.asset,
      });

      let inputToken = buy ? quoteToken : baseToken;

      const input = inputToken.token.withAmount(
        BigInt(Math.trunc(parseFloat(this.toRaw(amount, inputToken.decimals)))),
      );
      return selectEstimatedPrice({
        orderBook,
        input,
        priceType: 'average',
      });
    } catch (error) {
      throw new Error(`Failed to fetch the estimate the price ${error}`);
    }
  }
  /**
   * Gets a pool by its token ids without fetching the latest state of the pool
   * @param {string} x - The base token name cbor hex encoded
   * @param {string} y - The quote token name cbor hex encoded
   * @returns {SplashPool[]} The founded pools
   * @throws {Error} If no pools are found
   */
  public getPoolByPair(x: string, y: string): SplashPool[] {
    const [realBaseToken, realQuoteToken] = this.validateTokens(
      x.toUpperCase(),
      y.toUpperCase(),
    );

    const { baseToQuote, quoteToBase } = getNftBase16Names(
      realBaseToken.nameBase16 || realBaseToken.token.asset.nameBase16,
      realQuoteToken.nameBase16 || realQuoteToken.token.asset.nameBase16,
    );

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
    return this.getPoolByPair(x, y);
  }

  /**
   * Gets a transaction by its hash
   * @param {string} txHash - The transaction hash
   * @returns {Promise<TransactionInfo | undefined>} The transaction details
   */
  public async getTx(txHash: string): Promise<TransactionInfo | undefined> {
    try {
      return (await this._node.transactions.txInfo(txHash)).data;
    } catch {
      this._node = new MaestroClient(
        getMaestroConfig('Mainnet', 'https://mainnet.gomaestro-api.org/v1'),
      );
      let address = await this._dex.api.getActiveAddress()
      this._dex = getSplashInstance("Mainnet");
      await this.getAccountFromAddress(address);
      return
    }
    // return (await this._node.transactions.txInfo(txHash)).data;
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
        cursor: params?.offset || null,
      })
    ).data;
  }

  /**
   * Gets the stats of a transaction
   * @param {string} txHash - The transaction hash
   * @returns {Promise<TxManagerState | undefined>} The transaction details
   */
  public async getTxState(txHash: string): Promise<TxManagerState | undefined> {
    try {
      return await this._node.txManager.txManagerState(txHash);
    } catch {
      this._node = new MaestroClient(
        getMaestroConfig('Mainnet', 'https://mainnet.gomaestro-api.org/v1'),
      );
      let address = await this._dex.api.getActiveAddress()
      this._dex = getSplashInstance("Mainnet");
      await this.getAccountFromAddress(address);
      return
    }
    // return await this._node.txManager.txManagerState(txHash);
  }

  private async updateSplash() {
    let address = await this._dex.api.getActiveAddress();
    this._dex = getSplashInstance('Mainnet');
    await this.getAccountFromAddress(address);
  }
}
