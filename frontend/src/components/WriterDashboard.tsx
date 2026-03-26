"use client"
import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { shelbyClient } from '@/lib/shelby';
import { useUploadBlobs } from '@shelby-protocol/react';
import { getPublishPayload, aptos, normalizeAddress, WRITEPAY_MODULE, wrapSignAndSubmit } from '@/lib/aptos';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import dynamic from 'next/dynamic';

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false });

export default function WriterDashboard() {
  const { account, signAndSubmitTransaction } = useWallet();
  const { mutateAsync: uploadBlobs } = useUploadBlobs({ client: shelbyClient });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [price, setPrice] = useState('0.05');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [moderationRejected, setModerationRejected] = useState(false);

  const handlePublish = async () => {
    if (!account) {
      alert("Please connect your wallet to publish.");
      return;
    }
    if (!title || !content) {
      alert("Please enter a title and content.");
      return;
    }

    setPublishing(true);
    setModerationRejected(false);

    try {
      // ── Step 0: GenLayer AI Moderation ──
      setModerating(true);
      const articleId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
      
      // Send BOTH title and content to be moderated
      const textToModerate = `Title: ${title}\n\nContent: ${content}`;
      
      const moderationRes = await fetch('/api/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, content: textToModerate }),
      });

      if (moderationRes.ok) {
        const moderationResult = await moderationRes.json();
        console.log("[GenLayer] Moderation result:", moderationResult);

        if (!moderationResult.approved) {
          setModerationRejected(true);
          setModerating(false);
          setPublishing(false);
          return; // Block the publish
        }
      }
      setModerating(false);
      // ── End GenLayer Moderation ──

      const pathSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const uniqueId = Math.random().toString(36).substring(2, 8);
      const blobName = `${pathSlug}-${uniqueId}.md`;

      const authorAddr = normalizeAddress(account.address.toString());
      const fullBlobId = `${authorAddr}/${blobName}`;

      const keyRes = await fetch('/api/encryption/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobId: fullBlobId, authorAddress: authorAddr })
      });
      if (!keyRes.ok) {
        const err = await keyRes.json().catch(() => ({}));
        throw new Error(err.error || `Encryption key generation failed (${keyRes.status})`);
      }
      const { key: hexKey } = await keyRes.json();
      
      const keyBytes = new Uint8Array(hexKey.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
          tagLength: 128
        },
        cryptoKey,
        new TextEncoder().encode(content)
      );

      const blobData = new Uint8Array(iv.length + encryptedBuffer.byteLength);
      blobData.set(iv, 0);
      blobData.set(new Uint8Array(encryptedBuffer), iv.length);

      const expirationMicros = Date.now() * 1000 + 365 * 24 * 60 * 60 * 1_000_000; 

      const adaptedSigner = {
        account: account.address,
        signAndSubmitTransaction: (payload: any) => wrapSignAndSubmit(signAndSubmitTransaction, payload)
      };

      console.log(`[Shelby] Initializing upload for ${blobName} (${(blobData.length / 1024 / 1024).toFixed(2)} MB)...`);
      
      await uploadBlobs({
        signer: adaptedSigner,
        blobs: [{ blobName, blobData }],
        expirationMicros
      });

      const stripHtml = (html: string) => html.replace(/<[^>]*>?/gm, '');
      const excerpt = stripHtml(content).substring(0, 160).trim() + "...";

      const payload = getPublishPayload(fullBlobId, title, excerpt, parseFloat(price));

      const response: any = await wrapSignAndSubmit(
        signAndSubmitTransaction,
        payload
      );

      let txSucceeded = false;
      for (let i = 0; i < 30; i++) {
        try {
          const tx: any = await aptos.getTransactionByHash({ transactionHash: response.hash });
          if (tx && tx.success) {
            txSucceeded = true;
            break;
          }
          if (tx && !tx.success) throw new Error("Transaction failed on-chain");
        } catch (e: any) {
          if (e.message?.includes("not found")) {
          } else {
            throw e;
          }
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      if (!txSucceeded) throw new Error("Transaction timeout or failed");

      setPublished(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to publish transaction.");
    } finally {
      setPublishing(false);
      setModerating(false);
    }
  }



  if (published) {
    return (
      <div className="w-full min-h-screen bg-black flex items-center justify-center p-8">
        <div className="bg-white/5 border border-white/10 p-12 md:p-24 text-center max-w-4xl w-full rounded-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="mx-auto w-24 h-24 bg-[#00ffff] text-black rounded-full flex items-center justify-center mb-10 shadow-[0_0_30px_rgba(0,255,255,0.3)]">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-4xl md:text-6xl font-bold mb-6 text-white uppercase tracking-tight">Entry Published</h2>
          <p className="text-white/40 mb-12 text-lg font-medium leading-relaxed max-w-xl mx-auto italic">
            Your data has been permanently secured on the network.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => {
                setPublished(false);
                setTitle('');
                setContent('');
              }}
              className="w-full sm:w-auto px-10 py-4 bg-white text-black font-bold text-xs uppercase tracking-widest rounded-full hover:bg-[#00ffff] transition-all"
            >
              Write New Entry
            </button>
            <button
               onClick={() => window.location.href = '/'}
               className="w-full sm:w-auto px-10 py-4 bg-white/10 text-white border border-white/20 font-bold text-xs uppercase tracking-widest rounded-full hover:bg-white hover:text-black transition-all"
            >
               View Discovery Feed
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-black text-white selection:bg-[#ff00ff] selection:text-white flex flex-col pt-20">
      
      <div className="w-full border-b border-white/10 bg-black/50 backdrop-blur-md p-4 flex justify-between items-center z-30">
        <div className="flex items-center gap-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00ffff]">Writer Dashboard</span>
          <span className="hidden md:block h-3 w-px bg-white/20"></span>
          <span className="hidden md:block text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Network Status: Online</span>
        </div>
        
        <div className="flex items-center gap-4">
        </div>
      </div>

      <main className="flex-1 bg-black">
        <div className="max-w-5xl mx-auto w-full px-6 py-12 flex flex-col gap-12">
          
          {/* GenLayer AI Moderation Rejection Banner */}
          {moderationRejected && (
            <div className="w-full bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="size-10 bg-red-500/20 rounded-xl flex items-center justify-center text-red-400 shrink-0">
                <span className="text-xl font-bold">✕</span>
              </div>
              <div>
                <p className="text-red-400 font-bold text-sm uppercase tracking-widest">Publishing Blocked</p>
                <p className="text-red-400/60 text-xs mt-1 font-medium">GenLayer AI validators flagged this content as inappropriate. Please revise your article and try again.</p>
              </div>
              <button 
                onClick={() => setModerationRejected(false)}
                className="ml-auto text-red-400/40 hover:text-red-400 text-xl transition-colors shrink-0"
              >✕</button>
            </div>
          )}

          {/* Clean Action Bar */}
          <div className="w-full bg-white/5 p-8 border border-white/10 rounded-2xl flex flex-col md:flex-row items-center gap-8 text-white backdrop-blur-sm">
            <div className="flex-1 flex flex-col gap-3">
              <label className="uppercase tracking-[0.2em] text-[10px] font-bold text-white/40 flex items-center gap-2">
                Set Price (APT)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-2xl font-bold text-white focus:border-[#00ffff] outline-none transition-all"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>



            <div className="w-full md:w-auto">
              <button
                disabled={publishing || !title || !content}
                onClick={handlePublish}
                className="w-full bg-white text-black font-bold py-6 px-12 text-sm rounded-full hover:bg-[#00ffff] transition-all uppercase tracking-[0.2em] flex items-center justify-center gap-4 disabled:opacity-20 shadow-2xl"
              >
                {moderating ? (
                  <><Loader2 size={18} className="animate-spin" /> GenLayer AI Analyzing...</>
                ) : publishing ? (
                  <><Loader2 size={18} className="animate-spin" /> Securing...</>
                ) : (
                  <>Secure Now</>
                )}
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex items-center justify-between border-b border-white/5 pb-6 text-[10px] font-bold uppercase tracking-[0.3em] text-white/20">
            <div className="flex gap-8">
              <span>Words: {content.replace(/<[^>]*>?/gm, '').split(/\s+/).filter(Boolean).length}</span>
              <span className="hidden sm:inline">Shelby encryption active</span>
            </div>
          </div>

          <div className="flex flex-col gap-16">
            <div className="group">
              <textarea
                placeholder="Untitled Entry..."
                className="w-full bg-transparent text-white text-5xl md:text-7xl font-bold focus:border-[#00ffff] border-l-2 border-white/10 p-6 placeholder:text-white/10 outline-none resize-none transition-all leading-tight tracking-tight"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={2}
              />
            </div>
            
            <div className="flex flex-col">
              <div className="border border-white/10 bg-white/5 rounded-2xl overflow-hidden p-1 min-h-[500px] backdrop-blur-md">
                <RichTextEditor
                  content={content}
                  onChange={(html) => setContent(html)}
                  placeholder="The network is listening..."
                />
              </div>
            </div>
          </div>

          <p className="text-[10px] text-white/30 font-black uppercase mt-12 text-center leading-tight tracking-[0.2em] max-w-2xl mx-auto">
            Permanent decentralized storage enabled <br/>
            AUTHOR_SHARE: 90% // NETWORK_MAINTENANCE_FEE: 10%
          </p>
        </div>
      </main>

      <footer className="w-full border-t border-white/10 bg-black p-6 flex justify-between items-center text-[9px] font-bold uppercase tracking-[0.4em] text-white/20">
        <div className="flex items-center gap-8">
          <span>{account?.address.toString().slice(0, 16)}</span>
          <span className="text-[#00ffff]">Live Network</span>
        </div>
        <div className="hidden md:block">
          Shelby Protocol Storage
        </div>
      </footer>
    </div>
  );
}
