import * as utils from '../../../src/chains/cardano/cardano.utils';

describe('getMaestroConfig', () => {
  it('Should be defined', () => {
    expect(utils.getMaestroConfig).toBeDefined();
  });
});
