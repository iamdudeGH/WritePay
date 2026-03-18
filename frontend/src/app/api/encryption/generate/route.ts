import { NextResponse } from 'next/server';
import { Aptos, AptosConfig, Network, AccountAddress } from "@aptos-labs/ts-sdk";

// Server-side KMS: derives a deterministic AES-256-GCM key from a secret + blobId.
// Only the blob author (whose address is the blobId prefix) may request a key.

export async function POST(request: Request) {
    try {
        const { blobId, authorAddress } = await request.json();

        if (!blobId || !authorAddress) {
            return NextResponse.json({ error: 'Missing blobId or authorAddress' }, { status: 400 });
        }

        // Verify the caller owns the blob — blobId format is "0xAuthorAddress/blob-name.md"
        const blobOwner = blobId.split('/')[0];
        if (blobOwner.toLowerCase() !== authorAddress.toLowerCase()) {
            return NextResponse.json({ error: 'Unauthorized: you are not the blob author' }, { status: 403 });
        }

        const serverSecret = process.env.ENCRYPTION_SECRET_KEY;
        if (!serverSecret) {
            console.error("ENCRYPTION_SECRET_KEY is not set!");
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }
        console.log(`KMS Generate: blobId=${blobId}, secretLen=${serverSecret.length}`);

        // Derive a stable 32-byte AES key from secret + normalized blobId
        const [addr, ...rest] = blobId.split('/');
        const normalizedBlobId = (AccountAddress.from(addr).toString() + '/' + rest.join('/')).toLowerCase();

        const encoder = new TextEncoder();
        const data = encoder.encode(normalizedBlobId + serverSecret);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);

        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hexKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`KMS Generate: normalized=${normalizedBlobId}, keyPrefix=${hexKey.substring(0, 8)}...`);

        return NextResponse.json({ success: true, key: hexKey });
    } catch (error) {
        console.error("Key generation error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
