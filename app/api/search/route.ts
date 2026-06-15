import { NextResponse } from "next/server";
import { searchTrademarks, ProviderError } from "@/lib/uspto";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-IP cap: protects the shared monthly API quota from a single tab or script.
const RATE_LIMIT = 12; // requests
const RATE_WINDOW_MS = 60 * 1000; // per minute

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (!q) {
    return NextResponse.json({ error: "Provide a name to search with ?q=" }, { status: 400 });
  }
  if (q.length > 100) {
    return NextResponse.json({ error: "Search term is too long." }, { status: 400 });
  }

  const limit = rateLimit(clientIp(request), RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many searches. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  try {
    const result = await searchTrademarks(q);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected search error:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
