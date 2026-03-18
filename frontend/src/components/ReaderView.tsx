"use client"
import { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, FileText, ArrowRight, BookOpen, Clock, Loader2, Search, ShieldCheck, X, Sparkles, Library, CheckCircle2, Trash2 } from 'lucide-react';
import { getPurchasePayload, getDeletePayload, aptos, normalizeAddress, WRITEPAY_MODULE, wrapSignAndSubmit, fetchUserProfile, UserProfile, fetchFollowedAuthors, getFollowPayload, OCTA_MULTIPLIER } from '@/lib/aptos';
import { fetchFromShelby } from '@/lib/shelby';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import ReactMarkdown from 'react-markdown';

// ── HTML Sanitizer — strip dangerous tags/attributes to prevent XSS ──
const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'i', 'u', 'em', 'strong', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  'hr', 'img', 'span', 'div', 'sub', 'sup', 'table', 'thead', 'tbody',
  'tr', 'th', 'td',
]);
const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'class', 'style', 'target', 'rel']);

function sanitizeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  function walk(node: Node) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        // Strip script, iframe, object, embed, form, and any unknown tags
        if (!ALLOWED_TAGS.has(tag)) {
          el.remove();
          continue;
        }
        // Strip dangerous attributes (event handlers etc.)
        for (const attr of Array.from(el.attributes)) {
          if (!ALLOWED_ATTRS.has(attr.name.toLowerCase()) || attr.name.startsWith('on')) {
            el.removeAttribute(attr.name);
          }
        }
        // Sanitize href to prevent javascript: URLs
        if (el.hasAttribute('href')) {
          const href = el.getAttribute('href') || '';
          if (href.trim().toLowerCase().startsWith('javascript:')) {
            el.setAttribute('href', '#');
          }
        }
        walk(el);
      }
    }
  }

  walk(doc.body);
  return doc.body.innerHTML;
}

interface Article {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  authorProfile?: UserProfile | null;
  price: number;
  readTime: string;
  date: string;
}

export default function ReaderView() {
  const { account, signAndSubmitTransaction } = useWallet();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [unlockedContent, setUnlockedContent] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Social Features
  const [feedMode, setFeedMode] = useState<'trending' | 'following' | 'library'>('trending');
  const [followedAuthors, setFollowedAuthors] = useState<string[]>([]);
  const [followingAuthor, setFollowingAuthor] = useState(false);

  // Purchase Cache
  const PURCHASE_CACHE_KEY = 'writepay_purchases';

  const getPurchaseCache = useCallback((): Record<string, string> => {
    try {
      const raw = localStorage.getItem(PURCHASE_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }, []);

  const cachePurchase = useCallback((blobId: string, content: string) => {
    try {
      const cache = getPurchaseCache();
      cache[blobId] = content;
      localStorage.setItem(PURCHASE_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.warn('Failed to cache purchase:', e);
    }
  }, [getPurchaseCache]);

  const getCachedContent = useCallback((blobId: string): string | null => {
    return getPurchaseCache()[blobId] || null;
  }, [getPurchaseCache]);

  const [authorFollowers, setAuthorFollowers] = useState(0);

  const isPurchased = useCallback((blobId: string): boolean => {
    return !!getPurchaseCache()[blobId];
  }, [getPurchaseCache]);

  useEffect(() => {
    async function loadFollows() {
      if (account) {
        const followed = await fetchFollowedAuthors(account.address.toString());
        setFollowedAuthors(followed);
      }
    }
    loadFollows();
  }, [account]);

  useEffect(() => {
    async function loadAuthorMetrics(authorAddr: string) {
      if (!authorAddr) return;
      // Fetch follower count for author
      try {
        const moduleAddress = WRITEPAY_MODULE.split('::')[0];
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
          try {
            const tx: any = await aptos.getTransactionByVersion({ ledgerVersion: v });
            (tx.events || []).forEach((ev: any) => {
              if (ev.type === `${WRITEPAY_MODULE}::FollowedEvent` && normalizeAddress(ev.data.author) === normalizeAddress(authorAddr)) {
                uniqueFollowers.add(normalizeAddress(ev.data.follower));
              }
            });
          } catch {
            // skip failed fetches
          }
        }));
        setAuthorFollowers(uniqueFollowers.size);
      } catch (err) {
        console.warn("Failed to load author metrics", err);
      }
    }

    if (selectedArticle?.author) {
      loadAuthorMetrics(selectedArticle.author);
    } else {
      setAuthorFollowers(0); // Reset when no article is selected
    }
  }, [selectedArticle]);

  // Load cached purchase content when selecting an article
  useEffect(() => {
    if (selectedArticle && !unlockedContent) {
      const cached = getCachedContent(selectedArticle.id);
      if (cached) {
        setUnlockedContent(cached);
      }
    }
  }, [selectedArticle, unlockedContent, getCachedContent]);

  useEffect(() => {
    async function fetchArticles() {
      try {
        const moduleAddress = WRITEPAY_MODULE.split('::')[0];
        const eventType = `${moduleAddress}::ArticleManagement::ArticlePublishedEvent`;

        // 1. Fetch published events from transactions (because user wallets emit them)
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

        const publishEvents: any[] = [];
        await Promise.all(
          versions.map(async (ver) => {
            try {
              const tx: any = await aptos.getTransactionByVersion({ ledgerVersion: ver });
              if (tx.events) {
                for (const ev of tx.events) {
                  if (ev.type === eventType) {
                    publishEvents.push(ev);
                  }
                }
              }
            } catch {
              // skip failed fetches
            }
          })
        );

        // 2. Fetch deleted events directly from the contract's EventHandle
        const deletedBlobIds = new Set<string>();
        try {
          const structType = `${moduleAddress}::ArticleManagement::PlatformState`;
          const handleField = "article_deleted_events";
          const res = await fetch(`https://api.testnet.aptoslabs.com/v1/accounts/${moduleAddress}/events/${structType}/${handleField}`);
          
          if (res.ok) {
            const deleteEvents = await res.json();
            for (const ev of (deleteEvents || [])) {
              if (ev.data && ev.data.shelby_blob_id) {
                deletedBlobIds.add(ev.data.shelby_blob_id);
              }
            }
          }
        } catch (err) {
          console.warn("Could not fetch delete events", err);
        }
        
        console.log("Fetched Publish Events:", publishEvents.length);
        console.log("Fetched Deleted Blob IDs:", Array.from(deletedBlobIds));

        // Deduplicate articles by shelby_blob_id using a Map (latest event wins), filtering out deleted ones
        const articleMap = new Map<string, Article>();
        for (const ev of publishEvents) {
          if (!deletedBlobIds.has(ev.data.shelby_blob_id)) {
            console.log("DEBUG: Article from chain", { id: ev.data.shelby_blob_id, rawPrice: ev.data.price, normalizedPrice: parseInt(ev.data.price) / OCTA_MULTIPLIER });
            articleMap.set(ev.data.shelby_blob_id, {
              id: ev.data.shelby_blob_id,
              title: ev.data.title,
              excerpt: ev.data.excerpt,
              author: ev.data.author,
              price: parseFloat((parseInt(ev.data.price) / OCTA_MULTIPLIER).toFixed(8)),
              readTime: "Read full",
              date: new Date(parseInt(ev.data.timestamp) / 1000).toLocaleString()
            });
          }
        }
        const onchainArticles: Article[] = Array.from(articleMap.values()).reverse();

        // Step 3: Fetch profiles for each author
        const articlesWithProfiles = await Promise.all(onchainArticles.map(async (article) => {
          const profile = await fetchUserProfile(article.author);
          return {
            ...article,
            authorProfile: profile
          };
        }));

        setArticles(articlesWithProfiles);
      } catch (e) {
        console.error("Failed to fetch events from Aptos Indexer", e);
        setArticles([]);
      } finally {
        setLoading(false);
      }
    }
    fetchArticles();
  }, []);

  const handlePurchase = async () => {
    if (!account) {
      alert("Please connect your wallet to purchase this article.");
      return;
    }

    setPurchasing(true);
    try {
      if (!selectedArticle) return;

      console.log("Submitting transaction (Standard Mode)...");
      const payload = getPurchasePayload(selectedArticle.id, selectedArticle.price);

      const response: any = await wrapSignAndSubmit(
        signAndSubmitTransaction,
        payload
      );

      console.log("Transaction submitted. ID:", response.hash);

      // Poll for transaction confirmation using the SDK client
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
            // still pending
          } else {
            throw e;
          }
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      if (!txSucceeded) throw new Error("Transaction confirmation timed out after 45 seconds");
      console.log("Purchase confirmed!");

      // 2. Fetch the ENCRYPTED content from the decentralized Shelby network
      console.log("Fetching ciphertext from Shelby for blob:", selectedArticle.id);
      const encryptedContent = await fetchFromShelby(selectedArticle.id);

      // 3. Request the decryption key from the Server KMS, verifying the transaction hash
      console.log("Verifying payment and requesting decryption key for tx:", response.hash);
      const keyRes = await fetch('/api/encryption/decrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionHash: response.hash,
          blobId: selectedArticle.id,
          readerAddress: normalizeAddress(account.address.toString())
        })
      });

      if (!keyRes.ok) throw new Error("Payment verification failed or key denied.");
      const { key: hexKey } = await keyRes.json();

      // 4. Decrypt the content natively in WebCrypto
      const keyBytes = new Uint8Array(hexKey.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
      console.log("Key bytes length:", keyBytes.length, "Key prefix:", hexKey.substring(0, 16));

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      // Extract the 12-byte IV prepended to the ciphertext
      console.log("Encrypted content total length:", encryptedContent.length);

      // Debug: show first 40 bytes of raw data as hex to verify it looks like IV + ciphertext
      const first40 = Array.from(encryptedContent.subarray(0, Math.min(40, encryptedContent.length)))
        .map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log("First 40 bytes (hex):", first40);
      console.log("BlobId used for decrypt:", selectedArticle.id);

      // Sanity check: encrypted content should be at least 12 (IV) + 16 (GCM tag) = 28 bytes
      if (encryptedContent.length < 28) {
        throw new Error(`Downloaded blob is too small (${encryptedContent.length} bytes). Data may be corrupted or unencrypted.`);
      }

      // WebCrypto requires strict buffer alignment. 
      const ivBuffer = new ArrayBuffer(12);
      const ivView = new Uint8Array(ivBuffer);
      ivView.set(encryptedContent.subarray(0, 12));

      const cipherBuffer = new ArrayBuffer(encryptedContent.length - 12);
      const cipherView = new Uint8Array(cipherBuffer);
      cipherView.set(encryptedContent.subarray(12));

      console.log("Extracted IV length:", ivView.length);
      console.log("Ciphertext (+tag) length:", cipherView.length);

      try {
        console.log("Decryption attempt with normalized buffers...");
        const decryptedBuffer = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: ivView,
            tagLength: 128
          },
          cryptoKey,
          cipherView
        );

        const decryptedContent = new TextDecoder().decode(decryptedBuffer);
        console.log("Decryption successful!");
        // Cache the decrypted content so user can re-read without re-paying
        cachePurchase(selectedArticle.id, decryptedContent);
        setUnlockedContent(decryptedContent);
      } catch (decryptErr) {
        console.error("AES-GCM Decrypt failed. This means either:");
        console.error("  1. The encryption key is different from the decryption key");
        console.error("  2. The blob data on Shelby is different from what was uploaded");
        console.error("  3. The blob data is not encrypted (plain text was uploaded)");
        // Try to decode as plain text to check if blob is unencrypted
        try {
          const asText = new TextDecoder().decode(encryptedContent);
          if (asText.length > 0 && /^[\x20-\x7E\n\r\t]/.test(asText.substring(0, 100))) {
            console.warn("DETECTED: Blob appears to be plain text, not encrypted!", asText.substring(0, 200));
            // The blob was uploaded without encryption — just use it directly
            cachePurchase(selectedArticle.id, asText);
            setUnlockedContent(asText);
            return;
          }
        } catch { /* ignore */ }
        throw decryptErr;
      }
    } catch (err) {
      console.error(err);
      alert("Failed to complete purchase.");
    } finally {
      setPurchasing(false);
    }
  }

  const handleFollow = async () => {
    if (!account) {
      alert("Please connect your wallet to follow authors.");
      return;
    }
    if (!selectedArticle) return;

    setFollowingAuthor(true);
    try {
      console.log("Submitting follow transaction...");
      const payload = getFollowPayload(selectedArticle.author);
      const response: any = await wrapSignAndSubmit(signAndSubmitTransaction, payload);

      // Poll for transaction confirmation using the SDK client
      let txSucceeded = false;
      for (let i = 0; i < 30; i++) {
        try {
          const tx: any = await aptos.getTransactionByHash({ transactionHash: response.hash });
          if (tx.success) {
            txSucceeded = true;
            break;
          } else if (tx.type !== "pending_transaction") {
            throw new Error("Transaction failed on-chain");
          }
        } catch (e: any) {
          if (e.message?.includes("not found")) {
            // still pending
          } else {
            throw e;
          }
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      if (!txSucceeded) throw new Error("Timeout");

      // Optimistically update UI
      setFollowedAuthors(prev => [...prev, normalizeAddress(selectedArticle.author)]);
      setAuthorFollowers(prev => prev + 1); // Optimistically update follower count
    } catch (err) {
      console.error(err);
      alert("Failed to follow author.");
    } finally {
      setFollowingAuthor(false);
    }
  };


  const handleDelete = async (articleId: string) => {
    if (!confirm('Are you sure you want to delete this article? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const payload = getDeletePayload(articleId);
      const response: any = await wrapSignAndSubmit(signAndSubmitTransaction, payload);
      let txConfirmed = false;
      for (let i = 0; i < 30; i++) {
        try {
          const tx: any = await aptos.getTransactionByHash({ transactionHash: response.hash });
          if (tx && tx.success) { txConfirmed = true; break; }
        } catch { /* not confirmed yet */ }
        await new Promise(r => setTimeout(r, 1500));
      }
      if (txConfirmed) {
        setArticles(prev => prev.filter(a => a.id !== articleId));
        if (selectedArticle?.id === articleId) {
          setSelectedArticle(null);
          setUnlockedContent(null);
        }
        alert('Article deleted successfully!');
      } else {
        alert('Transaction timed out. Please check the explorer.');
      }
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete article.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Single return with conditional rendering (prevents hooks violation) ──
  // ── Discovery Feed ──
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);


  return (
    <div className="font-sans bg-black text-white min-h-screen">
      {/* ── Unlocked article view (after successful purchase + decryption) ── */}
      {unlockedContent && selectedArticle ? (
        <article className="w-full min-h-screen bg-black text-white p-8 md:p-12 lg:p-24 flex flex-col pt-32">
          <div className="max-w-4xl mx-auto w-full">
            <button
              onClick={() => { setSelectedArticle(null); setUnlockedContent(null); }}
              className="text-white/30 font-bold uppercase tracking-[0.3em] mb-16 flex items-center gap-3 hover:text-[#00ffff] transition-all cursor-pointer group w-max text-[10px]"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Return to Feed
            </button>
            
            <header className="mb-16 border-b border-white/10 pb-12">
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black uppercase leading-[0.9] tracking-tighter mb-10 text-white">
                {selectedArticle.title}
              </h1>
              <div className="flex flex-wrap gap-8 font-bold uppercase tracking-[0.2em] text-[10px] text-white/30">
                 <span className="flex items-center gap-2">
                   <span className="text-[#00ffff] opacity-50">Author:</span> 
                   {selectedArticle.authorProfile?.username || authorAddress(selectedArticle.author)}
                 </span>
                 <span className="flex items-center gap-2">
                   <span className="text-[#00ffff] opacity-50">Date:</span> 
                   {selectedArticle.date}
                 </span>
                 <span className="flex items-center gap-2">
                   <span className="text-[#00ffff] opacity-50">Hash:</span> 
                   {selectedArticle.id.slice(0, 12)}...
                 </span>
              </div>
            </header>
            
            <div className="text-white/80 leading-relaxed font-medium">
              {/* Auto-detect: if content has HTML tags, render as sanitized HTML; otherwise render as Markdown for legacy articles */}
              <div className="prose prose-invert prose-cyan max-w-none 
                prose-p:text-lg prose-p:leading-relaxed prose-p:mb-8 prose-p:text-white/70
                prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tighter prose-headings:text-white
                prose-img:rounded-3xl prose-img:border prose-img:border-white/10 prose-img:my-12
                prose-blockquote:border-l-2 prose-blockquote:border-[#00ffff]/30 prose-blockquote:bg-white/5 prose-blockquote:p-8 prose-blockquote:rounded-2xl prose-blockquote:italic
                prose-code:text-[#00ffff] prose-code:bg-[#00ffff]/10 prose-code:px-2 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                prose-a:text-[#00ffff] prose-a:no-underline hover:prose-a:underline
              ">
                {/<[a-z][\s\S]*>/i.test(unlockedContent) ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(unlockedContent) }} />
                ) : (
                  <ReactMarkdown>{unlockedContent}</ReactMarkdown>
                )}
              </div>
            </div>
          </div>
        </article>

      ) : selectedArticle ? (
        /* ── Article detail / paywall view ── */
        <div className="w-full flex flex-col">
        <div className="w-full min-h-screen bg-black flex flex-col pt-20">
          <section className="w-full flex-1 p-6 md:p-12 lg:p-24 relative overflow-hidden flex flex-col">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:32px_32px]"></div>
            
            <button
              onClick={() => setSelectedArticle(null)}
              className="text-white/30 font-bold uppercase tracking-[0.3em] mb-12 flex items-center gap-3 hover:text-[#00ffff] transition-all cursor-pointer group w-max text-[10px] relative z-10"
            >
              <span className="material-symbols-outlined text-sm">close</span>
              Cancel Fetch
            </button>

            <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-center justify-center flex-1 relative z-10">
              <div className="flex-1 max-w-3xl">
                <span className="inline-block px-3 py-1 border border-white/10 rounded-full text-white/40 mb-8 font-bold text-[10px] uppercase tracking-[0.3em] backdrop-blur-md">
                   Shelby Secured Entry
                </span>
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black uppercase leading-[0.9] tracking-tighter mb-10 text-white">
                  {selectedArticle.title}
                </h1>
                <p className="text-lg md:text-2xl font-medium text-white/50 max-w-2xl mb-12 leading-relaxed border-l border-white/20 pl-8">
                  {selectedArticle.excerpt}
                </p>
                
                <div className="flex flex-wrap gap-10 items-center">
                   <div className="flex items-center gap-5">
                      {selectedArticle.authorProfile?.avatar_url ? (
                        <img src={selectedArticle.authorProfile.avatar_url} alt="" className="w-16 h-16 rounded-2xl border border-white/10 object-cover" />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 text-white flex items-center justify-center text-xl font-bold">
                          {selectedArticle.authorProfile?.username?.slice(0,1) || 'A'}
                        </div>
                      )}
                      <div>
                        <div className="flex flex-col">
                            <p className="font-bold text-xl uppercase tracking-tighter text-white">{selectedArticle.authorProfile?.username || authorAddress(selectedArticle.author)}</p>
                            <div className="flex items-center gap-3">
                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{selectedArticle.author.slice(0, 6)}...{selectedArticle.author.slice(-4)}</p>
                                <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                                <p className="text-[10px] text-[#00ffff] font-black uppercase tracking-widest">{authorFollowers} Followers</p>
                            </div>
                        </div>
                      </div>
                   </div>
                   
                   {account && normalizeAddress(account.address.toString()) !== normalizeAddress(selectedArticle.author) && (
                      <button
                        onClick={handleFollow}
                        disabled={followingAuthor || followedAuthors.includes(normalizeAddress(selectedArticle.author))}
                        className={`px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-[10px] border transition-all ${
                          followedAuthors.includes(normalizeAddress(selectedArticle.author)) 
                            ? 'bg-white/10 border-white/20 text-white/50' 
                            : 'bg-white text-black border-white hover:bg-[#00ffff] hover:border-[#00ffff] shadow-lg shadow-[#00ffff]/10'
                        }`}
                      >
                        {followingAuthor ? 'SYNCING...' : followedAuthors.includes(normalizeAddress(selectedArticle.author)) ? 'FOLLOWED' : 'Follow Author'}
                      </button>
                   )}
                </div>
              </div>

              <div className="w-full lg:w-[460px] bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-10 md:p-12 flex flex-col gap-10 shadow-2xl relative">
                <div className="flex items-center gap-6">
                  <div className="size-14 bg-[#00ffff]/10 rounded-2xl flex items-center justify-center text-[#00ffff] border border-[#00ffff]/20">
                    <span className="material-symbols-outlined text-3xl font-bold">encrypted</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight uppercase text-white">Unlock Content</h3>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mt-1">Shelby Protocol</p>
                  </div>
                </div>
                
                <div className="space-y-5">
                  <div className="flex justify-between font-bold uppercase text-[10px] tracking-[0.2em] text-white/40 pb-4 border-b border-white/5">
                    <span>Protocol Fee</span>
                    <span>0.0000 APT</span>
                  </div>
                  <div className="flex justify-between font-bold uppercase text-[10px] tracking-[0.2em] text-white/40 pb-4 border-b border-white/5">
                    <span>Author Share</span>
                    <span>{(selectedArticle.price * 0.9).toFixed(4)} APT</span>
                  </div>
                  <div className="flex justify-between font-bold items-end pt-2">
                    <span className="uppercase text-[10px] tracking-[0.3em] text-white/30 mb-1">Total Price</span>
                    <span className="text-4xl text-[#00ffff] tracking-tighter">{selectedArticle.price.toFixed(4)} <span className="text-lg opacity-40">APT</span></span>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    onClick={() => setShowConfirmModal(true)}
                    disabled={purchasing}
                    className="w-full bg-white hover:bg-[#00ffff] text-black font-black text-xl py-6 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all shadow-xl shadow-[#00ffff]/5 disabled:opacity-20 uppercase tracking-widest"
                  >
                    {purchasing ? (
                      <span className="animate-pulse">Authorizing...</span>
                    ) : (
                      <>
                        <span>Decrypt Entry</span>
                        <span className="text-[9px] font-bold tracking-[0.3em] opacity-40">Syncing Required</span>
                      </>
                    )}
                  </button>
                </div>
                
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/20 text-center leading-relaxed">
                  Decentralized access is permanent and irreversible.
                </p>
              </div>
            </div>
          </section>

          {/* ── Purchase Confirmation Modal ── */}
          {showConfirmModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-black/80 backdrop-blur-2xl" onClick={() => setShowConfirmModal(false)} />
              <div className="relative bg-white/5 border border-white/10 max-w-lg w-full p-10 md:p-12 rounded-[2.5rem] shadow-2xl overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]"></div>
                
                <div className="relative z-10 flex flex-col gap-8">
                  <div className="flex items-center gap-4">
                    <div className="size-10 bg-[#00ffff]/10 rounded-xl flex items-center justify-center text-[#00ffff]">
                      <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                    </div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Confirm Unlock</h3>
                  </div>

                  <div className="bg-white/5 rounded-3xl p-8 border border-white/10 flex flex-col gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/30">Securing Entry</p>
                    <p className="text-2xl font-black uppercase tracking-tighter text-white">{selectedArticle.title}</p>
                    <div className="pt-4 mt-4 border-t border-white/5 flex justify-between items-end">
                      <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/30">Net Cost</span>
                      <span className="text-3xl font-black tracking-tighter text-[#00ffff]">
                        {selectedArticle.price.toFixed(4)} <span className="text-sm opacity-40 uppercase">APT</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setShowConfirmModal(false)}
                      className="flex-1 px-8 py-5 rounded-2xl font-bold uppercase tracking-widest text-[10px] border border-white/10 text-white/40 hover:bg-white/5 hover:text-white transition-all"
                    >
                      Abort
                    </button>
                    <button
                      onClick={() => { setShowConfirmModal(false); handlePurchase(); }}
                      className="flex-1 bg-white text-black px-8 py-5 rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-[#00ffff] transition-all"
                    >
                      Authorize ↗
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>

      ) : (
        /* ── Discovery Feed ── */
        <div className="w-full">
          {/* Minimalist Tech Hero */}
          <section className="w-full bg-black text-white py-32 md:py-48 px-6 flex flex-col items-center justify-center relative overflow-hidden border-b border-white/10">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:40px_40px]"></div>
            <div className="relative z-10 text-center max-w-4xl mx-auto">
              <span className="inline-block px-4 py-1.5 rounded-full border border-[#00ffff]/30 text-[#00ffff] text-[10px] font-bold tracking-[0.3em] uppercase mb-8 backdrop-blur-md">
                Shelby Network Active
              </span>
              <h2 className="text-5xl md:text-8xl font-black tracking-tight uppercase leading-[0.9] mb-8 text-white">
                Write. Publish. <br/>
                <span className="text-[#00ffff]">Instantly.</span>
              </h2>
              <p className="text-lg md:text-xl text-white/40 font-medium uppercase tracking-[0.2em] max-w-2xl mx-auto">
                Secure your entries on the decentralized ledger. <br/> Permanent. Censorship-resistant. Yours.
              </p>
            </div>
          </section>

          {/* Clean Status Bar */}
          <div className="w-full bg-black/50 backdrop-blur-md text-white/40 py-3.5 px-8 md:px-12 flex justify-between items-center border-b border-white/10 text-[10px] font-bold uppercase tracking-[0.2em]">
            <div className="flex gap-8 items-center">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00ffff] shadow-[0_0_8px_#00ffff]"></span>
                Shelby_Network: Online
              </span>
              <span className="hidden md:inline">Entries: {articles.length}</span>
            </div>
            <div className="hidden sm:block font-mono">
              Last_Sync: {mounted ? new Date().toLocaleTimeString() : '--:--:--'}
            </div>
          </div>

          <main className="w-full bg-black">
            <div className="w-full border-b border-white/10 px-8 py-16 md:px-12 bg-black text-white flex flex-col md:flex-row justify-between items-end gap-8">
              <div>
                <h3 className="text-4xl md:text-6xl font-bold tracking-tight uppercase mb-2 leading-none">Discovery Feed</h3>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/40 italic">Verified Shelby Network Archive</p>
              </div>
              <div className="flex gap-4">
                 {['trending', 'following', 'library'].map((mode) => (
                   <button
                     key={mode}
                     onClick={() => setFeedMode(mode as any)}
                     className={`px-6 py-2.5 border border-white/10 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                       feedMode === mode ? 'bg-[#ff00ff] text-white border-[#ff00ff]' : 'bg-transparent text-white/60 hover:text-white hover:bg-white/5'
                     }`}
                   >
                     {mode}
                   </button>
                 ))}
              </div>
            </div>

            <div className="w-full min-h-screen">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 w-full border-b border-white/5">
                  {loading ? (
                    [...Array(6)].map((_, i) => (
                      <div key={i} className="border-b border-r border-white/5 p-8 flex flex-col gap-6 animate-pulse">
                        <div className="w-full aspect-video bg-white/5 rounded-lg"></div>
                        <div className="h-6 w-3/4 bg-white/5 rounded"></div>
                        <div className="h-12 w-full bg-white/5 rounded"></div>
                      </div>
                    ))
                  ) : articles.length === 0 ? (
                    <div className="col-span-full p-32 text-center bg-transparent">
                       <h2 className="text-2xl font-bold uppercase text-white/10 mb-4">Synchronizing archive</h2>
                       <p className="text-[10px] font-medium uppercase tracking-[0.5em] text-white/5">No active blobs detected</p>
                    </div>
                  ) : (
                    (feedMode === 'following' ? articles.filter(a => followedAuthors.includes(normalizeAddress(a.author))) : 
                     feedMode === 'library' ? articles.filter(a => isPurchased(a.id)) : articles).map((article) => (
                        <article 
                          key={article.id}
                          onClick={() => setSelectedArticle(article)}
                          className="border-b border-r border-white/5 p-8 flex flex-col gap-6 group hover:bg-white/[0.02] transition-all cursor-pointer relative"
                        >
                          <div className="w-full aspect-video border border-white/10 rounded-lg overflow-hidden relative mb-2">
                            <img 
                              className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500" 
                              src={`https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?auto=format&fit=crop&q=80&w=800`}
                              alt={article.title}
                            />
                            {isPurchased(article.id) && (
                              <div className="absolute top-4 right-4 bg-[#00ffff] text-black text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter">
                                unlocked
                              </div>
                            )}
                          </div>
                          
                          <div className="flex justify-between items-center text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase">
                            <span>Entry_{article.id.slice(0, 6)}</span>
                            <span>{article.date.split(',')[0]}</span>
                          </div>
                          
                          <h4 className="text-2xl font-bold uppercase tracking-tight group-hover:text-[#00ffff] transition-colors line-clamp-2 leading-tight">
                            {article.title}
                          </h4>
                          
                          <p className="text-white/40 text-sm font-medium leading-relaxed group-hover:text-white/60 transition-colors line-clamp-3">
                            {article.excerpt}
                          </p>
  
                          <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between">
                            <span className="text-xl font-bold text-white/90">{article.price.toFixed(4)} <span className="text-[10px] text-white/40 ml-1">APT</span></span>
                            <button className="text-[10px] font-bold uppercase tracking-widest text-[#00ffff] hover:translate-x-1 transition-transform flex items-center gap-2">
                              {isPurchased(article.id) ? 'Access Entry' : 'Unlock Now'} <ArrowRight size={14} />
                            </button>
                          </div>
                        </article>
                      ))
                  )}
                </div>
            </div>
          </main>

          {/* Minimalist CTA Section */}
          <section className="w-full grid grid-cols-1 lg:grid-cols-2">
            <div className="p-16 md:p-24 bg-white/5 border-b lg:border-b-0 lg:border-r border-white/10 group">
              <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tight mb-8 leading-none transition-transform group-hover:-translate-y-1">Start <br/><span className="text-[#ff00ff]">Writing.</span></h2>
              <p className="text-base text-white/40 uppercase font-bold mb-12 max-w-sm tracking-widest leading-relaxed">Submit your first entry and claim your author identity on-chain.</p>
              <button 
                onClick={() => window.location.href = '/write'}
                className="bg-white text-black px-10 py-4 text-xs font-bold uppercase tracking-widest rounded-full hover:bg-[#ff00ff] hover:text-white transition-all shadow-xl"
              >
                  Open Editor ↗
              </button>
            </div>
            <div className="p-16 md:p-24 bg-black border-b border-white/10 group">
              <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tight mb-8 leading-none transition-transform group-hover:-translate-y-1">Browse <br/><span className="text-[#00ffff]">Archive.</span></h2>
              <p className="text-base text-white/40 uppercase font-bold mb-12 max-w-sm tracking-widest leading-relaxed">Explore thousands of entries stored permanently on the network.</p>
              <button 
                onClick={() => window.location.href = '#'}
                className="bg-white/10 text-white border border-white/20 px-10 py-4 text-xs font-bold uppercase tracking-widest rounded-full hover:bg-white hover:text-black transition-all"
              >
                  Access Vault ↗
              </button>
            </div>
          </section>

          {/* Minimalist Footer */}
          <footer className="w-full bg-black p-16 md:p-24 flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-black text-[20vw] text-white/5 pointer-events-none select-none uppercase tracking-tighter">
              Shelby
            </div>
            <div className="flex flex-wrap justify-center gap-12 md:gap-20 mb-20 uppercase font-bold text-sm tracking-[0.3em] relative z-10 text-white/40">
              <a className="hover:text-white transition-colors" href="#">Discord</a>
              <a className="hover:text-white transition-colors" href="#">X / Twitter</a>
              <a className="hover:text-white transition-colors" href="#">Github</a>
              <a className="hover:text-white transition-colors" href="#">Doc</a>
            </div>
            <div className="text-center font-mono text-white/10 relative z-10 border-t border-white/5 pt-12 w-full max-w-4xl">
              <p className="text-xs uppercase tracking-widest">© 2024 WritePay Labs // Decentralized Ledger Technology</p>
              <div className="mt-4 flex justify-center gap-8 text-[9px] uppercase tracking-[0.4em] text-[#00ffff]/40">
                <span>Shelby Network</span>
                <span>Uptime.99%</span>
                <span>Latency.10ms</span>
              </div>
            </div>
          </footer>
        </div>
      )}
    </div>
  );

  function authorAddress(addr: string) {
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }
}

