const mongoose = require("mongoose");

const historyUploadSchema = new mongoose.Schema(
  {
    caseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    personName: {
      type: String,
      default: "",
      trim: true,
    },
    age: {
      type: Number,
      default: null,
    },
    gender: {
      type: String,
      enum: ["male", "female", "unknown"],
      default: "unknown",
    },
    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    imageFilename: {
      type: String,
      default: "",
      trim: true,
    },
    videoUrl: {
      type: String,
      default: "",
      trim: true,
    },
    videoFilename: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "historyUploads",
  },
);

historyUploadSchema.pre("save", function preSave(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.HistoryUpload || mongoose.model("HistoryUpload", historyUploadSchema);
