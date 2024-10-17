// import { Cardano } from './cardano';

// async function main() {
//   let cardano: Cardano | null = null;
//   try {
//     console.log("Initializing Cardano instance...");
//     cardano = Cardano.getInstance('Mainnet', 'arbitrage'); // arbitrage is a random name
    
//     console.log("Initializing Cardano...");
//     await cardano.init();
//     console.log("Cardano initialized successfully.");

//     const address = "addr1q96pqnx4ef3g3swa9c3wuhy8flw0cxup396x9kg32dykgvx70pn0u5rga0euslwdk45d555d5hwttajemxmqqy88g58sxll9gv";
//     const assetName = 'SOLANA';

//     console.log(`Fetching balance for ${assetName}...`);
//     let balance = await cardano.getAssetBalance(address, assetName);
//     console.log(`Balance for ${assetName}: ${balance}`);
//   } catch (error) {
//     console.error("An error occurred:", error);
//     if (error instanceof Error) {
//       console.error("Error message:", error.message);
//       console.error("Error stack:", error.stack);
//     }
//   } finally {
//     if (cardano) {
//       console.log("Closing Cardano instance...");
//       await cardano.close();
//       console.log("Cardano instance closed.");
//     }
//   }
// }

// main().then(res => {
//   console.info("all tests passed");
//   process.exit(0);
// }).catch(error => {
//   console.error("Unhandled error in main:", error);
//   process.exit(1);
// });


import { Cardano } from './cardano';
import { BigNumber } from 'bignumber.js';
import { CardanoWallet } from './wallet.service';
import assert from 'assert';

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
  test('getInstance should return a Cardano instance', async () => {
    const cardano = Cardano.getInstance('Mainnet', 'test');
    assert(cardano instanceof Cardano, 'Expected getInstance to return a Cardano instance');
  });

  test('getInstance should return the same instance for the same parameters', async () => {
    const cardano1 = Cardano.getInstance('Mainnet', 'test');
    const cardano2 = Cardano.getInstance('Mainnet', 'test');
    assert(cardano1 === cardano2, 'Expected getInstance to return the same instance');
  });

  test('getAdaBalance should return the correct balance', async () => {
    const cardano = Cardano.getInstance('Mainnet', 'test');
    const balance = await cardano.getAdaBalance('addr1q96pqnx4ef3g3swa9c3wuhy8flw0cxup396x9kg32dykgvx70pn0u5rga0euslwdk45d555d5hwttajemxmqqy88g58sxll9gv');
    console.log(balance)
    assert(balance === '90.526477', 'Expected ADA balance to be 95');
  });

  test('getAssetBalance should throw for ADA', async () => {
    const cardano = Cardano.getInstance('Mainnet', 'test');
    try {
      await cardano.getAssetBalance('addr1q96pqnx4ef3g3swa9c3wuhy8flw0cxup396x9kg32dykgvx70pn0u5rga0euslwdk45d555d5hwttajemxmqqy88g58sxll9gv', 'ADA');
      assert(false, 'Expected getAssetBalance to throw for ADA');
    } catch (error) {
      assert((error as Error).message.includes('use `getAdaBalance` function !'), 'Expected specific error message');
    }
  });

  test('getAssetBalance should return correct balance for non-ADA asset', async () => {
    const cardano = Cardano.getInstance('Mainnet', 'test');
    await cardano.init();
    const balance = await cardano.getAssetBalance('addr1q96pqnx4ef3g3swa9c3wuhy8flw0cxup396x9kg32dykgvx70pn0u5rga0euslwdk45d555d5hwttajemxmqqy88g58sxll9gv', 'SOLANA');
    assert(balance === '995309491892955', 'Expected SOLANA balance to be 995,309,491,892,955');
  });

  test('getBalance should return ADA and non-ADA balance of an address', async () => {
    const cardano = Cardano.getInstance('Mainnet', 'test');
    await cardano.init();
    const balance = cardano.getBalance(await cardano.getAddressUtxos('addr1q96pqnx4ef3g3swa9c3wuhy8flw0cxup396x9kg32dykgvx70pn0u5rga0euslwdk45d555d5hwttajemxmqqy88g58sxll9gv'));
    assert(balance);
  });

  // test('swap should perform a swap and return a TradeResponse', async () => {
  //   const cardano = Cardano.getInstance('Mainnet', 'test');
  //   const mockWallet = new CardanoWallet('mock_mnemonic');
  //   (cardano as any).validateTokens = () => [
  //     { policyId: 'policy_a', name: 'TOKEN_A', decimals: 6, symbol: 'TA' },
  //     { policyId: 'policy_b', name: 'TOKEN_B', decimals: 6, symbol: 'TB' }
  //   ];
  //   (cardano as any).createTokens = () => [
  //     { asset: { policyId: 'policy_a', name: 'TOKEN_A' } },
  //     { asset: { policyId: 'policy_b', name: 'TOKEN_B' } }
  //   ];
  //   (cardano as any).validatePool = () => {};
  //   (cardano as any).getPrice = async () => ({ raw: '1.5' });
  //   (cardano as any).createSwapTransaction = async () => ({ cbor: 'mock_cbor' });
  //   (cardano as any).estimateFee = async () => 1000000;
  //   (cardano as any).signAndSubmitTransaction = async () => 'mock_tx_hash';
  //   (cardano as any).calculateMinOutput = () => new BigNumber(95);
  //   (cardano as any).createTradeResponse = async () => ({ txHash: 'mock_tx_hash' });

  //   const result = await cardano.swap(
  //     mockWallet,
  //     'TOKEN_A',
  //     'TOKEN_B',
  //     new BigNumber(100),
  //     '1.5',
  //     true,
  //     '1'
  //   );
  //   assert(result.txHash === 'mock_tx_hash', 'Expected swap to return a TradeResponse with txHash');
  // });

  // Run all tests
  for (const testFn of tests) {
    await testFn();
  }

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();