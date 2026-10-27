import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import api from "./routes";

const app = express();
// CLIENT_URL = comma-separated list of allowed frontend origins (your Vercel URL)
const origins = (process.env.CLIENT_URL || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : false }));
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.send("ok")); // Render health check
app.use("/api", api);

const port = Number(process.env.PORT) || 10000;
mongoose
  .connect(process.env.MONGODB_URI as string)
  .then(() => app.listen(port, () => console.log(`TalentIQ API listening on ${port}`)))
  .catch((e) => { console.error("Mongo connection failed", e); process.exit(1); });
