import { Aptos, AptosConfig, Network, AccountAddress } from "@aptos-labs/ts-sdk";
import { InputTransactionData } from "@aptos-labs/wallet-adapter-react";

// Initialize Aptos client
const aptosConfig = new AptosConfig({
  network: Network.TESTNET,
  clientConfig: { API_KEY: process.env.NEXT_PUBLIC_APTOS_API_KEY }
});
export const aptos = new Aptos(aptosConfig);

/**
 * Normalizes an Aptos address to its standard 64-character hex format (with 0x).
 */
export function normalizeAddress(addr: string): string {
  try {
    // AccountAddress.from(...) handles short, long, and mixed-case hex formats.
    // .toString() returns the standardized 64-character hex string with 0x prefix.
    return AccountAddress.from(addr).toString().toLowerCase();
  } catch {
    return addr.toLowerCase();
  }
}

// The deployed contract address on Aptos Testnet
export const WRITEPAY_MODULE = "0x7f5dffd01dfd9d78c1814e9bced4d70bd2c27470fef0b5930e3f2a3f1207db53::ArticleManagement";

// Price constants
export const APT_DECIMALS = 8;
export const OCTA_MULTIPLIER = 100_000_000;

export function getPublishPayload(shelbyBlobId: string, title: string, excerpt: string, priceApt: number): InputTransactionData {
  const priceInOctas = Math.round(parseFloat(String(priceApt)) * OCTA_MULTIPLIER);
  console.log("DEBUG: Publishing Article", { 
    priceApt, 
    OCTA_MULTIPLIER, 
    priceInOctas,
    expectedHex: priceInOctas.toString(16)
  });
  return {
    data: {
      function: `${WRITEPAY_MODULE}::publish_article`,
      functionArguments: [shelbyBlobId, title, excerpt, priceInOctas.toString()],
    }
  };
}

export function getPurchasePayload(shelbyBlobId: string, priceApt: number): InputTransactionData {
  const priceInOctas = Math.round(parseFloat(String(priceApt)) * OCTA_MULTIPLIER);
  console.log("DEBUG: Purchasing Article", { 
    priceApt, 
    OCTA_MULTIPLIER, 
    priceInOctas,
    expectedHex: priceInOctas.toString(16)
  });
  return {
    data: {
      function: `${WRITEPAY_MODULE}::purchase_article`,
      functionArguments: [shelbyBlobId, priceInOctas.toString()],
    }
  };
}

export function getDeletePayload(shelbyBlobId: string): InputTransactionData {
  return {
    data: {
      function: `${WRITEPAY_MODULE}::delete_article`,
      functionArguments: [shelbyBlobId],
    }
  };
}

/**
 * Compatibility wrapper to handle transition from V1 to V2 transaction payloads.
 * Detects legacy V1 payloads (with top-level 'function' and 'arguments') and 
 * wraps them into the V2 'data' structure required by newer wallet adapters.
 */
export async function wrapSignAndSubmit(
  originalSignAndSubmit: any,
  payload: any,
  options?: any
) {
  if (payload && payload.function && !payload.data) {
    console.log("Detecting V1 payload, converting to V2 for compatibility...");
    const v2Payload = {
      data: {
        function: payload.function,
        functionArguments: payload.arguments || [],
        typeArguments: payload.type_arguments || [],
      },
      options
    };
    return originalSignAndSubmit(v2Payload);
  }
  return originalSignAndSubmit(payload, options);
}

export interface UserProfile {
  username: string;
  bio: string;
  avatar_url: string;
  updated_at: string;
}

/**
 * Fetches a user's profile from the on-chain ProfileRegistry.
 * Returns null if the user has not set up a profile.
 */
export async function fetchUserProfile(authorAddress: string): Promise<UserProfile | null> {
  try {
    // 1. Get the ProfileRegistry resource from the contract admin address
    const contractAddress = WRITEPAY_MODULE.split("::")[0];
    const registry = await aptos.getAccountResource({
      accountAddress: contractAddress,
      resourceType: `${WRITEPAY_MODULE}::ProfileRegistry`
    });

    // 2. Extract the table handle
    const handle = (registry as any).profiles.handle;

    // 3. Fetch the specific user's profile from the table
    const profile = await aptos.getTableItem<UserProfile>({
      handle,
      data: {
        key_type: "address",
        value_type: `${WRITEPAY_MODULE}::UserProfile`,
        key: authorAddress
      }
    });

    return profile;
  } catch (e) {
    // It's expected to throw if the user hasn't created a profile yet
    return null;
  }
}

export function getFollowPayload(authorAddress: string): InputTransactionData {
  return {
    data: {
      function: `${WRITEPAY_MODULE}::follow_author`,
      functionArguments: [authorAddress],
    }
  };
}

/**
 * Fetches all authors that a given user is following by parsing FollowedEvents.
 */
export async function fetchFollowedAuthors(followerAddress: string): Promise<string[]> {
  try {
    const moduleAddress = WRITEPAY_MODULE.split('::')[0];
    const indexerResult: any = await aptos.queryIndexer({
      query: {
        query: `query GetContractTxns($addr: String!) {
          account_transactions(
            where: { account_address: { _eq: $addr } }
            order_by: { transaction_version: desc }
            limit: 200
          ) { transaction_version }
        }`,
        variables: { addr: moduleAddress },
      },
    });

    const versions: number[] = (indexerResult?.account_transactions || []).map(
      (row: any) => Number(row.transaction_version)
    );

    const followed: string[] = [];
    await Promise.all(
      versions.map(async (ver) => {
        try {
          const tx: any = await aptos.getTransactionByVersion({ ledgerVersion: ver });
          if (tx.events) {
            for (const ev of tx.events) {
              if (ev.type === `${WRITEPAY_MODULE}::FollowedEvent`) {
                if (normalizeAddress(ev.data.follower) === normalizeAddress(followerAddress)) {
                  followed.push(normalizeAddress(ev.data.author));
                }
              }
            }
          }
        } catch {
          // skip failed fetches
        }
      })
    );
    return Array.from(new Set(followed));
  } catch (e) {
    console.error("Failed to fetch followed authors", e);
    return [];
  }
}
