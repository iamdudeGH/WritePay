"use client"
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Network } from "@aptos-labs/ts-sdk";

import { aptos } from "@/lib/aptos";

const queryClient = new QueryClient();

export function AptosWalletProvider({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <AptosWalletAdapterProvider
                autoConnect={true}
                dappConfig={{
                    network: Network.TESTNET,
                    aptosApiKeys: {
                        testnet: process.env.NEXT_PUBLIC_APTOS_API_KEY || ""
                    }
                }}
            >
                {children}
            </AptosWalletAdapterProvider>
        </QueryClientProvider>
    );
}

