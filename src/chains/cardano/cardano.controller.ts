import {
  BalancesRequest,
  PollRequest,
  PollResponse,
  AssetsResponse
} from './interfaces/cardano.interface';
import { AllowancesRequest, AllowancesResponse } from '../chain.requests';
import { BalanceResponse, TokensRequest } from '../../network/network.requests';
import {Cardano} from "./cardano";

export class CardanoController {
  static async balances(
    chain: Cardano,
    request: BalancesRequest,
  ): Promise<BalanceResponse> {
    if (!chain.ready()) {
      await chain.init();
    }
    const utxos = await chain.getAddressUtxos(request.address);

    const { balance, assets } = chain.getBalance(utxos);
    const new_assets: Record<string, string> = {};
    Object.keys(assets).forEach((value) => {
      new_assets[value] = assets[value].toString()
    });
    return {
      network: String(chain.network),
      timestamp: Date.now(),
      latency: 0,
      balances: { ADA: balance.toString(), ...new_assets },
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
      assets: cardano.storedAssetList.map((asset)=>{
        const temp = Object(asset)
        return {
          decimals: temp.decimals,
          name: temp.name,
          symbol: temp.name
        }
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
    const utxos = await cardano.getAddressUtxos(request.address);

    const { balance, assets } = cardano.getBalance(utxos);
    const new_assets: Record<string, string> = {};
    Object.keys(assets).forEach((value) => {
      new_assets[value] = assets[value].toString()
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

  static async poll(cardano: Cardano, req: PollRequest): Promise<PollResponse> {
    if (!cardano.ready()) {
      await cardano.init();
    }
    const tx = await cardano.getTx(req.txHash);
    if (!tx)
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
      fee: tx.fee,
    };
  }
}
