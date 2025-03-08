import {
  PollResponse,
  AssetsResponse,
} from './interfaces/cardano.interface';
import {
  AllowancesRequest,
  AllowancesResponse,
  CancelRequest,
  CancelResponse,
  NonceRequest,
  NonceResponse,
  StatusResponse,
} from '../chain.requests';
import {
  BalanceResponse,
  TokensRequest,
  BalanceRequest,
  PollRequest,
} from '../chain.requests';
import { Cardano } from './cardano';
import { UtxoWithSlot } from '@maestro-org/typescript-sdk';
import { StatusRequest } from '../solana/solana.routes';

export class CardanoController {
  static latest_utxos: Promise<UtxoWithSlot[]>;

  static async balances(
    chain: Cardano,
    request: BalanceRequest,
  ): Promise<BalanceResponse> {
    if (!chain.ready()) {
      await chain.init();
    }
    let utxos = await chain.getAddressUtxos(request.address);
    this.latest_utxos = Promise.resolve(utxos);

    const { balance, assets } = chain.getBalance(await this.latest_utxos);
    const new_assets: Record<string, string> = {};
    Object.keys(assets).forEach((value) => {
      new_assets[value] = assets[value].toString();
    });
    return {
      network: String(chain.network),
      timestamp: Date.now(),
      latency: 0,
      balances: { "ADA" : balance.toString(), ...new_assets },
    };
  }

  static async getTokens(
    cardano: Cardano,
    _req: TokensRequest,
  ): Promise<AssetsResponse> {
    if (!cardano.ready()) {
      await cardano.init();
    }

    return {
      assets: cardano.storedAssetList.map((asset) => {
        const temp = Object(asset);
        return {
          decimals: temp.decimals,
          name: temp.name,
          symbol: temp.name,
        };
      }),
    };
  }

  static async allowances(
    cardano: Cardano,
    request: AllowancesRequest,
  ): Promise<AllowancesResponse | string> {
    if (!cardano.ready()) {
      await cardano.init();
    }

    const { balance, assets } = cardano.getBalance(await this.latest_utxos);
    const new_assets: Record<string, string> = {};
    Object.keys(assets).forEach((value) => {
      new_assets[value] = assets[value].toString();
    });
    return {
      network: String(cardano.network),
      timestamp: Date.now(),
      latency: 0,
      spender: request.spender,
      approvals: {
        ADA: balance.toString(),
        ...new_assets,
      },
    };
  }

  static async getStatus(
    cardano: Cardano,
    _request: StatusRequest,
  ): Promise<StatusResponse | string> {
    if (!cardano.ready()) {
      await cardano.init();
    }

    return {
      chain: 'cardano',
      network: 'mainnet',
      rpcUrl: 'https://mainnet.gomaestro-api.org/v1',
      nativeCurrency: 'ADA',
      currentBlockNumber: await cardano.getCurrentBlockNumber(),
    };
  }

  static async nonce(
    cardano: Cardano,
    _request: NonceRequest,
  ): Promise<NonceResponse | void> {
    if (!cardano.ready()) {
      await cardano.init();
    }

    return {
      nonce: (await cardano.node.epochs.currentEpoch()).data.epoch_no,
    };
  }
  static async cancel(
    cardano: Cardano,
    request: CancelRequest,
  ): Promise<CancelResponse | string> {
    if (!cardano.ready()) {
      await cardano.init();
    }
    return await cardano.cancel(request);
  }

  static async poll(cardano: Cardano, req: PollRequest): Promise<PollResponse> {
    if (!cardano.ready()) {
      await cardano.init();
    }
    const tx = await cardano.getTx(req.txHash);
    const oor = await cardano.checkSatisfaction(req.txHash);

    if (!tx || oor)
      return {
        id: '',
        inputs: [],
        dataInputs: [],
        outputs: [],
        size: 0,
        currentBlock: 0,
        txBlock: 0,
        txHash: '',
        fee: 0,
      };
    return {
      ...tx,
      currentBlock: Number(tx?.block_height),
      txBlock: Number(tx?.block_height),
      txHash: tx?.tx_hash,
    };
  }
}
