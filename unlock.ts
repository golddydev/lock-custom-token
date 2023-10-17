import {
  Blockfrost,
  Constr,
  Data,
  Lucid,
  SpendingValidator,
  TxHash,
  UTxO,
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

const scriptAddress = lucid.utils.validatorToAddress(validator);

// we get all the UTXOs sitting at the script address
const scriptUtxos = await lucid.utxosAt(scriptAddress);

// datum type
const Datum = Data.Object({
  lock_until: Data.Integer(),
  owner: Data.Bytes(),
});

type Datum = Data.Static<typeof Datum>;

// filter utxo
const ownerPublicKeyHash = lucid.utils.getAddressDetails(
  await lucid.wallet.address()
).paymentCredential?.hash!;
const currentTime = new Date().getTime();

const utxos = scriptUtxos.filter((utxo) => {
  const datum = Data.from(utxo.datum!);
  if (typeof datum === 'object') {
    const realDatum = Data.castFrom<Datum>(datum, Datum);
    console.log(realDatum.owner, realDatum.lock_until);
    return (
      realDatum.owner === ownerPublicKeyHash &&
      realDatum.lock_until <= currentTime
    );
  }
  return false;
});

if (utxos.length > 0) {
  const txUnlock = await unlock(utxos, currentTime, {
    from: validator,
    using: Data.void(),
  });
  console.log('Tx Unlock Hash: ', txUnlock);
  console.log(
    '1000000 LPTest & 1000000 LPTest1 are unlocked from contract after'
  );

  /*
  
Tx Unlock Hash:  9d14fdf6060667583465635f333d0c02068784cf955c04068d58f8b6e1578732
1000000 LPTest & 1000000 LPTest1 are unlocked from contract after

*/
} else {
  console.log('Please wait...');
}

// --- Supporting functions

async function readValidator(): Promise<SpendingValidator> {
  const validator = JSON.parse(await Deno.readTextFile('plutus.json'))
    .validators[0];
  return {
    type: 'PlutusV2',
    script: validator.compiledCode,
  };
}

async function unlock(
  utxos: UTxO[],
  currentTime: number,
  { from, using }: { from: SpendingValidator; using: string }
): Promise<TxHash> {
  const laterTime = new Date(currentTime + 1000 * 180).getTime(); // add 3 min (TTL: time to live)

  const tx = await lucid
    .newTx()
    .collectFrom(utxos, using)
    .addSigner(await lucid.wallet.address())
    .validFrom(currentTime)
    .validTo(laterTime)
    .attachSpendingValidator(from)
    .complete();

  const signedTx = await tx.sign().complete();

  return signedTx.submit();
}
