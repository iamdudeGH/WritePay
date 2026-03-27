import { NextResponse } from 'next/server';

const GENLAYER_STUDIO_RPC = "https://studio.genlayer.com/api";
const GENLAYER_CONTRACT_ADDRESS = "0xe7988Bd6E1c61b5cEA057Ea51a3B9DD52f473D6f";

/**
 * Moderation API that sends content to GenLayer Studio for AI consensus.
 * 
 * GenLayer Studio JSON-RPC uses "send_transaction" for write methods
 * and "call" for view/read methods.
 * 
 * If GenLayer Studio is unavailable, falls back to local keyword-based filtering.
 */
export async function POST(req: Request) {
  try {
    const { articleId, content } = await req.json();

    if (!articleId || !content) {
      return NextResponse.json(
        { error: "Missing articleId or content" },
        { status: 400 }
      );
    }

    // Strip HTML tags to get clean text for moderation
    const cleanContent = content.replace(/<[^>]*>?/gm, '').substring(0, 2000).toLowerCase();

    // ── Attempt 1: Call GenLayer Studio RPC ──
    try {
      // GenLayer Studio uses "send_transaction" for write calls
      const rpcPayload = {
        jsonrpc: "2.0",
        method: "send_transaction",
        params: [{
          to_address: GENLAYER_CONTRACT_ADDRESS,
          function_name: "moderate_article",
          function_args: JSON.stringify([articleId, cleanContent]),
          value: 0,
        }],
        id: 1,
      };

      console.log("[GenLayer] Attempting GenLayer Studio RPC...");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const response = await fetch(GENLAYER_STUDIO_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpcPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        console.log("[GenLayer] RPC result:", JSON.stringify(result));
        
        if (!result.error) {
          // The GenLayer contract returns true/false
          const isApproved = result.result === true || result.result?.data?.result === true;
          return NextResponse.json({
            approved: isApproved,
            reason: isApproved ? "Content passed GenLayer AI moderation" : "Content flagged by GenLayer AI validators",
            source: "genlayer"
          });
        }
      }
    } catch (glError) {
      console.log("[GenLayer] Studio RPC unavailable, falling back to local moderation:", 
        glError instanceof Error ? glError.message : "Unknown error");
    }

    // ── Fallback: Local AI-style Keyword Moderation ──
    // This simulates what the GenLayer contract does, for when Studio is not running
    console.log("[Moderation] Using local content filter as fallback...");

    const violationPatterns = [
      // Hate speech
      /\b(hate|racist|sexist|bigot|slur)\b/i,
      /\b(kill|murder|die|death\s+to)\b/i,
      // Extreme violence  
      /\b(bomb|terror|attack|shoot|weapon)\b/i,
      // Commercial Spam patterns
      /\b(buy now|click here|free money|get rich quick)\b/i,
      /\b(casino|gambling|porn|xxx|nude)\b/i,
      // Profanity
      /\b(fuck|shit|ass|bitch|damn|crap)\b/i,
      // Scam patterns
      /\b(nigerian prince|wire transfer|social security)\b/i,
      // Gibberish & Keyboard mashing
      /(.)\1{5,}/i, // 6 or more repeated characters like aaaaaa
      /\b(asdf|qwerty|12345|test test)\b/i,
    ];

    const violations: string[] = [];
    
    // Gibberish length/space checks
    if (cleanContent.trim().length < 15) {
      violations.push("content_too_short_spam");
    }
    if (cleanContent.length > 40 && !cleanContent.includes(' ')) {
      violations.push("gibberish_no_spaces");
    }

    for (const pattern of violationPatterns) {
      if (pattern.test(cleanContent)) {
        violations.push(pattern.source);
      }
    }

    const isApproved = violations.length === 0;

    console.log(`[Moderation] Result: ${isApproved ? "APPROVED" : "REJECTED"} (${violations.length} violations)`);

    return NextResponse.json({
      approved: isApproved,
      reason: isApproved 
        ? "Content passed moderation review" 
        : "Content flagged as low-quality spam or inappropriate",
      source: "local_filter",
      violations: violations.length,
    });

  } catch (error) {
    console.error("[Moderation] Critical error:", error);
    // Only fail open on truly unexpected errors
    return NextResponse.json({ approved: true, reason: "Moderation service error", source: "error" });
  }
}
