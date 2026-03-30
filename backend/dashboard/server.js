require("dotenv").config();

const cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const { connectDb } = require("./config/db");
const historyUploadsRouter = require("./routes/historyUploads");

const app = express();
const port = Number.parseInt(process.env.PORT || "4100", 10);

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/history", historyUploadsRouter);

connectDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Dashboard backend listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect MongoDB:", error);
    process.exit(1);
  });
