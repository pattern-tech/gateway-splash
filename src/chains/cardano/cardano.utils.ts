import {
  MaestroClient,
  Configuration as MaestroConfig,
  MaestroSupportedNetworks,
  TokenRegistryMetadata,
} from '@maestro-org/typescript-sdk';
import {
  Currency,
  Network,
  SplashBuilder,
  SplashApi,
  MaestroExplorer,
} from '@splashprotocol/sdk';
import { CardanoToken } from './interfaces/cardano.interface';
import { SplashPool } from './types/cardano.types';
import { poolNftNames, SplashInstance } from './types/node.types';
import dotenv from 'dotenv';
import LRUCache from 'lru-cache';
import { getCardanoConfig } from './cardano.config';
import sha256 from 'crypto-js/sha256';
import { enc } from 'crypto-js';

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
): SplashInstance {
  let splashNetwork: Network = network.toLowerCase() as Network;

  return SplashBuilder(
    SplashApi({ network: splashNetwork }),
    MaestroExplorer.new(splashNetwork, String(process.env.MAESTRO_API_KEY)),
  );
}

export function getAssetsFromPools(
  splashPools: Record<string, SplashPool[]>,
): Record<string, CardanoToken> {
  let tokens: Record<string, CardanoToken> = {};

  // adding ada token as the first token
  let ada = Currency.ada(BigInt(0));

  tokens['ADA'] = {
    token: ada,
    policyId: '',
    decimals: 6,
    name: 'ADA',
    symbol: 'ADA',
    nameBase16: '414441',
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
  let addToAssetMap = (token: Currency) => {
    tokens[token.asset.name.toUpperCase()] = {
      token: token,
      policyId: token.asset.policyId,
      decimals: 1,
      symbol: token.asset.name.toUpperCase(),
      name: token.asset.name.toUpperCase(),
      nameBase16: token.asset.nameBase16,
      splashSupport: true,
    };
  };
  Object.values(splashPools).forEach((pools) => {
    pools.forEach((pool) => {

      if (
        pool.x.asset.name !== '' &&
        pool.x.asset.name.toUpperCase() !== 'ADA'
      ) {
        addToAssetMap(pool.x);
      } else if (
        pool.y.asset.name !== '' &&
        pool.y.asset.name.toUpperCase() !== 'ADA'
      ) {
        addToAssetMap(pool.y);
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
    baseToQuote: baseName16 + '5f' + quoteName16 + '5f4e4654',
    quoteToBase: quoteName16 + '5f' + baseName16 + '5f4e4654',
  };
}

export async function getTokenMetadata(
  policyId: string,
  base16Name: string,
  maestroClient: MaestroClient,
): Promise<TokenRegistryMetadata | null | undefined> {
  if ("414441" === base16Name ) {
    return {
      decimals: 6,
      description: '',
      logo: '',
      name: 'ADA',
      ticker: 'ADA',
      url: '',
    };
  }
  try {
    console.log(`${policyId}${base16Name}`)
    return (
      await maestroClient.assets.assetInfo(`${policyId}${base16Name}`)
    ).data.token_registry_metadata;
  } catch (error) {
    // 429
    // 403
    return undefined;
  }
  
}

/**
 * Fetches metadata for tokens in batches using Promise.all
 * @param {CardanoToken[]} tokens - The array of CardanoTokens
 * @param {MaestroClient} maestroClient - The Maestro node object
 * @returns {Promise<LRUCache<string, TokenRegistryMetadata>>} The fetched metadata
 */
export async function getTokenMetadataWithBackoff(
  tokens: CardanoToken[],
  maestroClient: MaestroClient,
): Promise<LRUCache<string, TokenRegistryMetadata>> {
  const config = getCardanoConfig('Mainnet');
  const metadata = new LRUCache<string, TokenRegistryMetadata>({
    max: Number(config.network.maxLRUCacheInstances),
  });

  const batchSize = 50;
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const fetchMetadata = async (token: CardanoToken): Promise<void> => {

    if (
      metadata.has(token.name.toUpperCase()) ||
      ['ADA', 'LOVELACE'].includes(token.name.toUpperCase())
    ) {
      return;
    }

    try {
      const assetInfo = await maestroClient.assets.assetInfo(
        `${token.policyId}${token.token.asset.nameBase16}`,
      );


      const tokenMetadata = assetInfo.data.token_registry_metadata || {
        decimals: 0,
        description: '',
        logo: '',
        name: token.name,
        ticker: token.name,
        url: '',
      };

      metadata.set(token.name.toUpperCase(), tokenMetadata);
    } catch (error) {
      if (
        String(error).includes('code 429') ||
        String(error).includes('code 403')
      ) {
        await delay(1000);
        return fetchMetadata(token);
      } else if (String(error).includes('code 404')) {
        metadata.set(token.name.toUpperCase(), {
          decimals: 1,
          description: '',
          logo: '',
          name: token.name.toUpperCase(),
          ticker: token.name.toUpperCase(),
          url: '',
        });
      } else {
        console.error(`Error fetching metadata for ${token.name}: ${error}`);
        console.log('trying again in 1 second ...');
        await delay(1000);
        return fetchMetadata(token);
      }
    }
  };

  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    await Promise.all(batch.map((token) => fetchMetadata(token)));
    console.log(`Processed ${i + batch.length} out of ${tokens.length} tokens`);

    // Add a small delay between batches to avoid overwhelming the API
    if (i + batchSize < tokens.length) {
      await delay(500);
    }
  }

  return metadata;
}

export async function getSplashPools(
  splashClient: SplashInstance,
): Promise<Record<string, SplashPool[]>> {
  try {
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
  } catch (error) {
    console.error(`error while fetching the splash pool ${error}`);
    throw new Error(`Failed to fetch the splash pools ${error}`);
  }
}

export function generateHash(networkString: string): string {
  return sha256(`${networkString}`).toString(enc.Hex).slice(0, 16);
}

export function updateTokenMetadata(
  token: CardanoToken,
  metadata: TokenRegistryMetadata,
): CardanoToken {
  token.decimals = metadata.decimals;
  token.symbol = metadata.ticker;
  token.token.asset.metadata = {
    policyId: token.policyId,
    subject: '',
    ...metadata,
  };

  return token;
}
