import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));
const moduleAddress = "0x41c3da9bb76099d3d6c53b206b944e30caba8d52f978678d376543f9f1590832";

async function main() {
  const publishType = `${moduleAddress}::ArticleManagement::ArticlePublishedEvent`;
  const deleteType = `${moduleAddress}::ArticleManagement::ArticleDeletedEvent`;

  const indexerResult: any = await aptos.queryIndexer({
    query: {
        query: `query GetEvents($publishType: String!, $deleteType: String!) {
          events(
            where: { type: { _in: [$publishType, $deleteType] } }
            order_by: { transaction_version: desc }
            limit: 100
          ) {
            type
            data
            transaction_version
          }
        }`,
        variables: { publishType, deleteType },
    },
  });

  console.log("Events found:", indexerResult?.events?.length);
  for (const ev of indexerResult?.events || []) {
      console.log(ev.type, ev.data);
  }
}
main();
