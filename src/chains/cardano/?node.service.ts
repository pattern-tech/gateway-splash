// import axios from "axios";
// import { CardanoExplorer } from "./interfaces/explorer.interface";
// import { TimestampedBlockInfo, Utxo } from "@maestro-org/typescript-sdk";
// import { MaestroUtxosResponse } from "./types/node.types";
// import dotenv from "dotenv";

// dotenv.config();

// /**
//  * This class allows you to interact with the maestro node
//  * @class
//  * @param {string} nodeURL - The node's base URL
//  * @param {number} timeout - Timeout
//  */
// // - Getting UTXOs of a Specific Address: UTxOs at an address | Maestro

// // - Checking the Status of a Specific Transaction: Transaction state | Maestro

// // - Getting Transactions of a Specific Address: Address transactions | Maestro

// // - Getting balance of a specific address: Balance by payment credential | Maestro


// export class MaestroNode {
//   private node
//   constructor(
//     private nodeURL: string,
//     private timeout: number,
//   ) {}

//   // private async request<ResponseBlock = any>(
//   //   method: 'POST' | 'GET' | 'HEAD' = 'GET',
//   //   url: string,
//   //   headers?: Record<string, string>,
//   //   body?: Record<string, string> | string,
//   // ) {
//   //   const response = await axios<ResponseBlock>({
//   //     baseURL: this.nodeURL,
//   //     url,
//   //     method,
//   //     headers: headers ?? this.getMaestroHeaders(),
//   //     timeout: this.timeout,
//   //     ...(method === 'POST' ? { data: body } : null),
//   //   });

//   //   return response.data;
//   // }
  
//   /**
//    * Returns the default maestro headers + custom headers if provided
//    * @returns Record<string, string>
//    * @function
//    * @async
//    */
//   private getMaestroHeaders(additionalHeader?: Record<string, string>): Record<string, string> {
//     return {
//       "Accept": "application/json",
//       "api-key": String(process.env.MASTEREO_API_KEY), 
//       ...additionalHeader
//     }
//   }

//   /**
//    * Gets network(latest block) height
//    * @returns number
//    * @function
//    * @async
//    */
//   async getNetworkHeight(): Promise<number> {
//     const info = await this.request<TimestampedBlockInfo>('GET', '/blocks/latest', {"api-key": String(process.env.MASTEREO_API_KEY)} );

//     return info.data.height;
//   }

//   /**
//    *  Get unspent transaction outputs wallet address
//    * @param {string} address
//    * @param {string} offset
//    * @param {string} limit
//    * @param {string} sortDirection
//    * @returns NodeErgoBoxResponse
//    * @function
//    * @async
//    */
//   async getUTxosByAddress(
//     address: string,
//     offset: number,
//     limit: number,
//     sortDirection = 'desc',
//   ) {
//     return this.request<MaestroUtxosResponse>(
//       'GET',
//       `/addresses/${address}/utxos?count=${limit}&order=${sortDirection}&cursor=${offset}`,
//       this.getMaestroHeaders({ 'Content-Type': 'text/plain' }),
//     );
//   }

//   async chainSliceInfo(height: number): Promise<any> {
//     return this.request<NodeChainSliceResponse[]>(
//       'GET',
//       `/blocks/chainSlice?fromHeight=${height - 10}&toHeight=${height}`,
//     );
//   }

//   async getCtx() {
//     const height = await this.getNetworkHeight();
//     const blockHeaders = BlockHeaders.from_json(
//       await this.chainSliceInfo(height),
//     );
// );
//   }

//   async postTransaction(tx: any): Promise<string> {
//     return this.request<any>(
//       'POST',
//       `/transactions`,
//       { 'Content-Type': 'application/json' },
//       tx,
//     ).catch(() => {
//       return '';
//     });
//   }

//   async getTxsById(id: string): Promise<ErgoTxFull | undefined> {
//     const result = await this.request<ErgoTxFull | undefined>(
//       'GET',
//       `/blockchain/transaction/byId/${id}`,
//     ).catch(() => {
//       return undefined;
//     });
//     return result;
//   }

//   async getBlockInfo(blockHeight: string): Promise<any> {
//     const blockId = (await this.request('GET', `/blocks/at/${blockHeight}`))[0];
//     return await this.request('GET', `/blocks/${blockId}`);
//   }
// }


// export class MaestroExplorer implements CardanoExplorer {
//     readonly uri: string;
//     readonly requestTimeoutMillis: number;
//     readonly backend: AxiosInstance;
//     constructor(uri: string, requestTimeoutMillis?: number){
        
//     }
//     getTx(id: TxId): Promise<AugErgoTx | undefined>;
//     getOutput(id: BoxId): Promise<AugErgoBox | undefined>;
//     getBalanceByAddress(address: Address): Promise<Balance | undefined>;
//     getTxsByAddress(address: Address, paging: Paging): Promise<[AugErgoTx[], number]>;
//     getUTxsByAddress(address: Address, paging: Paging): Promise<[AugErgoTx[], number]>;
//     getUnspentByErgoTree(tree: ErgoTree, paging: Paging): Promise<[AugErgoBox[], number]>;
//     getUnspentByErgoTreeTemplate(templateHash: HexString, paging: Paging): Promise<AugErgoBox[]>;
//     getUnspentByTokenId(tokenId: TokenId, paging: Paging, sort?: Sorting): Promise<AugErgoBox[]>;
//     getByTokenId(tokenId: TokenId, paging: Paging, sort?: Sorting): Promise<AugErgoBox[]>;
//     getUnspentByErgoTreeTemplateHash(hash: HexString, paging: Paging): Promise<[AugErgoBox[], number]>;
//     searchUnspentBoxes(req: BoxSearch, paging: Paging): Promise<[AugErgoBox[], number]>;
//     searchUnspentBoxesByTokensUnion(req: BoxAssetsSearch, paging: Paging): Promise<[AugErgoBox[], number]>;
//     searchUnspentBoxesByAddress(address: Address): Promise<ErgoBoxProxy[]>;
//     searchUnspentBoxesByAddresses(addresses: Address[]): Promise<ErgoBoxProxy[]>;
//     getFullTokenInfo(tokenId: TokenId): Promise<AugAssetInfo | undefined>;
//     getFullTokensInfoBySymbol(tokenSymbol: TokenSymbol): Promise<AugAssetInfo[]>;
//     getTokens(paging: Paging): Promise<[AugAssetInfo[], number]>;
//     getNetworkContext(): Promise<NetworkContext>;
//     getBlockHeaders(paging: Paging, sort?: Sorting): Promise<[BlockHeader[], number]>;
// }


// curl -L -X GET 'https://preprod.gomaestro-api.org/v1/addresses/stake1ux2st04y7adhxyfyhz02qccym9w3snahkyvad05cwvzvxzg96zt0m/utxos' \
// -H 'Accept: application/json' \
// -H 'api-key:fT8D4mUOoLEUDCNCkbbAy77hIfrLiVKP'
// -H 'count:1' 