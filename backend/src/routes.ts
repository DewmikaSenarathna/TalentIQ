import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { Job, Candidate } from "./models";
import { extractText, parseCandidate, score } from "./screening";

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 50 } });
const secret = process.env.JWT_SECRET as string;
type H = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: H) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

// ---- Auth (single recruiter account configured through env vars) ----
r.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD)
    return res.json({ token: jwt.sign({ email }, secret, { expiresIn: "12h" }) });
  res.status(401).json({ error: "Invalid email or password" });
});
r.use((req, res, next) => {
  try { jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), secret); next(); }
  catch { res.status(401).json({ error: "Unauthorized" }); }
});

// ---- Jobs ----
r.get("/jobs", h(async (_q, res) => res.json(await Job.find().sort("-createdAt"))));
r.post("/jobs", h(async (req, res) => res.status(201).json(await Job.create(req.body))));
r.delete("/jobs/:id", h(async (req, res) => { await Job.findByIdAndDelete(req.params.id); res.json({ ok: true }); }));

// ---- Bulk CV upload + AI screening ----
r.post("/candidates/upload", upload.array("files", 50), h(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  const failed: { file: string; error: string }[] = [];
  let processed = 0;
  for (let i = 0; i < files.length; i += 10) { // parse 10 at a time to protect memory
    await Promise.all(files.slice(i, i + 10).map(async (f) => {
      try {
        const text = await extractText(f.buffer, f.originalname);
        if (text.trim().length < 30) throw new Error("No readable text (scanned image?)");
        const c = parseCandidate(text, f.originalname);
        if (c.email) await Candidate.findOneAndUpdate({ email: c.email }, c, { upsert: true }); // de-duplicate by email
        else await Candidate.create(c);
        processed++;
      } catch (e) { failed.push({ file: f.originalname, error: (e as Error).message }); }
    }));
  }
  res.json({ processed, failed, total: files.length });
}));

r.get("/candidates", h(async (_q, res) => res.json(await Candidate.find().select("-text").sort("-createdAt").limit(2000))));
r.delete("/candidates/:id", h(async (req, res) => { await Candidate.findByIdAndDelete(req.params.id); res.json({ ok: true }); }));

// ---- Matching + ranking (computed on demand so edited jobs always re-score) ----
r.get("/jobs/:id/ranking", h(async (req, res) => {
  const job = await Job.findById(req.params.id).lean();
  if (!job) return res.status(404).json({ error: "Job not found" });
  const cands = await Candidate.find().lean();
  const ranked = cands
    .map((c) => ({
      _id: c._id, name: c.name, email: c.email, phone: c.phone, skills: c.skills,
      yearsExperience: c.yearsExperience, education: c.education, ...score(c, job),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x, i) => ({ ...x, rank: i + 1 }));
  res.json({ job, ranked });
}));

r.use((err: Error, _q: Request, res: Response, _n: NextFunction) => res.status(400).json({ error: err.message }));
export default r;
