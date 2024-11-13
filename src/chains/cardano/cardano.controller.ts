import {
  PollRequest,
  PollResponse,
} from './interfaces/cardano.interface';
import {Cardano} from "./cardano";

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
}
