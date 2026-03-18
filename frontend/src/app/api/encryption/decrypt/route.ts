import { NextResponse } from 'next/server';
import { Aptos, AptosConfig, Network, AccountAddress } from "@aptos-labs/ts-sdk";

const aptosConfig = new AptosConfig({ network: Network.TESTNET });
const aptos = new Aptos(aptosConfig);

export async function POST(request: Request) {
    try {
        const { transactionHash, blobId, readerAddress } = await request.json();

        if (!transactionHash || !blobId || !readerAddress) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // 1. Verify the transaction exists and was successful (with retries for node sync delay)
        let tx: any;
        let retries = 5;
        while (retries > 0) {
            try {
                tx = await aptos.getTransactionByHash({ transactionHash });
                break; // Found it
            } catch (err) {
                retries--;
                if (retries === 0) {
                    console.error("Tx not found after retries:", transactionHash);
                    return NextResponse.json({ error: 'Transaction not found on network' }, { status: 404 });
                }
                await new Promise(r => setTimeout(r, 1000)); // wait 1s and retry
            }
        }

        if (!tx.success) {
            return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 });
        }

        // 2a. Verify the on-chain sender matches the claimed reader address
        // This prevents transaction hash sharing attacks where someone else uses a valid tx hash
        const txSender = tx.sender?.toLowerCase();
        const normalizedReader = AccountAddress.from(readerAddress).toString().toLowerCase();
        if (txSender !== normalizedReader) {
            console.error(`Sender mismatch! txSender=${txSender}, reader=${normalizedReader}`);
            return NextResponse.json({ error: 'Transaction sender does not match requester' }, { status: 403 });
        }

        // 2b. Verify the transaction contains the expected ArticlePurchasedEvent
        const isPurchaseEvent = tx.events?.find((event: any) =>
            event.type.includes("ArticleManagement::ArticlePurchasedEvent") &&
            event.data.shelby_blob_id === blobId &&
            event.data.reader.toLowerCase() === normalizedReader
        );

        if (!isPurchaseEvent) {
            console.error(`Event not found! blobId=${blobId}, normalizedReader=${normalizedReader}, events=${JSON.stringify(tx.events, null, 2)}`);
            return NextResponse.json({ error: 'Payment verification failed' }, { status: 401 });
        }

        // 3. Payment verified — re-derive the key
        const serverSecret = process.env.ENCRYPTION_SECRET_KEY;
        if (!serverSecret) {
            console.error("ENCRYPTION_SECRET_KEY is not set!");
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }

        // 3. Payment verified — re-derive the key using canonical normalization
        const [addr, ...rest] = blobId.split('/');
        const normalizedBlobId = (AccountAddress.from(addr).toString() + '/' + rest.join('/')).toLowerCase();
        console.log(`KMS Decrypt: blobId=${blobId}, normalized=${normalizedBlobId}, secretLen=${serverSecret.length}`);

        const encoder = new TextEncoder();
        const data = encoder.encode(normalizedBlobId + serverSecret);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);

        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hexKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`KMS Decrypt: keyPrefix=${hexKey.substring(0, 8)}...`);

        return NextResponse.json({ success: true, key: hexKey });

    } catch (error) {
        console.error("Key derivation error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
