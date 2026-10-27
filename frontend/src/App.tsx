import { useEffect, useState } from "react";
import { api, getToken } from "./api";

type Job = { _id: string; title: string; description: string; requiredSkills: string[]; minYears: number };
type Ranked = {
  _id: string; rank: number; score: number; name: string; email: string; education: string;
  yearsExperience: number; matched: string[]; missing: string[]; skills: string[];
};
type Tab = "jobs" | "upload" | "ranking";

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [err, setErr] = useState("");
  const submit = async () => {
    try {
      const r = await api<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      localStorage.setItem("tiq_token", r.token); onDone();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="card login">
      <img src="/logo.png" alt="TalentIQ" width={130} />
      <h2>Recruiter sign in</h2>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password}
        onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <button onClick={submit}>Sign in</button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function Jobs({ jobs, reload, open }: { jobs: Job[]; reload: () => void; open: (id: string) => void }) {
  const empty = { title: "", description: "", skills: "", minYears: 0 };
  const [f, setF] = useState(empty);
  const add = async () => {
    if (!f.title.trim()) return;
    await api("/jobs", { method: "POST", body: JSON.stringify({
      title: f.title, description: f.description, minYears: f.minYears,
      requiredSkills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
    }) });
    setF(empty); reload();
  };
  return (
    <div className="grid2">
      <div className="card">
        <h3>New job</h3>
        <input placeholder="Job title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea rows={5} placeholder="Job description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <input placeholder="Required skills (comma separated) e.g. React, TypeScript, SQL" value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} />
        <label>Minimum years of experience
          <input type="number" min={0} value={f.minYears} onChange={(e) => setF({ ...f, minYears: +e.target.value })} /></label>
        <button onClick={add}>Create job</button>
      </div>
      <div className="card">
        <h3>Open positions ({jobs.length})</h3>
        {jobs.length === 0 && <p className="muted">No jobs yet. Create one to start matching.</p>}
        {jobs.map((j) => (
          <div className="row" key={j._id}>
            <div><strong>{j.title}</strong>
              <div className="chips">{j.requiredSkills.map((s) => <span key={s} className="chip">{s}</span>)}</div></div>
            <div className="actions">
              <button onClick={() => open(j._id)}>Rank</button>
              <button className="ghost" onClick={async () => { await api("/jobs/" + j._id, { method: "DELETE" }); reload(); }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Upload() {
  const [files, setFiles] = useState<File[]>([]), [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0), [ok, setOk] = useState(0), [fails, setFails] = useState<string[]>([]);
  const go = async () => {
    setBusy(true); setDone(0); setOk(0); setFails([]);
    let good = 0; const bad: string[] = [];
    for (let i = 0; i < files.length; i += 25) { // 25 CVs per request keeps the server light
      const fd = new FormData();
      files.slice(i, i + 25).forEach((f) => fd.append("files", f));
      try {
        const r = await api<{ processed: number; failed: { file: string; error: string }[] }>("/candidates/upload", { method: "POST", body: fd });
        good += r.processed; r.failed.forEach((x) => bad.push(`${x.file}: ${x.error}`));
      } catch (e) { bad.push(`Batch ${i / 25 + 1}: ${(e as Error).message}`); }
      setDone(Math.min(files.length, i + 25)); setOk(good); setFails([...bad]);
    }
    setBusy(false);
  };
  return (
    <div className="card">
      <h3>Bulk CV upload</h3>
      <p className="muted">Select hundreds of PDF, DOCX or TXT resumes at once. Each CV is screened automatically.</p>
      <input type="file" multiple accept=".pdf,.docx,.txt" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
      <button disabled={!files.length || busy} onClick={go}>{busy ? "Screening…" : `Upload & screen ${files.length} CVs`}</button>
      {files.length > 0 && <div className="bar"><div style={{ width: (done / files.length) * 100 + "%" }} /></div>}
      {(done > 0 || busy) && <p>{ok} screened successfully · {done}/{files.length} processed</p>}
      {fails.length > 0 && <details open><summary>{fails.length} failed</summary><ul>{fails.map((f) => <li key={f}>{f}</li>)}</ul></details>}
    </div>
  );
}

function Ranking({ jobs, jobId, setJobId }: { jobs: Job[]; jobId: string; setJobId: (s: string) => void }) {
  const [rows, setRows] = useState<Ranked[]>([]), [loading, setLoading] = useState(false), [q, setQ] = useState("");
  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    api<{ ranked: Ranked[] }>("/jobs/" + jobId + "/ranking").then((r) => setRows(r.ranked)).finally(() => setLoading(false));
  }, [jobId]);
  const shown = rows.filter((r) => (r.name + r.skills.join(" ")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card">
      <div className="toolbar">
        <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">Select a job…</option>
          {jobs.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
        </select>
        <input placeholder="Filter by name or skill" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? <p>Ranking candidates…</p> : (
        <div className="scroll"><table>
          <thead><tr><th>#</th><th>Candidate</th><th>Match</th><th>Experience</th><th>Matched skills</th><th>Missing</th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r._id}>
              <td>{r.rank}</td>
              <td><strong>{r.name}</strong><div className="muted">{r.email} · {r.education}</div></td>
              <td><span className={"score " + (r.score >= 70 ? "hi" : r.score >= 40 ? "mid" : "lo")}>{r.score}%</span></td>
              <td>{r.yearsExperience} yrs</td>
              <td>{r.matched.map((s) => <span key={s} className="chip ok">{s}</span>)}</td>
              <td>{r.missing.map((s) => <span key={s} className="chip no">{s}</span>)}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      {!loading && jobId && shown.length === 0 && <p className="muted">No candidates yet. Upload CVs first.</p>}
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!getToken()), [tab, setTab] = useState<Tab>("jobs");
  const [jobs, setJobs] = useState<Job[]>([]), [jobId, setJobId] = useState("");
  const reload = () => api<Job[]>("/jobs").then((j) => { setJobs(j); if (!jobId && j[0]) setJobId(j[0]._id); }).catch(() => {});
  useEffect(() => { if (authed) reload(); }, [authed]);

  return (
    <div className="app">
      <header>
        <div className="brand"><img src="/logo.png" alt="TalentIQ" /><span>TalentIQ</span></div>
        {authed && <nav>
          {(["jobs", "upload", "ranking"] as Tab[]).map((t) =>
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "jobs" ? "Jobs" : t === "upload" ? "Upload CVs" : "Ranking"}</button>)}
          <button className="ghost" onClick={() => { localStorage.removeItem("tiq_token"); setAuthed(false); }}>Sign out</button>
        </nav>}
      </header>
      <main>
        {!authed ? <Login onDone={() => setAuthed(true)} /> :
          tab === "jobs" ? <Jobs jobs={jobs} reload={reload} open={(id) => { setJobId(id); setTab("ranking"); }} /> :
          tab === "upload" ? <Upload /> : <Ranking jobs={jobs} jobId={jobId} setJobId={setJobId} />}
      </main>
      <footer>
        <div className="creator">
          <img src="/don.png" alt="Don Dew" />
          <div><strong>Designed &amp; built by Don Dew</strong><span>Creator of TalentIQ</span></div>
        </div>
        <small>© {new Date().getFullYear()} TalentIQ</small>
      </footer>
    </div>
  );
}
