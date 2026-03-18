"use client"
import { useState, useEffect } from 'react';
import { User, Image as ImageIcon, CheckCircle2, Loader2, ArrowLeft, Terminal, ShieldCheck, Trash2 } from 'lucide-react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { aptos, WRITEPAY_MODULE, wrapSignAndSubmit, fetchUserProfile, normalizeAddress, fetchFollowedAuthors, getDeletePayload, OCTA_MULTIPLIER } from '@/lib/aptos';
import { useRef, useMemo } from 'react';

export default function ProfileSettings() {
    const { account, signAndSubmitTransaction } = useWallet();
    const [username, setUsername] = useState('');
    const [bio, setBio] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [initialProfile, setInitialProfile] = useState<{username: string, bio: string, avatarUrl: string} | null>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const [userArticles, setUserArticles] = useState<any[]>([]);
    const [loadingArticles, setLoadingArticles] = useState(false);
    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        async function loadProfile() {
            if (!account) {
                setLoading(false);
                return;
            }
            try {
                const profile = await fetchUserProfile(account.address.toString());
                if (profile) {
                    setUsername(profile.username);
                    setBio(profile.bio);
                    setAvatarUrl(profile.avatar_url);
                    setInitialProfile({
                        username: profile.username,
                        bio: profile.bio,
                        avatarUrl: profile.avatar_url
                    });
                } else {
                    setInitialProfile({ username: '', bio: '', avatarUrl: '' });
                }
            } catch (e) {
                console.warn("Could not load existing profile", e);
                setInitialProfile({ username: '', bio: '', avatarUrl: '' });
            } finally {
                setLoading(false);
            }
        }

        async function loadSocialAndArticles() {
            if (!account) return;
            const addr = account.address.toString();
            setLoadingArticles(true);
            try {
                // Fetch articles by author
                const moduleAddress = WRITEPAY_MODULE.split('::')[0];
                const res: any = await aptos.queryIndexer({
                    query: {
                        query: `query GetAuthorArticles($addr: String!) {
                            account_transactions(
                                where: { account_address: { _eq: $addr } }
                                order_by: { transaction_version: desc }
                            ) { transaction_version }
                        }`,
                        variables: { addr: moduleAddress },
                    },
                });

                const versions: number[] = (res?.account_transactions || []).map((r: any) => Number(r.transaction_version));
                const myArticles: any[] = [];
                const deletedBlobIds = new Set<string>();

                // Fetch deleted events
                try {
                    const structType = `${moduleAddress}::ArticleManagement::PlatformState`;
                    const der = await fetch(`https://api.testnet.aptoslabs.com/v1/accounts/${moduleAddress}/events/${structType}/article_deleted_events`);
                    if (der.ok) {
                        const data = await der.json();
                        data.forEach((ev: any) => deletedBlobIds.add(ev.data.shelby_blob_id));
                    }
                } catch {}

                // Mocking article fetch logic similar to ReaderView but filtered for current user
                await Promise.all(versions.map(async (v) => {
                    const tx: any = await aptos.getTransactionByVersion({ ledgerVersion: v });
                    (tx.events || []).forEach((ev: any) => {
                        if (ev.type === `${WRITEPAY_MODULE}::ArticlePublishedEvent` && normalizeAddress(ev.data.author) === normalizeAddress(addr)) {
                            if (!deletedBlobIds.has(ev.data.shelby_blob_id)) {
                                myArticles.push({
                                    id: ev.data.shelby_blob_id,
                                    title: ev.data.title,
                                    price: parseFloat((parseInt(ev.data.price) / OCTA_MULTIPLIER).toFixed(8)),
                                    date: new Date(parseInt(ev.data.timestamp) / 1000).toLocaleString()
                                });
                            }
                        }
                    });
                }));
                setUserArticles(myArticles);

                // Load Following count
                const followed = await fetchFollowedAuthors(addr);
                setFollowingCount(followed.length);

                // Load Followers count (Query Indexer for FollowedEvent where author is current user)
                const followRes: any = await aptos.queryIndexer({
                    query: {
                        query: `query GetFollowers($addr: String!) {
                            account_transactions(
                                where: { account_address: { _eq: $addr } }
                                order_by: { transaction_version: desc }
                            ) { transaction_version }
                        }`,
                        variables: { addr: moduleAddress },
                    },
                });
                const fVersions = (followRes?.account_transactions || []).map((r: any) => Number(r.transaction_version));
                const uniqueFollowers = new Set<string>();
                await Promise.all(fVersions.map(async (v: number) => {
                    const tx: any = await aptos.getTransactionByVersion({ ledgerVersion: v });
                    (tx.events || []).forEach((ev: any) => {
                        if (ev.type === `${WRITEPAY_MODULE}::FollowedEvent` && normalizeAddress(ev.data.author) === normalizeAddress(addr)) {
                            uniqueFollowers.add(normalizeAddress(ev.data.follower));
                        }
                    });
                }));
                setFollowersCount(uniqueFollowers.size);

            } catch (err) {
                console.error("Failed to load user data", err);
            } finally {
                setLoadingArticles(false);
            }
        }

        loadProfile();
        loadSocialAndArticles();
    }, [account]);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !account) return;

        setUploadingAvatar(true);
        try {
            // Compress and resize image locally for direct on-chain save
            const reader = new FileReader();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                 reader.onload = (ev) => {
                    const tempImg = new Image();
                    tempImg.src = ev.target?.result as string;
                    tempImg.onload = async () => {
                        const canvas = document.createElement('canvas');
                        // Resize to a very small square (120x120) to keep base64 tiny
                        let width = tempImg.width;
                        let height = tempImg.height;
                        const MAX_DIMENSION = 120;

                        if (width > height) {
                          if (width > MAX_DIMENSION) {
                            height = Math.round((height * MAX_DIMENSION) / width);
                            width = MAX_DIMENSION;
                          }
                        } else {
                          if (height > MAX_DIMENSION) {
                            width = Math.round((width * MAX_DIMENSION) / height);
                            height = MAX_DIMENSION;
                          }
                        }

                        canvas.width = MAX_DIMENSION;
                        canvas.height = MAX_DIMENSION;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                             const hRatio = canvas.width / tempImg.width;
                             const vRatio = canvas.height / tempImg.height;
                             const ratio = Math.max(hRatio, vRatio);
                             const centerShift_x = (canvas.width - tempImg.width * ratio) / 2;
                             const centerShift_y = (canvas.height - tempImg.height * ratio) / 2;
                             ctx.clearRect(0,0,canvas.width, canvas.height);
                             ctx.drawImage(tempImg, 0,0, tempImg.width, tempImg.height,
                                          centerShift_x,centerShift_y,tempImg.width*ratio, tempImg.height*ratio);

                            // Export as base64 string for direct on-chain save
                            resolve(canvas.toDataURL('image/jpeg', 0.6));
                        } else {
                            reject("Canvas context missing");
                        }
                    };
                };
                reader.readAsDataURL(file);
            });

            setAvatarUrl(dataUrl);
        } catch (error) {
            console.error("Avatar processing failed:", error);
            alert("Failed to process avatar.");
        } finally {
            setUploadingAvatar(false);
            if(fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!account) {
            alert("Please connect your wallet first.");
            return;
        }

        setSaving(true);
        setSaved(false);

        try {
            const payload = {
                data: {
                    function: `${WRITEPAY_MODULE}::update_profile`,
                    functionArguments: [username, bio, avatarUrl],
                }
            };

            const response: any = await wrapSignAndSubmit(
                signAndSubmitTransaction,
                payload
            );

            let txSucceeded = false;
            for (let i = 0; i < 30; i++) {
                try {
                    const tx: any = await aptos.getTransactionByHash({ transactionHash: response.hash });
                    if (tx.success) {
                        txSucceeded = true;
                        break;
                    } else if (tx.type !== "pending_transaction") {
                        throw new Error("Transaction failed on-chain: " + tx.vm_status);
                    }
                } catch (e: any) {
                    if (e.message?.includes("not found")) {
                    } else {
                        throw e;
                    }
                }
                await new Promise(r => setTimeout(r, 1500));
            }

            if (!txSucceeded) throw new Error("Transaction confirmation timed out");

            setInitialProfile({ username, bio, avatarUrl });
            setSaved(true);
            setTimeout(() => setSaved(false), 5000);

        } catch (error) {
            console.error(error);
            alert("Failed to save profile.");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteArticle = async (articleId: string) => {
        if (!confirm('Permanently delete this article from the blockchain?')) return;
        try {
            const payload = getDeletePayload(articleId);
            const response: any = await wrapSignAndSubmit(signAndSubmitTransaction, payload);
            alert("Deletion transaction submitted. This might take a few seconds to reflect.");
            setUserArticles(prev => prev.filter(a => a.id !== articleId));
        } catch (err) {
            console.error(err);
            alert("Failed to delete article.");
        }
    };

    if (loading) {
        return (
            <div className="w-full min-h-screen bg-black flex items-center justify-center p-20">
                <div className="bg-white/5 border border-white/10 p-16 rounded-3xl backdrop-blur-xl relative overflow-hidden">
                    <Loader2 className="animate-spin text-[#00ffff] mx-auto" size={48} />
                    <p className="mt-8 text-white/40 font-bold uppercase tracking-[0.5em] text-xs text-center">Loading Profile</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-h-screen bg-black text-white selection:bg-[#00ffff] selection:text-black">
            <div className="w-full flex flex-col pt-20">
                
                {/* Header */}
                <div className="flex items-center bg-black/50 backdrop-blur-md px-8 py-6 border-b border-white/10 justify-between w-full z-30">
                    <button onClick={() => window.location.href = '/'} className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black hover:bg-[#ff00ff] hover:text-white transition-all cursor-pointer">
                        <ArrowLeft size={20} />
                    </button>
                    <h2 className="text-white text-lg font-bold tracking-[0.2em] flex-1 text-center uppercase">Profile Settings</h2>
                    <div className="h-12 w-12"></div>
                </div>

                <div className="flex flex-col lg:flex-row mt-6">
                    
                    {/* Left Side: Identity Card */}
                    <section className="flex-1 flex flex-col p-8 lg:p-20 relative">
                        <div className="max-w-md mx-auto w-full">
                            <h2 className="text-[#00ffff] text-[10px] font-bold tracking-[0.5em] mb-12 uppercase opacity-50">Identity Profile</h2>
                            
                            <div className="border border-white/10 p-10 bg-white/5 rounded-3xl backdrop-blur-sm mb-12 group transition-all relative">
                                <div 
                                    className="aspect-square w-32 md:w-40 border border-white/20 rounded-2xl mb-8 relative overflow-hidden transition-all shadow-2xl cursor-pointer group/avatar"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {uploadingAvatar ? (
                                        <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center text-[#00ffff]">
                                            <Loader2 size={24} className="animate-spin mb-2" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Uploading</span>
                                        </div>
                                    ) : avatarUrl ? (
                                        <>
                                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                                <ImageIcon size={24} className="text-white" />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="w-full h-full bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center text-xs font-bold text-white/10 hover:text-white uppercase transition-colors text-center p-4">
                                            Upload Image
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleAvatarUpload}
                                    accept="image/*"
                                    className="hidden"
                                />
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center py-2 px-4 bg-black/20 rounded-xl border border-white/5">
                                        <div className="text-center flex-1 border-r border-white/10">
                                            <p className="text-[#00ffff] text-xl font-black">{followersCount}</p>
                                            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Followers</p>
                                        </div>
                                        <div className="text-center flex-1">
                                            <p className="text-[#ff00ff] text-xl font-black">{followingCount}</p>
                                            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Following</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-end border-b border-white/5 pb-3">
                                        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Username</span>
                                        <span className="font-bold text-white uppercase tracking-wider truncate">{username || 'Anonymous'}</span>
                                    </div>
                                    <div className="flex justify-between items-end border-b border-white/5 pb-3">
                                        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Network</span>
                                        <span className="font-bold text-[#00ffff] uppercase tracking-wider truncate ml-4">
                                            {account ? `${account.address.toString().slice(0, 6)}...${account.address.toString().slice(-4)}` : 'Offline'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[10px] text-white/20 font-bold uppercase text-center leading-relaxed tracking-widest">
                                Shelby Network Identity Profile <br/>
                                Verified via Aptos Protocol
                            </p>
                        </div>
                    </section>

                    {/* Right Side: Identity Update Form */}
                    <section className="flex-[1.5] flex flex-col bg-transparent lg:border-l border-white/10">
                        <div className="p-12 lg:p-20">
                            <div className="mb-12">
                                <h2 className="text-white text-4xl lg:text-6xl font-bold tracking-tight mb-4">Edit Profile</h2>
                                <p className="text-white/40 text-lg">Update your on-chain author credentials.</p>
                            </div>
                            
                            <form onSubmit={handleSave} className="flex flex-col gap-10 max-w-2xl mb-24">
                                <div className="flex flex-col gap-3">
                                    <label className="text-white/40 text-[10px] font-bold tracking-[0.3em] uppercase">Username</label>
                                    <input 
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl text-white text-2xl font-bold p-6 focus:border-[#00ffff] placeholder:text-white/5 outline-none transition-all" 
                                        placeholder="Display Name" 
                                        type="text" 
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="flex flex-col gap-3">
                                    <label className="text-white/40 text-[10px] font-bold tracking-[0.3em] uppercase">Biography</label>
                                    <textarea 
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl text-white text-lg font-medium p-6 focus:border-[#00ffff] placeholder:text-white/5 outline-none transition-all resize-none" 
                                        placeholder="Tell the network about yourself..." 
                                        rows={4}
                                        value={bio}
                                        onChange={(e) => setBio(e.target.value)}
                                    />
                                </div>

                                <div className="pt-8 space-y-4">
                                    {initialProfile && (username !== initialProfile.username || bio !== initialProfile.bio || avatarUrl !== initialProfile.avatarUrl) && (
                                        <div className="bg-[#ff00ff]/10 border border-[#ff00ff]/30 text-[#ff00ff] p-4 text-center rounded-2xl font-bold uppercase tracking-widest text-[10px] animate-pulse">
                                            Unsaved Changes: Click Update Identity below to save to blockchain
                                        </div>
                                    )}
                                    <button 
                                        type="submit"
                                        disabled={saving || !account}
                                        className="w-full bg-white text-black font-bold py-8 px-8 rounded-full hover:bg-[#00ffff] transition-all disabled:opacity-20 flex items-center justify-center gap-4 text-sm uppercase tracking-widest shadow-2xl"
                                    >
                                        {saving ? (
                                            <>
                                                <Loader2 size={20} className="animate-spin" />
                                                Persisting...
                                            </>
                                        ) : (
                                            <>Update Identity ↗</>
                                        )}
                                    </button>
                                    {saved && (
                                        <p className="mt-6 text-center text-[#00ffff] text-xs font-bold uppercase tracking-widest animate-pulse">
                                            Identity Updated Successfully
                                        </p>
                                    )}
                                </div>
                            </form>

                            {/* My Articles Section */}
                            <div className="max-w-4xl">
                                <h3 className="text-2xl font-bold uppercase tracking-tight text-white mb-8 flex items-center gap-4">
                                    My Published Entries
                                    <span className="text-[10px] px-3 py-1 bg-white/5 rounded-full text-white/40">{userArticles.length}</span>
                                </h3>

                                <div className="space-y-4">
                                    {loadingArticles ? (
                                        <div className="flex items-center gap-3 text-white/20 uppercase tracking-[0.3em] text-[10px] font-bold">
                                            <Loader2 size={16} className="animate-spin" />
                                            Scanning Archive...
                                        </div>
                                    ) : userArticles.length === 0 ? (
                                        <div className="p-12 border border-dashed border-white/10 rounded-3xl text-center">
                                            <p className="text-white/20 uppercase tracking-[0.2em] font-bold text-[10px]">No articles detected in your archive</p>
                                        </div>
                                    ) : (
                                        userArticles.map((article) => (
                                            <div key={article.id} className="group bg-white/5 border border-white/10 p-6 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] transition-all">
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-lg text-white group-hover:text-[#00ffff] transition-colors">{article.title}</h4>
                                                    <div className="flex gap-4 mt-1 text-[9px] font-bold uppercase tracking-widest text-white/30">
                                                        <span>{article.date.split(',')[0]}</span>
                                                        <span>{article.price} APT</span>
                                                        <span className="text-white/10">{article.id.slice(0, 12)}...</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <button 
                                                        onClick={() => window.location.href = `/?blob=${article.id}`} 
                                                        className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white hover:text-black transition-all"
                                                    >
                                                        <ArrowLeft size={16} className="rotate-180" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteArticle(article.id)}
                                                        className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <footer className="w-full border-t border-white/10 bg-black p-6 flex justify-between items-center text-[9px] font-bold uppercase tracking-[0.4em] text-white/20">
                    <span>Aptos Identification Management</span>
                    <span>System Ready</span>
                </footer>
            </div>
        </div>
    );
}
