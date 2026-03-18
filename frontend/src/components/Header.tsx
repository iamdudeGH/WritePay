"use client";
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, Terminal as TerminalIcon, Wallet } from 'lucide-react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { fetchUserProfile, UserProfile } from '@/lib/aptos';
import { WalletConnectButton } from './WalletConnectButton';

export default function Header() {
    const { account } = useWallet();
    const pathname = usePathname();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        async function loadIdentity() {
            if (!account) {
                setProfile(null);
                return;
            }
            try {
                const p = await fetchUserProfile(account.address.toString());
                setProfile(p);
            } catch (e) { /* ignore */ }
        }
        loadIdentity();
    }, [account]);

    const navItems = [
        { name: 'Read', path: '/', alias: ['/read'] },
        { name: 'Write', path: '/write', alias: [] },
        { name: 'Identity', path: '/profile', alias: [] },
    ];

    const isActive = (item: typeof navItems[0]) => {
        return pathname === item.path || item.alias.includes(pathname);
    };

    return (
        <header className="w-full border-b-2 border-white/20 flex items-stretch h-20 md:h-24 bg-black sticky top-0 z-[100] backdrop-blur-md">
            {/* Logo Section */}
            <div 
                onClick={() => window.location.href = '/'}
                className="flex items-center px-6 md:px-10 border-r-2 border-white/20 text-white cursor-pointer hover:text-[#00ffff] transition-colors group"
            >
                <TerminalIcon size={28} className="group-hover:rotate-12 transition-transform" />
                <h1 className="ml-4 text-xl md:text-2xl font-bold tracking-tight uppercase hidden sm:block">WritePay</h1>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex flex-1 items-stretch">
                {navItems.map((item) => (
                    <button 
                        key={item.name}
                        onClick={() => window.location.href = item.path}
                        className={`flex items-center px-8 border-r-2 border-white/10 transition-all text-sm font-bold uppercase tracking-widest ${
                            isActive(item) 
                            ? 'bg-white/5 text-[#00ffff]' 
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        {item.name}
                    </button>
                ))}
            </nav>

            {/* Right Section: Profile & Wallet */}
            <div className="flex items-center justify-end px-4 md:px-8 gap-6 ml-auto">
                {profile && (
                    <div className="hidden sm:flex items-center gap-3 p-1.5 bg-white/5 border border-white/20 rounded-lg">
                        {profile.avatar_url && (
                            <img src={profile.avatar_url} alt="" className="w-6 h-6 object-cover rounded-md" />
                        )}
                        <span className="font-bold text-[10px] tracking-widest uppercase text-white/80">{profile.username}</span>
                    </div>
                )}
                <div className="scale-90 md:scale-100">
                    <WalletConnectButton />
                </div>

                {/* Mobile Menu Toggle */}
                <button 
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="lg:hidden p-2 text-white border-2 border-white/20 rounded-lg hover:bg-white/5 transition-colors"
                >
                    {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
                </button>
            </div>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 top-20 md:top-24 bg-black z-[90] flex flex-col p-8 border-t-2 border-white/20 lg:hidden animate-in fade-in slide-in-from-top-4 duration-300">
                    {navItems.map((item) => (
                        <button 
                            key={item.name}
                            onClick={() => {
                                window.location.href = item.path;
                                setMobileMenuOpen(false);
                            }}
                            className={`w-full text-left p-6 border-2 border-white/10 mb-4 rounded-xl text-2xl font-bold uppercase tracking-tight transition-all ${
                                isActive(item) ? 'bg-[#00ffff] text-black border-[#00ffff]' : 'bg-black text-white hover:bg-white/5'
                            }`}
                        >
                            {item.name}
                        </button>
                    ))}
                    <div className="mt-auto p-6 border border-white/10 rounded-xl text-center">
                        <p className="text-white/40 font-mono text-[10px] uppercase tracking-[0.3em]">WritePay Protocol</p>
                    </div>
                </div>
            )}
        </header>
    );
}
