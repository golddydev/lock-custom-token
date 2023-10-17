import {
  Blockfrost,
  Constr,
  Data,
  Lucid,
  SpendingValidator,
  TxHash,
} from 'https://deno.land/x/lucid@0.10.7/mod.ts';
import * as cbor from 'https://deno.land/x/cbor@v1.4.1/index.js';

// import dotenv
import 'https://deno.land/x/dotenv@v3.2.2/load.ts';

const lucid = await Lucid.new(
  new Blockfrost(
    'https://cardano-preview.blockfrost.io/api/v0',
    Deno.env.get('BLOCKFROST_API_KEY')
  ),
  'Preview'
);

lucid.selectWalletFromPrivateKey(await Deno.readTextFile('./key.sk'));

const validator = await readValidator();

const ownerPublicKeyHash = lucid.utils.getAddressDetails(
  await lucid.wallet.address()
).paymentCredential?.hash!;

const Datum = Data.Object({
  lock_until: Data.Integer({
    minimum: 0,
  }),
  owner: Data.Bytes(),
});

type Datum = Data.Static<typeof Datum>;

const datum = Data.to<Datum>(
  {
    lock_until: BigInt(Date.now() + 1200000), // lock 20 min
    owner: ownerPublicKeyHash, // our own wallet verification key hash
  },
  Datum
);

// LPTest Token asset ID
// const assetId =
//   'bd798867296ff16aea1b1a15c4d84c88461ee3151d02500fda5881104c5054657374';
// const amount = 1000000n;
const assetId =
  'fa21883f8bed793a4bd4fcc34f876459ff8c5e541e070c48c5f7fbc04c505465737431';
const amount = 1000000n;

const txLock = await lock(assetId, amount, { into: validator, datum: datum });
console.log('Tx Lock Hash: ', txLock);
console.log('1000000 LPTest1 are locked to contract for 20 minutes.');

/*

Tx Lock Hash:  69317c821bfb61a29ff2d6e136dd9e0bbdaf25889a04f268941fc976af68d00e
1000000 LPTest are locked to contract for 20 minutes.

Tx Lock Hash:  42be4c775c70aefc7895c8a3313e822fc75ecff67857b11dfdb817447e5561c1
1000000 LPTest1 are locked to contract for 20 minutes.

*/

// --- Supporting functions

async function readValidator(): Promise<SpendingValidator> {
  const validator = JSON.parse(await Deno.readTextFile('plutus.json'))
    .validators[0];
  return {
    type: 'PlutusV2',
    script: validator.compiledCode,
  };
}

async function lock(
  assetId: string,
  amount: bigint,
  { into, datum }: { into: SpendingValidator; datum: string }
): Promise<TxHash> {
  const contractAddress = lucid.utils.validatorToAddress(into);

  const tx = await lucid
    .newTx()
    .payToContract(
      contractAddress,
      {
        inline: datum,
      },
      {
        [assetId]: amount,
      }
    )
    .complete();

  const signedTx = await tx.sign().complete();

  return signedTx.submit();
}
