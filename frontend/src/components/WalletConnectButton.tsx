"use client"
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { LogOut, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

export function WalletConnectButton() {
    const { account, connected, connect, disconnect } = useWallet();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        // SSR placeholder
        return (
            <button className="bg-zinc-800 border border-white/20 px-6 py-2 rounded-lg text-white/40 font-bold text-xs tracking-widest uppercase transition-all" aria-hidden>
                INIT_WALLET...
            </button>
        );
    }

    const handleConnect = async () => {
        try {
            /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
            // @ts-ignore
            await connect("Petra");
        } catch (error) {
            console.error(error);
            alert("Failed to connect. Make sure you have the Petra Wallet extension installed.");
        }
    };

    if (connected && account) {
        return (
            <div className="flex items-center gap-3">
                <div className="px-4 py-2 bg-white/5 text-white/90 font-bold border border-white/10 rounded-lg flex items-center gap-2">
                    <Wallet size={16} className="text-[#00ffff]" />
                    <span className="font-mono text-[10px] tracking-widest uppercase">
                        {account?.address?.toString().slice(0, 6)}...{account?.address?.toString().slice(-4)}
                    </span>
                </div>
                <button
                    onClick={() => disconnect()}
                    className="p-2.5 bg-zinc-900 text-white/40 border border-white/10 rounded-lg hover:text-[#ff00ff] hover:border-white/20 transition-all cursor-pointer"
                    title="Disconnect wallet"
                >
                    <LogOut size={18} />
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={handleConnect}
            className="group relative px-6 py-2.5 bg-white text-black font-bold text-xs tracking-[0.2em] uppercase rounded-full hover:bg-[#00ffff] transition-all"
        >
            <span className="relative z-10 flex items-center gap-2">
                CONNECT_WALLET ↗
            </span>
        </button>
    );
}
