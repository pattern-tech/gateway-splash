import LRUCache from 'lru-cache';
import {
  CardanoConfig,
  CardanoConnectedInstance,
  CardanoToken,
} from './interfaces/cardano.interface';
// import { CardanoNetwork, NetworkPrefix } from './types/cardano.types';
// import { MaestroNode } from './?node.service';

import dotenv from 'dotenv';
dotenv.config();

import { CardanoController } from './cardano.controller';
import {
  MaestroClient,
  MaestroSupportedNetworks,
  Utxo,
} from '@maestro-org/typescript-sdk';
import fse from 'fs-extra';
import { hexToString, Splash, stringToHex } from '@splashprotocol/sdk';
import { sha256 } from '@ethersproject/solidity';
import { getCardanoConfig } from './cardano.config';
import {
  getAssetsFromPools,
  getMaestroConfig,
  getSplashInstance,
  getSplashPools,
} from './cardano.utils';
import { SplashPool } from './types/cardano.types';
import { SplashClientType } from './types/node.types';
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

  // /**
  //  * Gets an Cardano account from a secret key
  //  * @param {string} secret - The secret key
  //  * @returns {CardanoAccount}
  //  */
  // public getAccountFromSecretKey(secret: string): CardanoAccount {
  //   const sks = new SecretKeys();
  //   const secretKey = SecretKey.dlog_from_bytes(Buffer.from(secret, 'hex'));
  //   const address = secretKey.get_address().to_base58(this._networkPrefix);

  //   sks.add(secretKey);

  //   const wallet = Wallet.from_secrets(sks);

  //   return {
  //     address,
  //     wallet,
  //     prover: new WalletProver(wallet, this._node),
  //   };
  // } // only get account from the mnemonic is supported

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
  // } // reason to not to use we have stored asset list

  /**
   * Loads AMM pools
   * @private
   */
  private async loadPools(): Promise<void> {
    this._splashPools = await getSplashPools(this._dex);
  }
}
