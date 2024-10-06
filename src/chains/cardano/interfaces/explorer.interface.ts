// export interface CardanoExplorer {
//     /** Get confirmed transaction by id.
//      */
//     getTx(id: TxId): Promise<AugErgoTx | undefined>;
//     /** Get confirmed output by id.
//      */
//     getOutput(id: BoxId): Promise<AugErgoBox | undefined>;
//     /** Get confirmed balance by address.
//      */
//     getBalanceByAddress(address: Address): Promise<Balance | undefined>;
//     /** Get transactions by address.
//      */
//     getTxsByAddress(address: Address, paging: Paging): Promise<[AugErgoTx[], number]>;
//     /** Get unconfirmed transactions by address.
//      */
//     getUTxsByAddress(address: Address, paging: Paging): Promise<[AugErgoTx[], number]>;
//     /** Get unspent boxes with a given ErgoTree.
//      */
//     getUnspentByErgoTree(tree: ErgoTree, paging: Paging): Promise<[AugErgoBox[], number]>;
//     /** Get unspent boxes with scripts matching a given template hash.
//      */
//     getUnspentByErgoTreeTemplate(hash: HexString, paging: Paging): Promise<AugErgoBox[]>;
//     /** Get unspent boxes containing a token with given id.
//      */
//     getUnspentByTokenId(tokenId: TokenId, paging: Paging, sort?: Sorting): Promise<AugErgoBox[]>;
//     /** Get boxes containing a token with given id.
//      */
//     getByTokenId(tokenId: TokenId, paging: Paging, sort?: Sorting): Promise<AugErgoBox[]>;
//     /** Get unspent boxes by a given hash of ErgoTree template.
//      */
//     getUnspentByErgoTreeTemplateHash(hash: HexString, paging: Paging): Promise<[AugErgoBox[], number]>;
//     /** Detailed search among unspent boxes.
//      */
//     searchUnspentBoxes(req: BoxSearch, paging: Paging): Promise<[AugErgoBox[], number]>;
//     /** Search among unspent boxes by ergoTreeTemplateHash and tokens..
//      */
//     searchUnspentBoxesByTokensUnion(req: BoxAssetsSearch, paging: Paging): Promise<[AugErgoBox[], number]>;
//     /** Get a token info by id.
//      */
//     getFullTokenInfo(tokenId: TokenId): Promise<AugAssetInfo | undefined>;
//     /** Get tokens info by TokenSymbol.
//      */
//     getFullTokensInfoBySymbol(tokenSymbol: TokenSymbol): Promise<AugAssetInfo[]>;
//     /** Get all available tokens.
//      */
//     getTokens(paging: Paging): Promise<[AugAssetInfo[], number]>;
//     /** Get current network context.
//      */
//     getNetworkContext(): Promise<NetworkContext>;
//     /** Get block headers.
//      */
//     getBlockHeaders(paging: Paging, sort?: Sorting): Promise<[BlockHeader[], number]>;
//     /** Get UTXo by address
//      */
//     searchUnspentBoxesByAddress(address: Address): Promise<ErgoBoxProxy[]>;
//     /** Get UTXo by addresses
//      */
//     searchUnspentBoxesByAddresses(addresses: Address[]): Promise<ErgoBoxProxy[]>;
// }

