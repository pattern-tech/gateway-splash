export interface AddWalletRequest {
  chain: string;
  network: string;
  privateKey: string;
  address?: string;
  accountId?: number;
}

export interface AddApiKeyRequest {
  chain: string;
  network: string;
  dex_api_key: string;
}

export interface AddWalletResponse {
  address: string;
}

export interface WalletSignResponse {
  signature: string;
}

export interface RemoveWalletRequest {
  chain: string;
  address: string;
}

export interface WalletSignRequest extends RemoveWalletRequest {
  network: string;
  message: string;
}

export interface GetWalletResponse {
  chain: string;
  walletAddresses: string[];
}
