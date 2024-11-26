// // import {Cardano} from "./chains/cardano/cardano";
// // import {MaestroClient} from "@maestro-org/typescript-sdk";
// // import {getMaestroConfig} from "./chains/cardano/cardano.utils";
// import {MaestroExplorer, SplashApi, SplashBuilder} from "@splashprotocol/sdk";
//
// async function x(){
//   const x = SplashBuilder(
//     SplashApi({ network: 'mainnet' }),
//     MaestroExplorer.new('mainnet', "o4l2yiriIOuv2IoXGebscshSU5t5hw0B"),
//   );
//   const y = await x.api.getPairs()
//   console.log(y[0].base)
//   console.log(y[0].quote)
//   // console.log("afsdf")
//   // const zz = new Cardano("mainnet" as any, {} as any, 100 , [] as any)
//   // const x = await zz.getAccountFromMnemonic("bean gaze rude oval syrup doctor unique banner cement awesome desert peace seven toast absent hurdle shrug lend topple off other option assume heavy")
//   // console.log(x)
//   // // console.log()
//   // const z = x.generateBaseAddress() as string
//   // console.log(z)
//   // const utxos = await zz.getAddressUtxos(z);
//   // console.log(utxos)
//   // const z = new MaestroClient(
//   //   getMaestroConfig('Mainnet', "https://mainnet.gomaestro-api.org/v1"),
//   // );
//   // console.log(await z.addresses.utxosByAddress("addr1qxezkuean46f8xm9fq6w45n5y0mlqwcyggu8ejks8q2up9lq6k097swcyl0r4mp0uqw9a4rx692cczyy5zek6epsd0ds8rpg3v"))
//   //
//   // const { balance, assets } = chain.getBalance(utxos);
//   // const new_assets: Record<string, string> = {};
//   // Object.keys(assets).forEach((value) => {
//   //   new_assets[value] = assets[value].toString()
//   // });
//   // return {
//   //   network: String(chain.network),
//   //   timestamp: Date.now(),
//   //   latency: 0,
//   //   balances: { LOVELACE: balance.toString(), ...new_assets },
//   // };
//
//   // console.log("zsff")
// }
// x()