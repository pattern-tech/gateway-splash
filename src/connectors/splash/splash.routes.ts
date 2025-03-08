import { FastifyPluginAsync } from 'fastify';

import { Splash } from './splash';
import {
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
  PriceRequestSchema,
  PriceResponseSchema,
  TradeRequestSchema,
  TradeResponseSchema,
} from '../connector.requests';
import {
  validatePriceRequest,
  validateTradeRequest,
} from '../connector.validators';

export const SplashRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /splash/estimateTrade
  fastify.post<{ Body: PriceRequest; Reply: PriceResponse }>(
    '/price',
    {
      schema: {
        description: 'Get Splash price quote',
        tags: ['splash'],
        body: PriceRequestSchema,
        response: {
          200: PriceResponseSchema,
        },
      },
    },
    async (request) => {
      validatePriceRequest(request.body);
      const connector: Splash = Splash.getInstance(
        request.body.chain,
        request.body.network,
        request.body.connector,
      );
      return await connector.estimateTrade(request.body);
    },
  );

  // POST /splash/executeTrade
  fastify.post<{ Body: TradeRequest; Reply: TradeResponse }>(
    '/trade',
    {
      schema: {
        description: 'Execute Splash trade',
        tags: ['splash'],
        body: TradeRequestSchema,
        response: {
          200: TradeResponseSchema,
        },
      },
    },
    async (request) => {
      validateTradeRequest(request.body);
      const connector: Splash = Splash.getInstance(
        request.body.chain,
        request.body.network,
        request.body.connector,
      );
      return await connector.executeTrade(request.body);
    },
  );
};

export default SplashRoutes;
