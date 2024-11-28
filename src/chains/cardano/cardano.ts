import LRUCache from 'lru-cache';
import {
  CardanoConfig,
  CardanoConnectedInstance,
  CardanoToken,
  TxRequestParams,
} from './interfaces/cardano.interface';

import dotenv from 'dotenv';
dotenv.config();
import {
  HttpException,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE,
} from '../../services/error-handler';
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
  // private timeout: number;
  private defaultSlippage: TradeSlippage;

  /**
   * Synchronously Creates an instance of Cardano.
   * @param {CardanoNetwork} network - The Cardano network to connect to ('mainnet', 'preprod' or 'testnet')
   */
  public constructor(
    network: string,
    config: CardanoConfig,
    minFee: number, //manual
    splashPools: Record<string, SplashPool[]>,
  ) {
    let new_network: MaestroSupportedNetworks
    if (network === 'mainnet'){
      new_network = "Mainnet"
    } else if (network === 'preprod')
      new_network = "Preprod"
    else
      new_network = "Preview"
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
   * @returns {Promise<void>}
   */
  private async loadTokenMetadata(): Promise<void> {
    // requires `loadAssets` and and `loadPools` to be called before
    if (!this._assetMap) {
      throw new Error('try to re-init the object !');
    }

    // loading the metadata with backoff
    Cardano._tokenMetadata = await getTokenMetadataWithBackoff(
      Object.values({'ADA': this._assetMap['ADA'], 'USDC': this._assetMap['USDC']}),
      this._node,
    );
    return;
  }

  /**
   * Gets or creates a Cardano instance
   * @param {MaestroSupportedNetworksNetwork} network - The supported maestro network to connect to
   * @param name - The name of the network
   * @returns {Cardano}
   * @static
   */
  public static getInstance(network: string, name?: string): Cardano {
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
      let cardanoInstance = Cardano._instances.get(instanceName);

      if (cardanoInstance) {
        return cardanoInstance;
      }

      const config = getCardanoConfig(network);

      Cardano._instances.set(
        instanceName,
        new Cardano(network as MaestroSupportedNetworks, config, 1, {}),
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

  /** // @arman check this function
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
    await this.activateWallet(mnemonic)
    return wallet;
  }

  /**
   * Bridges a hot wallet to cip30 wallet and selects it into the Splash instance.
   * @param {string} mnemonic - The mnemonic phrase
   * @returns {void}
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
    return this.getAccountFromMnemonic(mnemonic)
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
          `Asset '${assetName}' not found in ${this._chain} Node!`,
        );
      }

      // fetching the fresh metadata
      let tokenMetadata = await getTokenMetadata(
        cardanoToken.policyId,
        cardanoToken.name,
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
   * @param {UtxoWithSlot[]} utxos - The unspent transaction outputs
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

    for (const utxo of utxos) {
      for (const asset of utxo.assets) {
        const { unit, amount } = asset;

        const isAda = unit.toUpperCase() === 'LOVELACE';
        const tokenName = isAda ? 'ADA' : hexToString(unit.slice(56));

        const tokenDecimals = isAda
          ? 6
          : Cardano._tokenMetadata.get(tokenName.toUpperCase())?.decimals ?? 0;
        if (assets[tokenName] === undefined) {
          assets[tokenName] = BigNumber(0);
        }

        assets[tokenName] = BigNumber(
          this.fromRaw(
            BigNumber(this.toRaw(assets[tokenName], tokenDecimals)).plus(
              BigNumber(amount),
            ),
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
   * Loads assets from the DEX pools
   * @private
   */
  private async loadAssets() {
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
   * @param {string} priceLimit - Either the swap is a limit order or a market price swap
   * @param {boolean} sell - Either the swap is sell or buy position
   * @param {TradeSlippage} slippage - The slippage tolerance
   * @param {number} orderTimeout - The number seconds to wait before checking the tx satisfaction status
   * @returns {Promise<TradeResponse>} The trade response
   */

  public async swap(
    baseToken: string,
    quoteToken: string,
    amount: BigNumber,
    sell: boolean = false,
    priceLimit: string,
    slippage: TradeSlippage = this.defaultSlippage,
  ): Promise<TradeResponse> {
    if (!this._ready) {
      throw new Error('Cardano instance not initialized');
    }

    if (!amount || amount.lte(0)) {
      throw new Error('Invalid swap amount');
    }
    if (!['1', '2', '5', '10', '15', '25'].includes(slippage)) {
      slippage = this.defaultSlippage;
    }
    let [baseCardanoToken, quoteCardanoToken] = this.validateTokens(
      baseToken,
      quoteToken,
    );
    // fetching fresh token decimals
    let baseMetadata = await getTokenMetadata(
      baseCardanoToken.policyId,
      baseCardanoToken.name,
      this._node,
    );
    let quoteMetadata = await getTokenMetadata(
      quoteCardanoToken.policyId,
      quoteCardanoToken.name,
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
      sell,
    );

    const poolNftNamesBase16 = getNftBase16Names(
      baseCardanoToken.nameBase16 || baseCardanoToken.token.asset.nameBase16,
      quoteCardanoToken.nameBase16 || quoteCardanoToken.token.asset.nameBase16,
    );

    this.validatePool(poolNftNamesBase16);

    const rawPrice = await this.getPrice(
      baseCardanoToken,
      quoteCardanoToken,
      sell,
      amount,
    );

    const decimals = sell
      ? (baseCardanoToken.decimals as number)
      : (quoteCardanoToken.decimals as number);

    const outputDecimals = sell
      ? (quoteCardanoToken.decimals as number)
      : (baseCardanoToken.decimals as number);

    let price = BigNumber(rawPrice.raw)
      .multipliedBy(BigNumber(10).pow(outputDecimals))
      .dividedBy(BigNumber(10).pow(decimals))
      .toString();

    if (
      (sell && BigNumber(priceLimit).gt(BigNumber(price))) ||
      (!sell && BigNumber(priceLimit).lt(BigNumber(price)))
    ) {
      console.error('Swap price exceeded limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(
          BigNumber(price).toFixed(decimals), 
          BigNumber(priceLimit).toFixed(outputDecimals), 
        ),
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
      );
    }

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

    // let confirmResult = await this.confirmOrder(txHash, 0, orderTimeout);

    return this.createTradeResponse(
      sell ? baseCardanoToken : quoteCardanoToken,
      sell ? quoteCardanoToken : baseCardanoToken,
      amount,
      String(price),
      minOutput,
      sell,
      estimatedFee,
      txHash,
    );
  }

  // private async confirmOrder(
  //   hash: string,
  //   index: number = 0,
  //   orderTimeout: number,
  // ): Promise<OrderConfirmation> {
  //   // First check after 5 seconds
  //   return new Promise((resolve) => {
  //     setTimeout(async () => {
  //       try {
  //         const initialConfirmation = await this.checkSatisfaction(hash, index);

  //         if (initialConfirmation) {
  //           resolve({ confirmed: true, txHash: '' });
  //           return;
  //         }

  //         setTimeout(
  //           async () => {
  //             try {
  //               const finalConfirmation = await this.checkSatisfaction(
  //                 hash,
  //                 index,
  //               );

  //               if (!finalConfirmation) {
  //                 // If still not satisfied after full timeout, cancel
  //                 const cancelTxHash = await this.cancel(hash, index);
  //                 resolve({ confirmed: false, txHash: cancelTxHash });
  //               } else {
  //                 resolve({ confirmed: true, txHash: '' });
  //               }
  //             } catch (error) {
  //               resolve({ confirmed: false, txHash: '' });
  //             }
  //           },
  //           (orderTimeout - 5) * 1000,
  //         ); // Subtract the initial 5 seconds
  //       } catch (error) {
  //         resolve({ confirmed: false, txHash: '' });
  //       }
  //     }, 5000);
  //   });
  // }

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
      console.log(input, outputAsset);
      const tx = await this._dex
        .newTx()
        .spotOrder({
          input,
          outputAsset,
        })
        .complete();

      return tx.wasm.body().fee().toString();
    } catch (error) {
      throw new Error(`Failed to the estimate the fee ${error}`);
    }
  }

  /**
   * Estimates the price for a swap
   * @param {string} baseToken - The base token symbol
   * @param {string} quoteToken - The quote token symbol
   * @param {BigNumber} amount - The amount to swap
   * @param {boolean} sell - either selling the base token or buying it.
   * @param {TradeSlippage} slippage - The slippage tolerance
   * @returns {Promise<PriceResponse>} The price estimate
   */
  public async estimate(
    baseToken: string,
    quoteToken: string,
    amount: BigNumber,
    sell: boolean,
    slippage: TradeSlippage = this.defaultSlippage,
  ): Promise<PriceResponse> {
    
    if (!['1', '2', '5', '10', '15', '25'].includes(slippage)) {
      slippage = this.defaultSlippage;
    }

    let [realBaseToken, realQuoteToken] = this.validateTokens(
      baseToken.toUpperCase(),
      quoteToken.toUpperCase(),
    );

    let baseMetadata = await getTokenMetadata(
      realBaseToken.policyId,
      realBaseToken.name,
      this._node,
    );
    let quoteMetadata = await getTokenMetadata(
      realQuoteToken.policyId,
      realQuoteToken.name,
      this._node,
    );

    if (!baseMetadata || !quoteMetadata) {
      throw new Error(
        "Couldn't find the tokens metadata, try a verified token",
      );
    }

    realBaseToken = updateTokenMetadata(realBaseToken, baseMetadata);
    realQuoteToken = updateTokenMetadata(realQuoteToken, quoteMetadata);

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
  public findToken(symbolOrName: string): CardanoToken | undefined {
    const token = this._assetMap[symbolOrName];
    return token;
  }

  /**
   * Gets the latest block timestamp
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
  private async signAndSubmitTransaction(tx: Transaction): Promise<string> {
    try {
      let txCbor = (await tx.sign()).cbor;

      let txHash = await this._dex.explorer.submitTx(txCbor);

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
   * @param {BigNumber} minOutput - The minimum output amount for the swap
   * @param {boolean} sell - Whether it's a sell operation (true) or buy operation (false)
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
    sell: boolean,
    estimatedFee: string,
    txHash: string,
  ): Promise<TradeResponse> {
    const decimals = sell
      ? (baseToken.decimals as number)
      : (quoteToken.decimals as number);

    return {

      network: this.network,
      timestamp: Number(await this.getBlockTimestamp()),
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

    const outputDecimals = sell
      ? (quoteToken.decimals as number)
      : (baseToken.decimals as number);

    let rawPrice = (
      await this.getPrice(baseToken, quoteToken, sell, amount, priceLimit)
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
      estimatedFee = await this.estimateFee(
        baseToken.token.withAmount(BigInt(this.toRaw(amount, decimals))),
        quoteToken.token.asset,
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
      timestamp: Number(await this.getBlockTimestamp()),
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
   * @param {boolean} sell - Whether it's a sell operation
   * @param {BigNumber} amount - the amount to swap
   * @param {string} [priceLimit] - Optional price limit
   * @returns {Promise<Price>}
   */
  private async getPrice(
    baseToken: CardanoToken,
    quoteToken: CardanoToken,
    sell: boolean,
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

      let inputToken = sell ? baseToken : quoteToken;

      const input = inputToken.token.withAmount(
        BigInt(this.toRaw(amount, inputToken.decimals)),
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
    return await this._node.txManager.txManagerState(txHash);
  }
}
