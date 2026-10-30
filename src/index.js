/**
 * PayChangu support-payment worker.
 *
 * Holds the PAYCHANGU_SECRET_KEY (set via `wrangler secret put`) and does the
 * two calls the frontend is not allowed to do directly:
 *   POST /api/support/initiate     -> creates a PayChangu Standard Checkout
 *                                      transaction, returns { checkout_url }
 *   GET  /api/support/verify/:tx   -> verifies a transaction status
 *
 * Deploy:
 *   cd paychangu-worker
 *   npx wrangler deploy
 *   npx wrangler secret put PAYCHANGU_SECRET_KEY   (paste sec-test-... or sec-live-...)
 */

const PAYCHANGU_API = "https://api.paychangu.com";

// Restrict this to your real site origin once deployed, e.g.
// "https://edisontaimu9-ui.github.io"
const ALLOWED_ORIGIN = "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// Trim and length-limit free text coming from the browser before forwarding it to PayChangu.
function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function makeTxRef() {
  return "SUPPORT-" + crypto.randomUUID();
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// PayChangu signs each webhook body with HMAC-SHA256 using your webhook
// secret (the "Test/Live Webhook secret" shown on the API & Webhook page),
// sent in the `Signature` header. Recompute and compare.
async function verifyHmacSha256(rawBody, secret, signatureHeader) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computedHex = toHex(mac);
  const computedB64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  const received = signatureHeader.trim();

  // PayChangu's docs don't pin down hex vs base64 encoding for the header,
  // so check both rather than assume.
  return timingSafeEqual(computedHex, received.toLowerCase()) || timingSafeEqual(computedB64, received);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // POST /api/support/initiate
    if (url.pathname === "/api/support/initiate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ status: "error", message: "Invalid JSON body" }, 400);
      }

      const amount = Number(body.amount);
      if (!amount || amount <= 0) {
        return json({ status: "error", message: "A positive amount is required" }, 400);
      }

      const tx_ref = makeTxRef();

      const payload = {
        amount: String(Math.round(amount)),
        currency: body.currency === "USD" ? "USD" : "MWK",
        tx_ref,
        first_name: body.first_name || "Supporter",
        last_name: body.last_name || "",
        email: body.email || undefined,
        callback_url: body.return_url || url.origin,
        return_url: body.return_url || url.origin,
        customization: {
          // Each site can brand its own checkout (e.g. "Support Chakudya"); falls back to the default.
          title: cleanText(body.title, 60) || "Support Edison Taimu",
          description: cleanText(body.message, 200) || "Thank you for supporting my work",
        },
      };

      const pcRes = await fetch(`${PAYCHANGU_API}/payment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.PAYCHANGU_SECRET_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const pcData = await pcRes.json();

      if (!pcRes.ok || pcData.status !== "success") {
        return json(
          { status: "error", message: pcData.message || "PayChangu could not initiate the transaction", details: pcData },
          502
        );
      }

      return json({
        status: "success",
        tx_ref,
        checkout_url: pcData.data?.checkout_url || pcData.data?.link,
      });
    }

    // GET /api/support/verify/:tx_ref
    if (url.pathname.startsWith("/api/support/verify/") && request.method === "GET") {
      const tx_ref = decodeURIComponent(url.pathname.split("/api/support/verify/")[1] || "");
      if (!tx_ref) {
        return json({ status: "error", message: "tx_ref is required" }, 400);
      }

      const pcRes = await fetch(`${PAYCHANGU_API}/verify-payment/${encodeURIComponent(tx_ref)}`, {
        headers: {
          Authorization: `Bearer ${env.PAYCHANGU_SECRET_KEY}`,
          Accept: "application/json",
        },
      });

      const pcData = await pcRes.json();
      return json(pcData, pcRes.status);
    }

    // POST /api/support/callback - PayChangu's server-to-server webhook (IPN).
    // This is the source of truth for "did the payment actually succeed" —
    // the frontend's /verify call on return is a UX nicety, not security.
    if (url.pathname === "/api/support/callback" && request.method === "POST") {
      const signatureHeader = request.headers.get("Signature") || request.headers.get("signature");
      const rawBody = await request.text();

      if (!signatureHeader || !env.PAYCHANGU_WEBHOOK_SECRET) {
        return json({ status: "error", message: "Missing signature or webhook secret not configured" }, 401);
      }

      const valid = await verifyHmacSha256(rawBody, env.PAYCHANGU_WEBHOOK_SECRET, signatureHeader);
      if (!valid) {
        return json({ status: "error", message: "Invalid signature" }, 401);
      }

      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return json({ status: "error", message: "Invalid JSON" }, 400);
      }

      // event.data.tx_ref / event.data.status ("success" | "failed") depending on event type.
      const txRef = event?.data?.tx_ref || event?.tx_ref;
      const txStatus = event?.data?.status || event?.status;

      if (txRef && env.SUPPORT_KV) {
        await env.SUPPORT_KV.put(
          `tx:${txRef}`,
          JSON.stringify({ status: txStatus, event, receivedAt: new Date().toISOString() })
        );
      }

      return json({ status: "success" });
    }

    return json({ status: "error", message: "Not found" }, 404);
  },
};
