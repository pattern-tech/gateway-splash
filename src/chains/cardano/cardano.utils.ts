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

export async function getAssetsFromPools(
  maestroClient: MaestroClient,
  splashPools: Record<string, SplashPool[]>,
): Promise<Record<string, CardanoToken>> {
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
  Object.values(splashPools).forEach((pools) =>
    pools.map(async (pool) => {
      for (let i = 0; 1 < 2; i++) {
        if (
          pool.x.asset.name != '' ||
          !String(pool.nft.nameBase16).includes('414441')
        ) {
          let metadata = await getTokenMetadata(
            pool.x.asset.policyId,
            pool.x.asset.name, // will be converted to hex, not case sensitive
            maestroClient,
          );
          tokens[stringToHex(pool.x.asset.name)] = {
            token: pool.x,
            policyId: pool.x.asset.policyId,
            decimals: metadata?.decimals ?? 6,
            symbol: metadata?.ticker ?? pool.x.asset.name.toUpperCase(),
            name: pool.x.asset.name.toUpperCase(),

            splashSupport: true,
          };
        }
        if (
          pool.y.asset.name != '' ||
          !String(pool.nft.nameBase16).includes('414441')
        ) {
          let metadata = await getTokenMetadata(
            pool.y.asset.policyId,
            pool.y.asset.name, // will be converted to hex, not case sensitive
            maestroClient,
          );
          tokens[stringToHex(pool.y.asset.name)] = {
            token: pool.y,
            policyId: pool.y.asset.policyId,
            decimals: metadata?.decimals ?? 6,
            symbol: metadata?.ticker ?? pool.y.asset.name.toUpperCase(),
            name: pool.y.asset.name.toUpperCase(),
            splashSupport: true,
          };
        }
      }
    }),
  );

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
async function getTokenMetadata(
  policyId: string,
  name: string,
  maestroClient: MaestroClient,
): Promise<TokenRegistryMetadata | null | undefined> {
  return (
    await maestroClient.assets.assetInfo(`${policyId}${stringToHex(name)}`)
  ).data.token_registry_metadata;
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

  verifiedPools.map(async (pool) => {
    // saving the pool id into pools
    poolMap[String(pool.nft.nameBase16)].push(pool); // saves all verified pools, can be changed to only show one pool per pair
  });

  return poolMap;
}
