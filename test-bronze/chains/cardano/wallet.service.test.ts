import { CardanoWallet } from '../../../src/chains/cardano/wallet.service';
import * as bip39 from 'bip39';
import { Bip32PrivateKey } from '@stricahq/bip32ed25519/dist';
import { RewardAddress, EnterpriseAddress, BaseAddress } from '@stricahq/typhonjs/dist/address';
import { HashType, NetworkId, } from '@stricahq/typhonjs/dist/types';

jest.mock('bip39', () => ({
    mnemonicToEntropy: jest.fn(),
}));

jest.mock('@stricahq/bip32ed25519/dist', () => ({
    Bip32PrivateKey: {
        fromEntropy: jest.fn(),
    },
}));
jest.mock('@stricahq/typhonjs/dist/address', () => ({
    RewardAddress: jest.fn().mockImplementation(() => ({
        getBech32: jest.fn().mockReturnValue('mock-stake-address'),
        stakeCredential: 'mock-stake-credential',
    })),
    EnterpriseAddress: jest.fn().mockImplementation(() => ({
        getBech32: jest.fn().mockReturnValue('mock-enterprise-address'),
        paymentCredential: 'mock-payment-credential',
    })),
    BaseAddress: jest.fn().mockImplementation(() => ({
        getBech32: jest.fn().mockReturnValue('mock-base-address'),
    })),
}));
jest.mock('@stricahq/typhonjs/dist/types', () => ({
    NetworkId: {
        MAINNET: 1,
    },
    HashType: {
        ADDRESS: 'address',
    },
}))


describe('CardanoWallet', () => {
    const mnemonic = 'test mnemonic';
    let wallet: CardanoWallet;

    beforeEach(() => {
        wallet = new CardanoWallet(mnemonic);
    });

    it('Should be defined', () => {
        expect(CardanoWallet).toBeDefined();
    });

    describe('initialize', () => {
        it('Should be defined', () => {
            expect(wallet.initialize).toBeDefined();
        })
        it('Should define rootKey and accountKey after initialization', async () => {
            const mockSeed = 'mock-seed';
            const mockRootKey = {
                derive: jest.fn().mockReturnThis(),
            };
            (bip39.mnemonicToEntropy as jest.Mock).mockReturnValue(mockSeed);
            (Bip32PrivateKey.fromEntropy as jest.Mock).mockResolvedValue(mockRootKey);

            await wallet.initialize();
            expect(bip39.mnemonicToEntropy).toHaveBeenCalledWith(mnemonic);
            expect(Bip32PrivateKey.fromEntropy).toHaveBeenCalledWith(Buffer.from(mockSeed, 'hex'));
            expect(mockRootKey.derive).toHaveBeenCalledTimes(3);
            expect(mockRootKey.derive).toHaveBeenNthCalledWith(1, 2147483648 + 1852);
            expect(mockRootKey.derive).toHaveBeenNthCalledWith(2, 2147483648 + 1815);
            expect(mockRootKey.derive).toHaveBeenNthCalledWith(3, 2147483648);
        });
        it('Should throw an error if mnemonic is invalid', async () => {
            (bip39.mnemonicToEntropy as jest.Mock).mockImplementation(() => {
                throw new Error('Invalid mnemonic');
            });

            await expect(wallet.initialize()).rejects.toThrow('Invalid mnemonic');
        });
        it('Should throw an error if rootKey derivation fails', async () => {
            const mockSeed = 'mock-seed';
            (bip39.mnemonicToEntropy as jest.Mock).mockReturnValue(mockSeed);
            (Bip32PrivateKey.fromEntropy as jest.Mock).mockImplementation(() => {
                throw new Error('Failed to derive root key');
            });
            await expect(wallet.initialize()).rejects.toThrow('Failed to derive root key');
        });
    });

    describe('generateStakeAddress', () => {
        it('Should be defined', () => {
            expect(wallet.generateStakeAddress).toBeDefined()
        })
        it('Should generate a stake address when accountKey is initialized', () => {
            const mockAccountKey = {
                derive: jest.fn().mockReturnThis(),
                toBip32PublicKey: jest.fn().mockReturnThis(),
                toPublicKey: jest.fn().mockReturnThis(),
                hash: jest.fn().mockReturnValue('mock-hash'),
            };
            (wallet as any).accountKey = mockAccountKey;

            const stakeAddress = wallet.generateStakeAddress();
            expect(mockAccountKey.derive).toHaveBeenCalledTimes(2);
            expect(mockAccountKey.derive).toHaveBeenNthCalledWith(1, 2); // Stake chain (2)
            expect(mockAccountKey.derive).toHaveBeenNthCalledWith(2, 0); // First address index
            expect(RewardAddress).toHaveBeenCalledWith(NetworkId.MAINNET, {
                hash: 'mock-hash',
                type: HashType.ADDRESS,
            });
            expect(stakeAddress).toBe('mock-stake-address');
        });
        it('Should throw an error if wallet is not initialized', () => {
            expect(() => wallet.generateStakeAddress()).toThrow('Wallet is not initialized.');
        });
    });

    describe('generateEnterpriseAddress', () => {
        it('Should be defined', () => {
            expect(wallet.generateEnterpriseAddress).toBeDefined();
        })
        it('Should generate an enterprise address when accountKey is initialized', () => {
            const mockAccountKey = {
                derive: jest.fn().mockReturnThis(),
                toBip32PublicKey: jest.fn().mockReturnThis(),
                toPublicKey: jest.fn().mockReturnThis(),
                hash: jest.fn().mockReturnValue('mock-hash'),
            };
            (wallet as any).accountKey = mockAccountKey;

            const enterpriseAddress = wallet.generateEnterpriseAddress();
            expect(mockAccountKey.derive).toHaveBeenCalledTimes(2);
            expect(mockAccountKey.derive).toHaveBeenNthCalledWith(1, 0); // External chain (0)
            expect(mockAccountKey.derive).toHaveBeenNthCalledWith(2, 0); // First address index
            expect(EnterpriseAddress).toHaveBeenCalledWith(NetworkId.MAINNET, {
                hash: 'mock-hash',
                type: HashType.ADDRESS,
            });
            expect(enterpriseAddress).toBe('mock-enterprise-address');
        });

        it('Should throw an error if wallet is not initialized', () => {
            expect(() => wallet.generateEnterpriseAddress()).toThrow('Wallet is not initialized.');
        });
    });
    describe('generateBaseAddress', () => {
        it('Should be defined', () => {
            expect(wallet.generateBaseAddress).toBeDefined();
        })
        it('Should generate a base address when accountKey is initialized', () => {
            const mockAccountKey = {
                derive: jest.fn().mockReturnThis(),
                toBip32PublicKey: jest.fn().mockReturnThis(),
                toPublicKey: jest.fn().mockReturnThis(),
                hash: jest.fn().mockReturnValue('mock-hash'),
            };
            (wallet as any).accountKey = mockAccountKey;

            const baseAddress = wallet.generateBaseAddress();
            expect(mockAccountKey.derive).toHaveBeenCalledTimes(4); // 2 for payment, 2 for stake
            expect(EnterpriseAddress).toHaveBeenCalledWith(NetworkId.MAINNET, {
                hash: 'mock-hash',
                type: HashType.ADDRESS,
            });
            expect(RewardAddress).toHaveBeenCalledWith(NetworkId.MAINNET, {
                hash: 'mock-hash',
                type: HashType.ADDRESS,
            });
            expect(BaseAddress).toHaveBeenCalledWith(
                NetworkId.MAINNET,
                'mock-payment-credential',
                'mock-stake-credential',
            );
            expect(baseAddress).toBe('mock-base-address');
        });
        it('Should throw an error if wallet is not initialized', () => {
            expect(() => wallet.generateBaseAddress()).toThrow('Wallet is not initialized.');
        });
    });
    describe('sign', () => {
        it('Should be defined', () => {
            expect(wallet.sing).toBeDefined()
        })
        it('Should sign a transaction when accountKey is initialized', () => {
            const mockTransaction = Buffer.from('mock-transaction');
            const mockAccountKey = {
                derive: jest.fn().mockReturnThis(),
                toPrivateKey: jest.fn().mockReturnThis(),
                sign: jest.fn().mockReturnValue(Buffer.from('mock-signature')),
            };
            (wallet as any).accountKey = mockAccountKey;

            const signature = wallet.sing(mockTransaction);
            expect(mockAccountKey.derive).toHaveBeenCalledTimes(2);
            expect(mockAccountKey.derive).toHaveBeenNthCalledWith(1, 0); // External chain (0)
            expect(mockAccountKey.derive).toHaveBeenNthCalledWith(2, 0); // First address index
            expect(mockAccountKey.toPrivateKey).toHaveBeenCalled();
            expect(mockAccountKey.sign).toHaveBeenCalledWith(mockTransaction);
            expect(signature).toEqual(Buffer.from('mock-signature'));
        });
        it('Should throw an error if wallet is not initialized', () => {
            const mockTransaction = Buffer.from('mock-transaction');

            expect(() => wallet.sing(mockTransaction)).toThrow('you must initialize the wallet first.');
        });
    });
});
