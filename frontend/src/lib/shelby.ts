import { ShelbyClient } from '@shelby-protocol/sdk/browser';
import { Network } from '@aptos-labs/ts-sdk';

// Initialize the Shelby client for decentralized blob storage on Aptos Testnet
const shelbyApiKey = process.env.NEXT_PUBLIC_SHELBY_API_KEY;
if (!shelbyApiKey) {
  console.warn("[WritePay] ⚠️  NEXT_PUBLIC_SHELBY_API_KEY is not set in .env.local — Shelby reads/uploads will fail with 401");
}

export const shelbyClient = new ShelbyClient({
  network: Network.TESTNET,
  apiKey: shelbyApiKey,
});

/**
 * Fetches a blob from the real decentralized Shelby protocol network.
 * @param blobId The fully qualified Shelby blob identifier (e.g. 0x123.../my-file.md)
 * @returns The text content of the blob
 */
export async function fetchFromShelby(blobId: string): Promise<Uint8Array> {
  console.log(`Fetching ${blobId} from Shelby RPC...`);

  // Split the fully qualified blob ID into author account and internal blob path
  const slashIndex = blobId.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(`Invalid blobId format: ${blobId}. Expected account/blobName`);
  }

  const account = blobId.substring(0, slashIndex);
  const blobName = blobId.substring(slashIndex + 1);

  // Fetch from decentralized Cavalier nodes through the DoubleZero network
  const blobObject = await shelbyClient.download({ account, blobName });

  // Read the Web stream of Uint8Array chunks into a single ArrayBuffer array
  const reader = blobObject.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLength += value.length;
    }
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
