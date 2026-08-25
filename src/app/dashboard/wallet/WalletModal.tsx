"use client";
import React from "react";
import { PHP_PER_POINT, pointsToPhp } from "@/lib/wallet-config";

// ── SVG paths (Lucide-style, single combined path per icon) ──────────────────
const I = {
  wallet:  "M17 14h.01M19 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2ZM3 10h18",
  plus:    "M12 5v14M5 12h14",
  arrow:   "M5 12h14M13 6l6 6-6 6",
  x:       "M18 6 6 18M6 6l12 12",
  topup:   "M12 2v20M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  coin:    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v2M12 16v2M8.5 9a3.5 3.5 0 0 1 7 0c0 2-3.5 3-3.5 5M12 17h.01",
  history: "M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8",
  check:   "M20 6 9 17l-5-5",
} as const;

function Ico({ d, size = 18, color }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color ?? "currentColor"} strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────
interface WalletTx {
  id: string;
  type: "TOP_UP" | "TRADE_SPEND" | "TRADE_RECEIVE";
  amount: number;
  description: string;
  createdAt: string;
  grossAmount: number | null;
  gatewayFee: number | null;
  platformFee: number | null;
  netPoints: number | null;
  provider: string | null;
}

const PRESETS = [100, 500, 1000, 2500];

// ── Formatting helpers ───────────────────────────────────────────────────────
function fmtPts(n: number) {
  return n.toLocaleString("en-US");
}
function fmtPhp(n: number) {
  return `₱${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function txLabel(tx: WalletTx): string {
  if (tx.type === "TOP_UP") return "Top-up";
  if (tx.type === "TRADE_SPEND") return "Spent";
  return "Received";
}
function txColor(tx: WalletTx): string {
  if (tx.amount > 0) return "var(--eco, #2ad59e)";
  return "#f0506e";
}
function txSign(tx: WalletTx): string {
  return tx.amount > 0 ? "+" : "";
}

// ── TopUpFlow (inner page) ───────────────────────────────────────────────────
function TopUpFlow({
  onSuccess,
  onCancel,
}: {
  onSuccess: (newBalance: number) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = React.useState<number | null>(500);
  const [custom, setCustom] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [gcashLoading, setGcashLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(false);

  const points = (() => {
    if (custom !== "") {
      const n = parseInt(custom.replace(/\D/g, ""), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return selected ?? 0;
  })();

  const phpCost = pointsToPhp(points);

  async function handleConfirm() {
    if (points <= 0) { setError("Enter a valid amount."); return; }
    if (points > 100_000) { setError("Maximum 100,000 pts per top-up."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
      const data = (await res.json()) as { balance?: number; error?: string };
      if (!res.ok) { setError(data.error ?? "Top-up failed."); return; }
      setDone(true);
      setTimeout(() => onSuccess(data.balance ?? 0), 1200);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGCashCheckout() {
    if (points <= 0) { setError("Enter a valid amount."); return; }
    if (points > 100_000) { setError("Maximum 100,000 pts per top-up."); return; }
    setError("");
    setGcashLoading(true);
    try {
      const res = await fetch("/api/wallet/paymongo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Could not start GCash payment."); return; }
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGcashLoading(false);
    }
  }

  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "32px 0" }}>
        <span style={{
          width: 52, height: 52, borderRadius: "50%", background: "var(--eco-tint, rgba(42,213,158,.15))",
          display: "flex", alignItems: "center", justifyContent: "center", color: "var(--eco, #2ad59e)",
        }}>
          <Ico d={I.check} size={26} color="var(--eco, #2ad59e)" />
        </span>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>
          {fmtPts(points)} pts added!
        </p>
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>Updating your balance…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Sandbox notice */}
      <div style={{
        padding: "10px 14px", borderRadius: 8,
        background: "color-mix(in oklab, var(--accent) 10%, transparent)",
        border: "1px solid color-mix(in oklab, var(--accent) 30%, transparent)",
        fontSize: 13, color: "var(--accent)",
      }}>
        <strong>Test mode</strong> — GCash uses fake money (PayMongo sandbox). Demo is instant &amp; free.
      </div>

      {/* Presets */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", marginBottom: 10 }}>
          Select amount
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {PRESETS.map((p) => (
            <button key={p}
              onClick={() => { setSelected(p); setCustom(""); setError(""); }}
              style={{
                padding: "12px 10px", borderRadius: 10, border: "2px solid",
                borderColor: selected === p && custom === "" ? "var(--accent)" : "var(--border)",
                background: selected === p && custom === "" ? "color-mix(in oklab, var(--accent) 12%, transparent)" : "var(--surface-2)",
                color: selected === p && custom === "" ? "var(--accent)" : "var(--text)",
                cursor: "pointer", fontWeight: 700, fontSize: 14,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                transition: "border-color .12s, background .12s",
              }}>
              <span>{fmtPts(p)} pts</span>
              <span style={{ fontSize: 11, fontWeight: 600, opacity: .7 }}>{fmtPhp(pointsToPhp(p))}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom amount */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", marginBottom: 8 }}>
          Or enter custom amount
        </p>
        <div style={{ position: "relative" }}>
          <input
            className="modal-input"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 750"
            value={custom}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              setCustom(v);
              setSelected(null);
              setError("");
            }}
            style={{ paddingRight: 60 }}
          />
          <span style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 12, color: "var(--muted)", fontWeight: 600,
          }}>pts</span>
        </div>
      </div>

      {/* Summary */}
      {points > 0 && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: "var(--surface-2)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 14,
        }}>
          <span style={{ color: "var(--text-dim)" }}>You receive</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: "var(--text)" }}>{fmtPts(points)} pts</span>
        </div>
      )}
      {points > 0 && (
        <div style={{
          padding: "10px 16px", borderRadius: 10,
          background: "var(--surface-2)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 13,
        }}>
          <span style={{ color: "var(--text-dim)" }}>Notional cost ({PHP_PER_POINT} ₱/pt)</span>
          <span style={{ fontWeight: 700, color: "var(--text)" }}>{fmtPhp(phpCost)}</span>
        </div>
      )}

      {error && (
        <p style={{
          fontSize: 13, color: "#f0506e", margin: 0, padding: "8px 12px",
          background: "rgba(240,80,110,.08)", borderRadius: 8, border: "1px solid rgba(240,80,110,.2)",
        }}>{error}</p>
      )}

      {/* GCash — primary CTA */}
      <button
        className="btn-accent"
        onClick={handleGCashCheckout}
        disabled={gcashLoading || loading || points <= 0}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        {gcashLoading ? "Redirecting to GCash…" : `Pay ${points > 0 ? fmtPhp(phpCost) : ""} via GCash`}
      </button>

      {/* Secondary row */}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn-soft" onClick={onCancel} style={{ flex: 1 }} disabled={gcashLoading || loading}>
          Cancel
        </button>
        <button
          className="btn-soft"
          onClick={handleConfirm}
          disabled={loading || gcashLoading || points <= 0}
          style={{ flex: 1 }}
        >
          {loading ? "Processing…" : "Demo (instant)"}
        </button>
      </div>
    </div>
  );
}

// ── Main WalletModal ─────────────────────────────────────────────────────────
export default function WalletModal({ onClose }: { onClose: () => void }) {
  const [view, setView] = React.useState<"wallet" | "topup">("wallet");
  const [balance, setBalance] = React.useState<number | null>(null);
  const [txs, setTxs] = React.useState<WalletTx[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((d: unknown) => {
        const data = d as { balance?: number; transactions?: WalletTx[] };
        setBalance(data.balance ?? 0);
        setTxs(data.transactions ?? []);
      })
      .catch(() => setBalance(0))
      .finally(() => setLoading(false));
  }, []);

  // Close on backdrop click
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  // Close on Escape
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  function handleTopUpSuccess(newBalance: number) {
    setBalance(newBalance);
    // Re-fetch full transaction list
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((d: unknown) => {
        const data = d as { transactions?: WalletTx[] };
        setTxs(data.transactions ?? []);
      })
      .catch(() => {});
    setView("wallet");
  }

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onClick={handleBackdrop}
      style={{ zIndex: 400 }}
    >
      <div className="modal-box" style={{ width: "min(480px, 100%)", padding: 0, overflow: "hidden" }}>
        {/* ── Header ── */}
        <div style={{
          padding: "20px 22px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{
            width: 38, height: 38, borderRadius: 10,
            background: "color-mix(in oklab, var(--accent) 14%, transparent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--accent)", flexShrink: 0,
          }}>
            <Ico d={I.wallet} size={20} color="var(--accent)" />
          </span>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--text)" }}>
              {view === "topup" ? "Top up wallet" : "My Wallet"}
            </h2>
            {view === "wallet" && (
              <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>Baylo points</p>
            )}
          </div>
          {view === "topup" && (
            <button
              onClick={() => setView("wallet")}
              style={{ background: "none", border: 0, color: "var(--text-dim)", cursor: "pointer", padding: 4, fontSize: 13, fontWeight: 600 }}
            >
              ← Back
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close wallet"
            style={{
              background: "none", border: 0, cursor: "pointer", color: "var(--text-dim)",
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 8,
            }}
          >
            <Ico d={I.x} size={18} />
          </button>
        </div>

        <div style={{ padding: "20px 22px 24px", maxHeight: "calc(100dvh - 160px)", overflowY: "auto" }}>
          {view === "topup" ? (
            <TopUpFlow
              onSuccess={handleTopUpSuccess}
              onCancel={() => setView("wallet")}
            />
          ) : (
            <>
              {/* ── Balance card ── */}
              <div style={{
                padding: "22px 20px",
                borderRadius: 14,
                background: "linear-gradient(135deg, color-mix(in oklab, var(--accent) 22%, var(--surface-2)), var(--surface-2))",
                border: "1px solid color-mix(in oklab, var(--accent) 28%, var(--border))",
                marginBottom: 20,
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--accent)", margin: "0 0 6px" }}>
                  Current balance
                </p>
                {loading ? (
                  <p style={{ fontSize: 32, fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-.02em" }}>—</p>
                ) : (
                  <>
                    <p style={{ fontSize: 36, fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-.03em", lineHeight: 1.1 }}>
                      {fmtPts(balance ?? 0)}{" "}
                      <span style={{ fontSize: 18, fontWeight: 600, opacity: .8 }}>pts</span>
                    </p>
                    <p style={{ fontSize: 14, color: "var(--text-dim)", margin: "4px 0 0", fontWeight: 500 }}>
                      ≈ {fmtPhp(pointsToPhp(balance ?? 0))}
                      <span style={{ fontSize: 11, marginLeft: 5, opacity: .7 }}>at ₱{PHP_PER_POINT}/pt</span>
                    </p>
                  </>
                )}
                <button
                  className="btn-accent sm"
                  onClick={() => setView("topup")}
                  style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Ico d={I.plus} size={15} color="currentColor" />
                  Top up
                </button>
              </div>

              {/* ── Transaction history ── */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Ico d={I.history} size={15} color="var(--muted)" />
                <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", margin: 0 }}>
                  Transaction history
                </p>
              </div>

              {loading ? (
                <p style={{ fontSize: 13, color: "var(--text-dim)", padding: "20px 0", textAlign: "center" }}>Loading…</p>
              ) : txs.length === 0 ? (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                  padding: "36px 0", color: "var(--text-dim)",
                }}>
                  <Ico d={I.wallet} size={32} color="var(--border-strong)" />
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>No transactions yet</p>
                  <p style={{ fontSize: 13, margin: 0, opacity: .7 }}>Top up to get started.</p>
                </div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {txs.map((tx) => (
                    <li key={tx.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "11px 12px", borderRadius: 10,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                    }}>
                      {/* type badge */}
                      <span style={{
                        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                        background: tx.amount > 0
                          ? "color-mix(in oklab, var(--eco, #2ad59e) 14%, transparent)"
                          : "rgba(240,80,110,.1)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: txColor(tx),
                      }}>
                        <Ico d={tx.amount > 0 ? I.plus : I.arrow} size={16} color={txColor(tx)} />
                      </span>

                      {/* description */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", margin: 0, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tx.description}
                        </p>
                        <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "2px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{txLabel(tx)}</span>
                          <span>·</span>
                          <span>{fmtDate(tx.createdAt)}</span>
                          {tx.provider && tx.provider !== "demo" && <><span>·</span><span style={{ textTransform: "capitalize" }}>{tx.provider}</span></>}
                        </p>
                      </div>

                      {/* amount */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 800, color: txColor(tx), margin: 0 }}>
                          {txSign(tx)}{fmtPts(Math.abs(tx.amount))} pts
                        </p>
                        {tx.grossAmount != null && tx.grossAmount > 0 && (
                          <p style={{ fontSize: 11, color: "var(--muted)", margin: "1px 0 0" }}>
                            {fmtPhp(tx.grossAmount)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
