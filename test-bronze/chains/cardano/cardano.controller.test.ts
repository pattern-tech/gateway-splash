// import { CardanoController } from '../../../src/chains/cardano/cardano.controller';
import { Cardano } from '../../../src/chains/cardano/cardano';
import * as node from '../../../src/chains/cardano/cardano.utils';

jest.mock('@maestro-org/typescript-sdk', () => ({
  MaestroClient: jest.fn(),
}));

describe('CardanoController', () => {
  // const cardanoController = new CardanoController();
  // beforeEach(() => {});

  it('Should be defined', () => {
    jest.spyOn(node, 'getMaestroConfig').mockReturnValue({} as any);
    jest.spyOn(node, 'getSplashInstance').mockReturnValue({} as any);
    const cardano = new Cardano(
      'mainnet',
      {
        network: {
          nodeURL: 'nodeURL',
          utxosLimit: 'utxosLimit',
          defaultSlippage: 'defaultSlippage',
        },
      } as any,
      100,
      {} as any,
    );
    expect(cardano).toBeDefined();
  });

  // describe('balances', () => {
  //   beforeEach(() => {
  //     jest.spyOn(node, 'getMaestroConfig').mockReturnValue({} as any);
  //     jest.spyOn(node, 'getSplashInstance').mockReturnValue({} as any);
  //   });
  //   const cardano = new Cardano(
  //     'mainnet',
  //     {
  //       network: {
  //         nodeURL: 'nodeURL',
  //         utxosLimit: 'utxosLimit',
  //         defaultSlippage: 'defaultSlippage',
  //       },
  //     } as any,
  //     100,
  //     {} as any,
  //   );

  //   it('Should be defined', () => {
  //     expect(CardanoController.balances).toBeDefined();
  //   });

  //   it('Should not call init from cardano if cardano is ready', async () => {
  //     jest.spyOn(cardano, 'ready').mockReturnValue(true);
  //     jest
  //       .spyOn(cardano, 'getAddressUtxos')
  //       .mockReturnValue({ info: 'info' } as any);
  //     jest.spyOn(cardano, 'init').mockResolvedValue({} as any);
  //     const result = await CardanoController.balances(cardano, {} as any);
  //     expect(cardano.getAddressUtxos).toHaveBeenCalled();
  //     expect(result).toEqual('info');
  //     expect(cardano.init).not.toHaveBeenCalled();
  //   });
  // });
});
