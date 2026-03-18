const express = require("express");
const cors = require("cors");
const casUploadRouter = require("./routes/casUpload");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "cas-importer-backend" });
});

app.use("/api", casUploadRouter);

app.use((err, _req, res, _next) => {
  if (err?.name === "MulterError") {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  return res.status(500).json({ error: err?.message || "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`CAS importer backend running on http://localhost:${PORT}`);
});
