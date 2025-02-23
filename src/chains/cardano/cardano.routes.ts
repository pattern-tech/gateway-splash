import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { getInitializedChain } from '../../services/connection-manager';
import { Cardano } from './cardano';
import {
  NonceRequest,
  NonceResponse,
  AllowancesRequest,
  ApproveRequest,
  CancelRequest,
  BalanceRequest,
  TokensRequest,
  StatusRequest,
  PollRequest
} from '../chain.requests';
import { CardanoController } from './cardano.controllers';

declare module 'fastify' {
  interface FastifySchema {
    tags?: readonly string[];
    description?: string;
  }
}

export const CardanoRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /cardano/status
  fastify.get<{ Querystring: StatusRequest }>(
    '/status',
    {
      schema: {
        tags: ['cardano'],
        description: 'Get Cardano chain status',
        querystring: Type.Object({
          network: Type.String(),
        }),
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Cardano>(
        'cardano',
        request.query.network
      );
      return await CardanoController.getStatus(chain as Cardano, request.query);
    }
  );
  
  // GET /cardano/tokens
  fastify.get<{ Querystring: TokensRequest }>(
    '/tokens',
    {
      schema: {
        tags: ['cardano'],
        description: 'Get Cardano tokens',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Cardano>(
        'cardano',
        request.query.network
      );
      return await CardanoController.getTokens(chain as Cardano, request.query);
    }
  );

  // POST /cardano/balances
  fastify.post<{ Body: BalanceRequest }>(
    '/balances',
    {
      schema: {
        tags: ['cardano'],
        description: 'Get Cardano balances',
        body: {
            type: 'object',
            required: ['network'],
            properties: {
              network: { type: 'string' }
            }
          }
        },
    },
    async (request) => {
      const chain = await getInitializedChain<Cardano>(
        'cardano',
        request.body.network
      );
      return await CardanoController.balances(chain as Cardano, request.body);
    }
  );

  // POST /cardano/poll
  fastify.post<{ Body: PollRequest }>(
    '/poll',
    {
      schema: {
        tags: ['cardano'],
        description: 'Poll Cardano transaction status',
        body: {
          type: 'object',
          required: ['network', 'txHash'],
          properties: {
            network: { type: 'string' },
            txHash: { type: 'string' }
          }
        }
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Cardano>(
        'cardano',
        request.body.network
      );
      return await CardanoController.poll(chain as Cardano, request.body);
    }
  );

  // POST /cardano/nonce
  fastify.post<{ Body: NonceRequest; Reply: NonceResponse }>(
    '/nonce',
    {
      schema: {
        tags: ['cardano'],
        description: 'Get nonce for address',
        body: {
          type: 'object',
          required: ['network', 'address'],
          properties: {
            network: { type: 'string' },
            address: { type: 'string' }
          }
        }
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Cardano>(
        'cardano',
        request.body.network
      );
      return await CardanoController.nonce(chain as Cardano, request.body);
    }
  );

  // POST /cardano/nextNonce
  fastify.post<{ Body: NonceRequest; Reply: NonceResponse }>(
    '/nextNonce',
    {
      schema: {
        tags: ['cardano'],
        description: 'Get next nonce for address',
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Cardano>(
        request.body.chain,
        request.body.network
      );
      return await CardanoController.nonce(chain as Cardano, request.body);
    }
  );

  // POST /cardano/allowances
  fastify.post<{ Body: AllowancesRequest }>(
    '/allowances',
    {
      schema: {
        tags: ['cardano'],
        description: 'Get token allowances',
        body: {
          type: 'object',
          required: ['network', 'address', 'spender', 'tokenSymbols'],
          properties: {
            network: { type: 'string' },
            address: { type: 'string' },
            spender: { type: 'string' },
            tokenSymbols: { type: 'array', items: { type: 'string' } }
          }
        }
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Cardano>(
        'cardano',
        request.body.network
      );
      return await CardanoController.allowances(chain as Cardano, request.body);
    }
  );

  // POST /cardano/cancel
  fastify.post<{ Body: CancelRequest }>(
    '/cancel',
    {
      schema: {
        tags: ['cardano'],
        description: 'Cancel transaction',
        body: {
          type: 'object',
          required: ['network', 'nonce'],
          properties: {
            network: { type: 'string' },
            nonce: { type: 'number' }
          }
        }
      },
    },
    async (request) => {
      const chain = await getInitializedChain<Cardano>(
        'cardano',
        request.body.network
      );
      return await CardanoController.cancel(chain as Cardano, request.body);
    }
  );

};

export default CardanoRoutes;
