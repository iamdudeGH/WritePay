import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));
const moduleAddress = "0x41c3da9bb76099d3d6c53b206b944e30caba8d52f978678d376543f9f1590832";

async function main() {
  const indexerResult: any = await aptos.queryIndexer({
    query: {
        query: `query GetContractTxns($addr: String!) {
          account_transactions(
            where: { account_address: { _eq: $addr } }
            order_by: { transaction_version: desc }
            limit: 50
          ) { transaction_version }
        }`,
        variables: { addr: moduleAddress },
    },
  });

  const versions: number[] = (indexerResult?.account_transactions || []).map(
    (row: any) => Number(row.transaction_version)
  );
  
  console.log("Found versions:", versions);
  
  for (const ver of versions) {
    try {
        const tx: any = await aptos.getTransactionByVersion({ ledgerVersion: ver });
        if (tx.events) {
            for (const ev of tx.events) {
                console.log(`Version ${ver} event:`, ev.type, "Data:", JSON.stringify(ev.data));
            }
        }
    } catch (e) {
        console.error(e);
    }
  }
}
main();
