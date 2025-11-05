// src/routes/powensWebhook.js
const express = require("express");
const router = express.Router();

// ✅ Healthcheck simple (GET)
router.get("/powens/webhook", (req, res) => {
  res.status(200).send("OK-GET");
});

// ✅ Webhook Powens (POST)
router.post("/powens/webhook", async (req, res) => {
  try {
    const event = req.body || {};

    // Toujours répondre vite
    res.status(200).send("OK");

    // Traitement asynchrone non bloquant
    setImmediate(async () => {
      try {
        const type = event.type || "(type inconnu)";
        console.log("🔔 Powens webhook reçu:", type);
        console.dir(event, { depth: null });
      } catch (innerErr) {
        console.error("❌ Erreur traitement webhook:", innerErr);
      }
    });
  } catch (err) {
    console.error("❌ Erreur réception webhook:", err);
    res.status(200).send("OK");
  }
});

module.exports = router;

