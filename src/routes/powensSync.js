const express = require("express");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const router = express.Router();

const POWENS_BASE   = process.env.POWENS_BASE_URL || "https://finance-app-sandbox.biapi.pro";
const POWENS_TOKEN  = process.env.POWENS_ACCESS_TOKEN;
const POWENS_USER_ID= Number(process.env.POWENS_USER_ID || 18);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function normalizeAmount(txt){
  if (txt == null) return null;
  const n = String(txt).replace(/[^\d,-]/g,"").replace(",",".");
  const f = parseFloat(n);
  return isNaN(f) ? null : f;
}

router.get("/powens/sync", async (req,res)=>{
  try{
    const headers = { Authorization: `Bearer ${POWENS_TOKEN}` };

    const [accountsRes, transactionsRes] = await Promise.all([
      fetch(`${POWENS_BASE}/2.0/users/${POWENS_USER_ID}/accounts`, { headers }),
      fetch(`${POWENS_BASE}/2.0/users/${POWENS_USER_ID}/transactions?limit=100`, { headers })
    ]);
    const accounts = await accountsRes.json();
    const transactions = await transactionsRes.json();

    const txArray = transactions.transactions || [];
    const rows = txArray.map(t => ({
      id:               Number(t.id),
      id_account:       Number(t.id_account),
      powens_user_id:   POWENS_USER_ID,
      date:             t.date || null,
      application_date: t.application_date || null,
      wording:          t.wording || t.simplified_wording || null,
      simplified_wording: t.simplified_wording || null,
      type:             t.type || null,
      category_id:      t.id_category ? Number(t.id_category) : null,
      value_raw:        t.formatted_value || t.value || null,
      value_num:        typeof t.value === "number" ? t.value : normalizeAmount(t.formatted_value || t.value),
      original_value:   t.original_value ? Number(String(t.original_value).replace(",",".")) : null,
      original_currency:t.original_currency || null,
      coming:           !!t.coming,
    }));

    const { error: upsertErr } = await supabase
      .from("transactions_powens")
      .upsert(rows, { onConflict: "id" });
    if (upsertErr) return res.status(500).json({ error: upsertErr.message });

    const { error: rpcErr } = await supabase.rpc("import_powens_into_transactions", {
      p_powens_user_id: POWENS_USER_ID
    });
    if (rpcErr) return res.status(500).json({ error: rpcErr.message });

    res.json({
      message: "Synchronisation Powens terminée avec succès.",
      comptes: accounts.total ?? null,
      transactions: transactions.total ?? rows.length
    });
  } catch (e){
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
