const express = require("express");
const { listHistoryUploads, upsertHistoryUpload } = require("../services/historyService");

const router = express.Router();

router.get("/uploads", async (req, res) => {
  try {
    const items = await listHistoryUploads();
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ detail: "Failed to fetch history uploads." });
  }
});

router.post("/uploads", async (req, res) => {
  const payload = req.body || {};
  if (!payload.caseId || typeof payload.caseId !== "string") {
    return res.status(400).json({ detail: "caseId is required." });
  }

  process.nextTick(() => {
    upsertHistoryUpload(payload).catch((error) => {
      console.error("History upload async write failed:", error);
    });
  });

  return res.status(202).json({ accepted: true });
});

module.exports = router;
