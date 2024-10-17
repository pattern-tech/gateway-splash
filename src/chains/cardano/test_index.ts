// importing the cardano class

import { Cardano } from './cardano';

async function main() {
  let cardano = Cardano.getInstance('Mainnet', 'arbitrage');

  await cardano.init();

  console.log(cardano._assetMap)
}


main()