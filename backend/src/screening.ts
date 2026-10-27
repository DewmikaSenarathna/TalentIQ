import mammoth from "mammoth";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require("pdf-parse/lib/pdf-parse.js");

const SKILLS = ["javascript","typescript","python","java","c#","c++","go","rust","php","ruby","swift","kotlin","sql","nosql","mongodb","postgresql","mysql","redis","react","angular","vue","next.js","node.js","express","django","flask","spring","laravel",".net","html","css","tailwind","sass","graphql","rest","docker","kubernetes","aws","azure","gcp","terraform","ci/cd","jenkins","git","linux","machine learning","deep learning","nlp","tensorflow","pytorch","pandas","data analysis","power bi","tableau","excel","agile","scrum","jira","figma","ui/ux","seo","sales","marketing","recruitment","accounting","project management","communication","leadership","customer service","react native","flutter","android","ios","testing","selenium","cybersecurity"];
const STOP = new Set(["the","and","for","with","you","our","are","will","have","this","that","from","your","work","team","experience","years","ability","strong","skills","all","can","who","has","able","using","such","including","well","must","new"]);

export async function extractText(buf: Buffer, name: string): Promise<string> {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return (await pdf(buf)).text;
  if (n.endsWith(".docx")) return (await mammoth.extractRawText({ buffer: buf })).value;
  if (n.endsWith(".txt")) return buf.toString("utf8");
  throw new Error("Unsupported file type (use PDF, DOCX or TXT)");
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const hasSkill = (text: string, skill: string) =>
  new RegExp("(^|[^a-z0-9+#])" + esc(skill.toLowerCase().trim()) + "($|[^a-z0-9+#])").test(text.toLowerCase());

/** AI Resume Screening: turn raw CV text into structured candidate data. */
export function parseCandidate(text: string, fileName: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]?.toLowerCase() || "";
  const phone = text.match(/\+?\d[\d\s().-]{8,15}\d/)?.[0] || "";
  const name =
    lines.slice(0, 5).find((l) => /^[A-Za-z][A-Za-z.'-]*(\s+[A-Za-z][A-Za-z.'-]*){1,3}$/.test(l)) ||
    fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const skills = SKILLS.filter((s) => hasSkill(text, s));

  const stated = [...text.matchAll(/(\d{1,2})\+?\s*(?:years|yrs)/gi)].map((m) => +m[1]);
  const yrs = [...text.matchAll(/\b(19[9]\d|20[0-2]\d)\b/g)].map((m) => +m[1]);
  const span = yrs.length > 1 ? Math.min(40, Math.max(...yrs) - Math.min(...yrs)) : 0;
  const yearsExperience = stated.length ? Math.min(40, Math.max(...stated)) : span;

  const t = text.toLowerCase();
  const education = /ph\.?d|doctorate/.test(t) ? "PhD"
    : /master|\bm\.?sc\b|\bmba\b|m\.?tech/.test(t) ? "Master's"
    : /bachelor|\bb\.?sc\b|b\.?tech|b\.?eng/.test(t) ? "Bachelor's"
    : /diploma/.test(t) ? "Diploma" : "Not detected";

  return { name, email, phone, skills, yearsExperience, education, fileName, text: text.slice(0, 20000) };
}

const tokens = (s: string) =>
  new Set((s.toLowerCase().match(/[a-z][a-z+#]{2,}/g) || []).filter((w) => !STOP.has(w)));

/** AI Candidate-Job Matching: 60% required skills, 25% experience, 15% description keywords. */
export function score(
  c: { text?: string | null; yearsExperience?: number | null },
  job: { description?: string | null; requiredSkills?: string[]; minYears?: number | null }
) {
  const text = c.text || "";
  const req = job.requiredSkills || [];
  const matched = req.filter((s) => hasSkill(text, s));
  const missing = req.filter((s) => !matched.includes(s));
  const skillPart = req.length ? matched.length / req.length : 0.5;
  const jt = tokens(job.description || ""), ct = tokens(text);
  const kw = jt.size ? [...jt].filter((w) => ct.has(w)).length / jt.size : 0.5;
  const exp = job.minYears ? Math.min(1, (c.yearsExperience || 0) / job.minYears) : 1;
  return { score: Math.round((0.6 * skillPart + 0.25 * exp + 0.15 * kw) * 100), matched, missing };
}
