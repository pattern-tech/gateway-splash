import {
  Bip32PrivateKey,
} from '@stricahq/bip32ed25519/dist'; //
import {
  BaseAddress,
  EnterpriseAddress,
  RewardAddress,
} from '@stricahq/typhonjs/dist/address'; //
import * as bip39 from 'bip39'; //
import { HashType, NetworkId } from '@stricahq/typhonjs/dist/types'; //

export class CardanoWallet {
  private mnemonic: string;
  private rootKey: Bip32PrivateKey | null = null;
  private accountKey: Bip32PrivateKey | null = null;

  constructor(mnemonic: string) {
    this.mnemonic = mnemonic;
  }

  // Initializes the wallet by generating root and account keys
  public async initialize(): Promise<void> {
    const seed = bip39.mnemonicToEntropy(this.mnemonic);
    this.rootKey = await Bip32PrivateKey.fromEntropy(Buffer.from(seed, 'hex'));

    // Deriving account key
    this.accountKey = this.rootKey
      .derive(2147483648 + 1852) // Purpose (BIP44)
      .derive(2147483648 + 1815) // Coin type (Cardano)
      .derive(2147483648); // Account index (0)
  }

  // Generates a reward address (stake key)
  public generateStakeAddress(): string | null {
    if (!this.accountKey) {
      throw new Error('Wallet is not initialized.');
    }

    const stakeKey = new RewardAddress(NetworkId.TESTNET, {
      hash: this.accountKey
        .derive(2) // Stake chain (2)
        .derive(0) // First address index
        .toBip32PublicKey()
        .toPublicKey()
        .hash(),
      type: HashType.ADDRESS,
    });

    return stakeKey.getBech32();
  }

  // Generates an enterprise address (payment key) // to sign transaction with
  public generateEnterpriseAddress(): string | null {
    if (!this.accountKey) {
      throw new Error('Wallet is not initialized.');
    }

    const enterpriseKey = new EnterpriseAddress(NetworkId.TESTNET, {
      hash: this.accountKey
        .derive(0) // External chain (0)
        .derive(0) // First address index
        .toBip32PublicKey()
        .toPublicKey()
        .hash(),
      type: HashType.ADDRESS,
    });

    return enterpriseKey.getBech32();
  }

  // Generates a base address by combining the payment and stake keys
  public generateBaseAddress(): string | null {
    if (!this.accountKey) {
      throw new Error('Wallet is not initialized.');
    }

    const enterpriseKey = new EnterpriseAddress(NetworkId.TESTNET, {
      hash: this.accountKey
        .derive(0) // External chain (0)
        .derive(0) // First address index
        .toBip32PublicKey()
        .toPublicKey()
        .hash(),
      type: HashType.ADDRESS,
    });

    const stakeKey = new RewardAddress(NetworkId.TESTNET, {
      hash: this.accountKey
        .derive(2) // Stake chain (2)
        .derive(0) // First address index
        .toBip32PublicKey()
        .toPublicKey()
        .hash(),
      type: HashType.ADDRESS,
    });

    const address = new BaseAddress(
      NetworkId.TESTNET,
      enterpriseKey.paymentCredential,
      stakeKey.stakeCredential,
    );

    return address.getBech32();
  }

  public sing(tx: Buffer): Buffer {
    if (!this.accountKey) {
      throw new Error('you must initialize the wallet first.');
    }
    return this.accountKey.derive(0).derive(0).toPrivateKey().sign(tx);
  }
}

// Example usage
(async () => {
  const mnemonic = String(process.env.PREPROD_WALLET_MNEMONIC);
  const wallet = new CardanoWallet(mnemonic);

  await wallet.initialize();
  const baseAddress = wallet.generateBaseAddress();
  console.log('Generated Base Address:', baseAddress);
})();
