const HistoryUpload = require("../models/HistoryUpload");

const cache = {
  expiresAt: 0,
  data: null,
};

function getTtlMs() {
  const parsed = Number.parseInt(process.env.CACHE_TTL_MS || "5000", 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 5000;
  }
  return parsed;
}

function invalidateCache() {
  cache.expiresAt = 0;
  cache.data = null;
}

async function upsertHistoryUpload(payload) {
  const now = new Date();
  const uploadTime = payload.uploadedAt ? new Date(payload.uploadedAt) : now;

  await HistoryUpload.findOneAndUpdate(
    { caseId: payload.caseId },
    {
      $set: {
        personName: payload.personName || "",
        age: typeof payload.age === "number" ? payload.age : null,
        gender: payload.gender || "unknown",
        imageUrl: payload.imageUrl || "",
        imageFilename: payload.imageFilename || "",
        videoUrl: payload.videoUrl || "",
        videoFilename: payload.videoFilename || "",
        status: payload.status || "pending",
        updatedAt: now,
      },
      $setOnInsert: {
        uploadedAt: uploadTime,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  invalidateCache();
}

async function listHistoryUploads() {
  const now = Date.now();
  if (cache.data && cache.expiresAt > now) {
    return cache.data;
  }

  const rows = await HistoryUpload.find({})
    .sort({ uploadedAt: -1, updatedAt: -1 })
    .limit(500)
    .lean();

  cache.data = rows;
  cache.expiresAt = now + getTtlMs();
  return rows;
}

module.exports = {
  listHistoryUploads,
  upsertHistoryUpload,
};
