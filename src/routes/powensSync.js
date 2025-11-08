// src/routes/powensSync.js
const express = require("express");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const router = express.Router();

/* ================================
 * CONFIG (via .env)
 * ============================== */
const POWENS_BASE   = process.env.POWENS_BASE_URL || "https://finance-app-sandbox.biapi.pro";
const POWENS_TOKEN  = process.env.POWENS_ACCESS_TOKEN || "";      // ⚠️ token user (valide ~1h)
const ENV_USER_ID   = process.env.POWENS_USER_ID || "";           // ex: "18"
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_KEY;

// Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================================
 * UTILS
 * ============================== */
function normalizeAmount(txt) {
  if (txt == null) return null;
  // accepte "40,93€" | "48,30$" | "40.93" | -42,00 etc.
  const only = String(txt).replace(/[^\d\-.,]/g, "");
  const dotStyle = only.replace(/\./g, "").replace(",", "."); // "1.234,50" -> "1234.50"
  const f = parseFloat(dotStyle);
  return Number.isFinite(f) ? Number(f.toFixed(2)) : null;
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  let body = null;
  try { body = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} on ${url}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/* ================================
 * HEALTHCHECK
 * ============================== */
router.get("/powens/health", (_req, res) => {
  res.status(200).send("✅ Route Powens active !");
});

/* ================================
 * SYNC
 * GET /api/powens/sync?sync=1 (optionnel: force synchronize)
 * ============================== */
router.get("/powens/sync", async (req, res) => {
  try {
    if (!POWENS_TOKEN) {
      return res.status(400).json({ error: "POWENS_ACCESS_TOKEN manquant (env)" });
    }

    const headers = { Authorization: `Bearer ${POWENS_TOKEN}` };

    // 1) Récupération / confirmation du user_id
    let userId = ENV_USER_ID ? Number(ENV_USER_ID) : null;
    if (!userId) {
      const me = await fetchJSON(`${POWENS_BASE}/2.0/users/me`, { headers });
      userId = Number(me?.id);
      if (!userId) {
        return res.status(401).json({ error: "Impossible d’identifier l’utilisateur Powens (token invalide/expiré?)", details: me });
      }
    }

    // 2) (optionnel) Forcer une synchro fraîche
    if (String(req.query.sync) === "1") {
      try {
        await fetchJSON(`${POWENS_BASE}/2.0/users/${userId}/synchronize`, {
          method: "POST",
          headers
        });
      } catch (e) {
        // la synchro peut renvoyer 202/204; on ignore les faux négatifs tant que les fetchs passent
        console.warn("⚠️ synchronize error (ignoré si data dispo):", e.body || e.message);
      }
    }

    // 3) Récupérer comptes + transactions (2.0 = endpoints user-scoped)
    const [accounts, transactions] = await Promise.all([
      fetchJSON(`${POWENS_BASE}/2.0/users/${userId}/accounts`, { headers }),
      fetchJSON(`${POWENS_BASE}/2.0/users/${userId}/transactions?limit=100&offset=0`, { headers }),
    ]);

    const accountsTotal = Number(accounts?.total ?? 0);
    const txArray = Array.isArray(transactions?.transactions) ? transactions.transactions : [];
    const txTotal = Number(transactions?.total ?? txArray.length);

    // 4) Upsert staging (transactions_powens)
    const rows = txArray.map((t) => ({
      id:                Number(t.id),
      id_account:        Number(t.id_account),
      powens_user_id:    Number(userId),
      date:              t.date || null,
      application_date:  t.application_date || null,
      wording:           t.wording || t.simplified_wording || null,
      simplified_wording:t.simplified_wording || null,
      type:              t.type || null,               // transfer, withdrawal, deferred_card, ...
      category_id:       t.id_category ? Number(t.id_category) : null,
      value_raw:         t.formatted_value || (typeof t.value === "number" ? t.value.toString() : t.value) || null,
      value_num:         typeof t.value === "number" ? Number(t.value) : normalizeAmount(t.formatted_value || t.value),
      original_value:    t.original_value != null ? normalizeAmount(t.original_value) : null,
      original_currency: t.original_currency || null,
      coming:            !!t.coming,
    }));

    if (rows.length > 0) {
      const { error: upsertErr } = await supabase
        .from("transactions_powens")
        .upsert(rows, { onConflict: "id" });

      if (upsertErr) {
        return res.status(500).json({ error: "Erreur upsert transactions_powens", details: upsertErr.message });
      }
    }

    // 5) Appeler la fonction SQL qui copie/normalise vers ta table 'transactions'
    const { error: rpcErr } = await supabase.rpc("import_powens_into_transactions", {
      p_powens_user_id: userId
      // p_user_id: (optionnel) passe ton UUID interne ici si tu veux surcharger
    });
    if (rpcErr) {
      return res.status(500).json({ error: "Erreur RPC import_powens_into_transactions", details: rpcErr.message });
    }

    return res.status(200).json({
      message: "Synchronisation Powens terminée avec succès.",
      comptes: accountsTotal,
      transactions: txTotal,
      user_id: userId
    });
  } catch (err) {
    console.error("🔥 /powens/sync error:", err.body || err.message || err);
    return res.status(err.status || 500).json({
      error: err.message || "Erreur interne",
      details: err.body || null
    });
  }
});

module.exports = router;
