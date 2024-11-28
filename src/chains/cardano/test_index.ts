//  ✔ constructor (done in 1)
//  ✔ init (done in 3)
//  ✔ loadTokenMetadata (done in 1)
//  ✔ getInstance
//  ✔ getConnectedInstances (done in 1)
//  ✔ getAddressUtxos (done in 4)
//  ✔ getAccountFromMnemonic
//  ✔ getAssetBalance
//  ✔ getAdaBalance
//  ✔ getBalance
//  ✔ loadAssets (done in 4)
//  ✔ loadPools (done in 4)
//  * swap
//  ✔ validateTokens (done in swap)
//  * createTokens (done in swap)
//  * validatePool (done in swap)
//  ✔ getPrice (done in swap)
//  * createSwapTransaction (done in swap)
//  * estimateFee (done in swap)
//  ✔ estimate
//  ✔ findToken (done in estimate)
//  * signAndSubmitTransaction (done in swap)
//  * createTradeResponse  (done in swap)
//  ✔ createPriceResponse (done in estimate)
//  ✔ calculateMinOutput
//  ✔ fromRaw
//  ✔ toRaw
//  ✔ calculatePrice
//  ✔ getPoolByToken
//  ✔ fetchLatestPoolByToken
//  ✔ getTx
//  ✔ getAddressTxs
//  * getTxState // server error

import { Cardano } from './cardano';
import dotenv from 'dotenv';
dotenv.config({ path: '../../../.env' });
import { BigNumber } from 'bignumber.js';
import { TradeSlippage } from './types/node.types';

// Simple test runner
async function runTests() {
  const tests: (() => Promise<void>)[] = [];
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => Promise<void>) {
    tests.push(async () => {
      try {
        console.log(`Running test: ${name}`);
        await fn();
        console.log(`✓ Passed: ${name}`);
        passed++;
      } catch (error) {
        console.error(`✗ Failed: ${name}`);
        console.log(error);
        failed++;
      }
    });
  }

  // Tests
  // test('1.getInstance should return a Cardano instance', async () => {
  //   const cardano = Cardano.getInstance('Mainnet', 'test');
  //   assert(
  //     cardano instanceof Cardano,
  //     'Expected getInstance to return a Cardano instance',
  //   );
  // });

  // test('1.1.getInstance should return the same instance for the same parameters', async () => {
  //   const cardano1 = Cardano.getInstance('Mainnet', 'test');
  //   const cardano2 = Cardano.getInstance('Mainnet', 'test');
  //   const connectedInstances = Cardano.getConnectedInstances();
  //   assert(
  //     Object.keys(connectedInstances).length === 1,
  //     'More than one instance was made',
  //   );
  //   assert(
  //     cardano1 === cardano2,
  //     'Expected getInstance to return the same instance',
  //   );
  // });

  // test('2.getAdaBalance should return the correct balance', async () => {
  //   const cardano = Cardano.getInstance('Mainnet', 'test');
  //   const balance = await cardano.getAdaBalance(
  //     'addr1qxezkuean46f8xm9fq6w45n5y0mlqwcyggu8ejks8q2up9lq6k097swcyl0r4mp0uqw9a4rx692cczyy5zek6epsd0ds8rpg3v',
  //   );
  //   console.log(balance);
  //   assert(balance === '11.571138', 'Expected ADA balance to be 11');
  // });

  // test('3.getAssetBalance should throw for ADA', async () => {
  //   const cardano = Cardano.getInstance('Mainnet', 'test');
  //   try {
  //     await cardano.getAssetBalance(
  //       'addr1qxezkuean46f8xm9fq6w45n5y0mlqwcyggu8ejks8q2up9lq6k097swcyl0r4mp0uqw9a4rx692cczyy5zek6epsd0ds8rpg3v',
  //       'ADA',
  //     );
  //     assert(false, 'Expected getAssetBalance to throw for ADA');
  //   } catch (error) {
  //     assert(
  //       (error as Error).message.includes('use `getAdaBalance` function !'),
  //       'Expected specific error message',
  //     );
  //   }
  // });

  // test('3.1.getAssetBalance should return correct balance for non-ADA asset', async () => {
  //   const cardano = Cardano.getInstance('Mainnet', 'test');
  //   await cardano.init();
  // const balance = await cardano.getAssetBalance(
  //   'addr1qxezkuean46f8xm9fq6w45n5y0mlqwcyggu8ejks8q2up9lq6k097swcyl0r4mp0uqw9a4rx692cczyy5zek6epsd0ds8rpg3v',
  //   'HUNT',
  // );
  // assert(balance === '1.446308', 'Expected HUNT balance to be 1.446308');
  // });

  // test('4.getBalance should return ADA and non-ADA balance of an address', async () => {
  //   const cardano = Cardano.getInstance('mainnet');
  //   await cardano.init();
  //   console.log(cardano.findToken("USDC"))
  //   const utxos = await cardano.getAddressUtxos(
  //     'addr1qxezkuean46f8xm9fq6w45n5y0mlqwcyggu8ejks8q2up9lq6k097swcyl0r4mp0uqw9a4rx692cczyy5zek6epsd0ds8rpg3v',
  //   );
  //   // console.log(cardano.getBalance(utxos));
  //   console.log(await cardano.getNetworkHeight());
  //   // console.log(await cardano.checkSatisfaction("7d88a74255d1c28e6a1cbb6b43291d10c00a6f741fbfbbac36975cca4948c5c3"))
  //   await cardano.activateWallet(String(process.env.DAEDLUS_KEY));

  //   // console.log(
  //   //   await cardano.cancel(
  //   //     '14e77f31ad6d03f53610917a9b5a83c26d445acc53f2da6b37a7e3a04667574e',
  //   //   ),
  //   // );
  //   // console.log(utxos);
  //   // console.log(await cardano.estimate('ADA', 'USDC', BigNumber(1), true, '5'));
  //   console.log(await cardano.estimate('ADA', 'BTN', BigNumber(1), true, '5'));

  //   const balance = cardano.getBalance(utxos);
  //   console.log(balance);

  //   Object.keys(balance.assets).forEach((key) =>
  //     console.log(`${key}: ${String(balance.assets[key])}`),
  //   );
  //   assert(balance);
  // });

  // test('5.getAccountFromMnemonic must return proper bech32 wallet address', async () => {
  //   const cardano = Cardano.getInstance('Mainnet', 'test');
  //   let cardanoWallet = cardano.getAccountFromMnemonic(
  //     String(process.env.DAEDLUS_KEY),
  //   );
  //   await cardanoWallet.initialize();
  //   assert(
  //     cardanoWallet.generateBaseAddress() ===
  //       'addr1qxezkuean46f8xm9fq6w45n5y0mlqwcyggu8ejks8q2up9lq6k097swcyl0r4mp0uqw9a4rx692cczyy5zek6epsd0ds8rpg3v',
  //     "generated address doesn't match with the expected address ",
  //   );
  // });

  // test('6.estimate must return a deterministic price of two tokens', async () => {
  //   const cardano = Cardano.getInstance('Mainnet', 'test');
  //   await cardano.init();

  //   let estimatedPrice = await cardano.estimate(
  //     'ADA',
  //     'IAG',
  //     BigNumber(300),
  //     false, // true to reverse the trade
  //     '5',
  //   );
  //   console.log(estimatedPrice);
  //   assert(estimatedPrice);
  // });

  // test('7.tx related functions must return the expected transactions', async () => {
  //   const cardano = Cardano.getInstance('Mainnet', 'test');
  //   // await cardano.init();

  //   let txByHash = await cardano.getTx(
  //     'bec531af9a93771f98d89517412c49f75f6102388622d67d1ebcbd56fcb66437',
  //   );

  //   let addressTxs = await cardano.getAddressTxs(
  //     'addr1qxezkuean46f8xm9fq6w45n5y0mlqwcyggu8ejks8q2up9lq6k097swcyl0r4mp0uqw9a4rx692cczyy5zek6epsd0ds8rpg3v',
  //   );

  //   console.log(txByHash);
  //   console.log(addressTxs);

  //   assert(txByHash && addressTxs);
  // });

  // test('8.pool fetchers must return expected pools', async () => {
  //   const cardano = Cardano.getInstance('Mainnet', 'test');

  //   await cardano.init();

  //   let pairPool = cardano.getPoolByPair('ADA', 'HUNT');

  //   let pairLatestPools = await cardano.fetchLatestPoolByToken('ADA', 'HUNT');

  //   console.log(pairPool);

  //   console.log(pairLatestPools);
  // });

  test('swap should perform a swap and return a TradeResponse', async () => {
    const cardano = Cardano.getInstance('Mainnet', 'test');
    // await cardano.init();

    // await cardano.activateWallet(String(process.env.DAEDLUS_KEY));
    // let userAddress =
    //   'addr1qxezkuean46f8xm9fq6w45n5y0mlqwcyggu8ejks8q2up9lq6k097swcyl0r4mp0uqw9a4rx692cczyy5zek6epsd0ds8rpg3v';

    // let balances = cardano.getBalance(
    //   await cardano.getAddressUtxos(userAddress),
    // );

    // console.log(balances.balance.toString());
    // Object.entries(balances.assets).forEach(([key, value]) => {
    //   console.log(`Key: ${key}, Value: ${value.toString()}`);
    // });
    console.log("this sis the estimated: ",
      await cardano.estimate('ADA', 'USDC', BigNumber(1), true, '0/1' as TradeSlippage),
    );

    // const result = await cardano.swap(
    //   'ADA',
    //   'USDC',
    //   BigNumber(1),
    //   true,
    //   '1',
    //   "1"
    // );

    // // await cardano.cancel("4cea90770dd1838d9bd668c7e438a009043141266980ed9b051d9da4e0bd2a04");
    // // await cardano.cancel("38ff0dfeaacb0fdc8e2d2d9bcbaf79dda34f370126fa7b954fbd656d78fd168e");

    // console.log('swap tx hash : ', result);

    // balances = cardano.getBalance(await cardano.getAddressUtxos(userAddress));

    // console.log(balances.balance.toString());
    // Object.entries(balances.assets).forEach(([key, value]) => {
    //   console.log(`Key: ${key}, Value: ${value.toString()}`);
    // });
  });

  // Run all tests
  for (const testFn of tests) {
    await testFn();
  }

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
runTests();
