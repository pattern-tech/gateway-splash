import {
  MaestroClient,
  Configuration as MaestroConfig,
  MaestroSupportedNetworks,
  TokenRegistryMetadata,
} from '@maestro-org/typescript-sdk';
import {
  Currency,
  Network,
  Splash,
  SplashApi,
  SplashRemoteCollaterals,
  stringToHex,
} from '@splashprotocol/sdk';
import { CardanoToken } from './interfaces/cardano.interface';
import { SplashPool } from './types/cardano.types';
import { poolNftNames, SplashClientType } from './types/node.types';
import dotenv from 'dotenv';
import LRUCache from 'lru-cache';
import { getCardanoConfig } from './cardano.config';
dotenv.config({ path: '../../../.env' });

export function getMaestroConfig(
  network: MaestroSupportedNetworks,
  url: string,
): MaestroConfig {
  return new MaestroConfig({
    apiKey: String(process.env.MAESTRO_API_KEY),
    baseUrl: url,
    network: network,
  });
}

export function getSplashInstance(
  network: MaestroSupportedNetworks,
): Splash<SplashClientType> {
  let splashNetwork: Network = network.toLowerCase() as Network;

  return Splash.new(SplashApi.new(splashNetwork), splashNetwork, {
    remoteCollaterals: SplashRemoteCollaterals.new(),
  });
}

export function getAssetsFromPools(
  splashPools: Record<string, SplashPool[]>,
): Record<string, CardanoToken> {
  let tokens: Record<string, CardanoToken> = {};

  // adding ada token as the first token
  let ada = Currency.ada(BigInt(0));
  ada.asset.nameBase16 = '414441';
  tokens['ADA'] = {
    token: ada,
    policyId: '',
    decimals: 6,
    name: 'ADA',
    symbol: 'ADA',
  };

  /**
   * Adding other currencies
   *
   * The policy ID of the pool is a unique identifier that is calculated while minting the NFT.
   * It is derivable but third-party dependent (thtd).
   *
   * The poolId is composed of:
   * nft policyId + nftBase16Name
   *
   * The nftBase16Name is calculated as:
   * (base.nameBase16 + '5f' + quote.nameBase16 + '4e4654')
   *
   * We match the pool existence by the second section of the pool ID when two tokens are provided.
   * This section includes:
   * - '5f' (hex for underscore)
   * - '4e4654' (hex for 'NFT')
   * - '414441' (hex for 'ADA')
   */

  Object.values(splashPools).forEach((pools) => {
    pools.forEach((pool) => {
      if (
        pool.x.asset.name !== '' &&
        !String(pool.nft.nameBase16).includes('414441')
      ) {
        tokens[stringToHex(pool.x.asset.name)] = {
          token: pool.x,
          policyId: pool.x.asset.policyId,
          decimals: 1,
          symbol: pool.x.asset.name.toUpperCase(),
          name: pool.x.asset.name.toUpperCase(),
          splashSupport: true,
        };
      }

      if (
        pool.y.asset.name !== '' &&
        !String(pool.nft.nameBase16).includes('414441')
      ) {
        tokens[stringToHex(pool.y.asset.name)] = {
          token: pool.y,
          policyId: pool.y.asset.policyId,
          decimals: 1,
          symbol: pool.y.asset.name.toUpperCase(),
          name: pool.y.asset.name.toUpperCase(),
          splashSupport: true,
        };
      }
    });
  });

  return tokens;
}

export function getNftBase16Names(
  baseName16: string,
  quoteName16: string,
): poolNftNames {
  return {
    baseToQuote: baseName16 + '5f' + quoteName16 + '4e4654',
    quoteToBase: quoteName16 + '5f' + baseName16 + '4e4654',
  };
}

export async function getTokenMetadata(
  policyId: string,
  name: string,
  maestroClient: MaestroClient,
): Promise<TokenRegistryMetadata | null | undefined> {
  try {
    return (
      await maestroClient.assets.assetInfo(`${policyId}${stringToHex(name)}`)
    ).data.token_registry_metadata;
  } catch (error) {
    // 429
    // 403
    return undefined;
  }
}

/**
 * Leverages the backoff technique and fetches the metadata for the given token list
 * @dev Not all given tokens are guaranteed to have a metadata.
 * @param {CardanoToken[]} tokens - The array of the cardanoTokens
 * @param {MaestroClient} maestroClient - The maestro node object
 * @returns {Promise<LRUCache<string, TokenRegistryMetadata>>} The fetched metadata
 */
export async function getTokenMetadataWithBackoff(
  tokens: CardanoToken[],
  maestroClient: MaestroClient,
): Promise<LRUCache<string, TokenRegistryMetadata>> {
  let config = getCardanoConfig('Mainnet');

  let metadata: LRUCache<string, TokenRegistryMetadata> = new LRUCache<
    string,
    TokenRegistryMetadata
  >({
    max: Number(config.network.maxLRUCacheInstances),
  });

  for (const token of tokens) {
    try {
      if (metadata.has(token.name.toUpperCase())) {
        let _metadata = (
          await maestroClient.assets.assetInfo(
            `${token.policyId}${stringToHex(token.name)}`,
          )
        ).data.token_registry_metadata;

        metadata.set(
          token.name.toUpperCase(),
          _metadata || {
            decimals: 1, // results to show the raw number instead of zero
            description: '',
            logo: '',
            name: token.name.toUpperCase(),
            ticker: token.name.toUpperCase(),
            url: '',
          },
        );
      }
    } catch (error) {
      // resting if rate limit reached (429)
      // todo => more accurate matching
      if (String(error).includes('429')) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw error;
    }
  }

  return metadata;
}

export async function getSplashPools(
  splashClient: Splash<SplashClientType>,
): Promise<Record<string, SplashPool[]>> {
  // loading pools
  let verifiedPools: SplashPool[] = await splashClient.api.getSplashPools({
    duplicated: false,
    verified: true,
  });

  let poolMap: Record<string, SplashPool[]> = {};

  verifiedPools.forEach((pool) => {
    poolMap[String(pool.nft.nameBase16)] =
      poolMap[String(pool.nft.nameBase16)] || [];
    poolMap[String(pool.nft.nameBase16)].push(pool); // saves all verified pools, can be changed to only show one pool per pair
  });

  return poolMap;
}
