import {
  BalancesRequest,
  PollRequest,
  PollResponse,
  TokenResponse,
} from './interfaces/cardano.interface';
import { BalanceResponse, TokensRequest } from '../../network/network.requests';
import { AllowancesRequest, AllowancesResponse } from '../chain.requests';
import {Cardano} from "./cardano";
// import {cancel} from "../chain.controller";

export class CardanoController {

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

  static async balances(
    chain: Cardano,
    request: BalancesRequest,
  ): Promise<BalanceResponse> {
    if (!chain.ready()) {
      await chain.init();
    }
    const utxos = await chain.getAddressUtxos(request.address);

    const { balance, assets } = chain.getBalance(utxos);
    return {
      network: chain.network,
      timestamp: Date.now(),
      latency: 0,
      balances: { LOVELACE: balance.div(Math.pow(10, 9)).toString(), ...assets },
    };
  }

  static async getTokens(
    cardano: Cardano,
    _req: TokensRequest,
  ): Promise<TokenResponse> {
    if (!cardano.ready()) {
      await cardano.init();
    }

    return {
      assets: cardano.storedAssetList,
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

    return {
      network: cardano.network,
      timestamp: Date.now(),
      latency: 0,
      spender: request.spender,
      approvals: {
        LOVELACE: balance.div(Math.pow(10, 9)).toString(),
        ...assets,
      },
    };
  }
}
