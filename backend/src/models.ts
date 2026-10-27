import { Schema, model } from "mongoose";

export const Job = model("Job", new Schema({
  title: { type: String, required: true },
  description: { type: String, default: "" },
  requiredSkills: [String],
  minYears: { type: Number, default: 0 },
}, { timestamps: true }));

export const Candidate = model("Candidate", new Schema({
  name: String,
  email: { type: String, index: true },
  phone: String,
  skills: [String],
  yearsExperience: { type: Number, default: 0 },
  education: String,
  fileName: String,
  text: String, // raw resume text (capped) so any job can be matched later
}, { timestamps: true }));
