"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function TopUpSuccessPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [credited, setCredited] = useState(false);

  useEffect(() => {
    let prev: number | null = null;
    let ticks = 0;
    const MAX = 12; // poll up to ~24s

    async function poll() {
      try {
        const r = await fetch("/api/wallet");
        const d = (await r.json()) as { balance?: number };
        const bal = d.balance ?? 0;

        if (prev === null) {
          prev = bal;
          setBalance(bal);
        } else if (bal > prev) {
          setBalance(bal);
          setCredited(true);
          return; // stop polling — balance updated
        }
      } catch { /* ignore */ }

      ticks++;
      if (ticks < MAX) setTimeout(poll, 2000);
    }

    poll();
  }, []);

  const fmtPts = (n: number) => n.toLocaleString("en-US");

  return (
    <main style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
      padding: "24px 16px",
      fontFamily: "var(--ff, 'Archivo', system-ui, sans-serif)",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "var(--card)",
        border: "1px solid rgba(60,113,67,.35)",
        borderRadius: 20,
        padding: "40px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        boxShadow: "0 12px 48px rgba(0,0,0,.3)",
      }}>
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Baylo" height={28} style={{ objectFit: "contain", filter: "brightness(1.05)" }} />

        {/* Animated check circle */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(60,113,67,.18)",
          border: "2px solid #3C7143",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width={36} height={36} viewBox="0 0 24 24" fill="none"
               stroke="#3C7143" strokeWidth={2.5}
               strokeLinecap="round" strokeLinejoin="round"
               aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        {/* Heading */}
        <div style={{ textAlign: "center", lineHeight: 1.35 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
            Payment successful
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)", margin: 0 }}>
            Your GCash payment was confirmed.
            {credited
              ? " Points have been added to your wallet."
              : " Points are being credited — this only takes a moment."}
          </p>
        </div>

        {/* Balance card */}
        <div style={{
          width: "100%",
          background: "rgba(60,113,67,.09)",
          border: "1px solid rgba(60,113,67,.28)",
          borderRadius: 14,
          padding: "20px",
          textAlign: "center",
        }}>
          <p style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "#3C7143",
            margin: "0 0 10px",
          }}>
            {credited ? "Updated balance" : "Wallet balance"}
          </p>

          {balance === null ? (
            <p style={{ fontSize: 32, fontWeight: 800, color: "var(--text)", margin: 0 }}>—</p>
          ) : (
            <p style={{ fontSize: 36, fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {fmtPts(balance)}{" "}
              <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.75 }}>pts</span>
            </p>
          )}

          {!credited && balance !== null && (
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Spinner />
              Waiting for confirmation…
            </p>
          )}
        </div>

        {/* Return button */}
        <Link
          href="/dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            padding: "14px 24px",
            borderRadius: 12,
            background: "#3C7143",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            textDecoration: "none",
            letterSpacing: "0.01em",
          }}
        >
          Return to Baylo
        </Link>

        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, textAlign: "center" }}>
          Your wallet and transaction history update automatically.
        </p>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      style={{ animation: "spin 1s linear infinite" }}
    >
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
