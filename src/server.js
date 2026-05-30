/**
 * EduBot Eswatini — WhatsApp AI Tutor
 * Stack: Node.js + Express + Twilio + OpenAI
 */

import express from "express";
import OpenAI from "openai";
import twilio from "twilio";
import { sessionStore } from "./sessions.js";
import { buildSystemPrompt } from "./tutor.js";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Twilio webhook ───────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  const from    = req.body.From;   // e.g. "whatsapp:+26876XXXXXX"
  const msgBody = (req.body.Body || "").trim();

  if (!msgBody) {
    twiml.message("Sawubona! 👋 Send any question to get started / Thumela umbuzo wakho.");
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    // 1. Load or create session
    const session = sessionStore.get(from) || { history: [], profile: null };

    // 2. Onboarding: collect grade if first message
    if (!session.profile) {
      const detected = detectGrade(msgBody);
      if (!detected) {
        twiml.message(
          `Welcome to EduBot! 🎓\n` +
          `Ngena / Enter your grade:\n\n` +
          `📚 *Primary*: Grade 1, 2, 3, 4, 5, 6, or 7\n` +
          `🏫 *High School*: Form 1, 2, 3, 4, or 5\n\n` +
          `Example: "Grade 5" or "Form 3"`
        );
        sessionStore.set(from, session);
        return res.type("text/xml").send(twiml.toString());
      }
      session.profile = detected;
      session.history = [];
      twiml.message(
        `✅ Got it! You're in *${detected.label}*.\n\n` +
        `Ask me anything — Maths, Science, English, SiSwati, History, and more!\n` +
        `Type *"menu"* anytime to change grade or see commands.`
      );
      sessionStore.set(from, session);
      return res.type("text/xml").send(twiml.toString());
    }

    // 3. Handle commands
    if (msgBody.toLowerCase() === "menu") {
      twiml.message(menuText(session.profile.label));
      return res.type("text/xml").send(twiml.toString());
    }
    if (msgBody.toLowerCase() === "reset") {
      sessionStore.delete(from);
      twiml.message("Session reset. Send your grade to start again! 🔄");
      return res.type("text/xml").send(twiml.toString());
    }
    if (msgBody.toLowerCase() === "help") {
      twiml.message(helpText());
      return res.type("text/xml").send(twiml.toString());
    }

    // 4. Add user message to history
    session.history.push({ role: "user", content: msgBody });

    // Keep last 10 turns (20 messages) to stay within context limits
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    // 5. Call OpenAI
    const systemPrompt = buildSystemPrompt(session.profile);
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",   // cheap + fast; swap to "gpt-4o" for higher quality
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        ...session.history,
      ],
    });

    const reply = response.choices[0].message.content;

    // 6. Save assistant reply to history
    session.history.push({ role: "assistant", content: reply });
    sessionStore.set(from, session);

    // 7. WhatsApp messages max 1600 chars — split if needed
    const chunks = splitMessage(reply, 1500);
    for (const chunk of chunks) {
      twiml.message(chunk);
    }

  } catch (err) {
    console.error("EduBot error:", err);
    twiml.message(
      "Sorry, I ran into a problem. Please try again in a moment. 🙏\n" +
      "Uxolo, kukhona inkinga. Zama futsi."
    );
  }

  res.type("text/xml").send(twiml.toString());
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", service: "EduBot Eswatini" }));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectGrade(text) {
  const t = text.toLowerCase().trim();

  // Primary: "grade 1" … "grade 7"
  const primaryMatch = t.match(/grade\s*([1-7])/);
  if (primaryMatch) {
    const n = parseInt(primaryMatch[1]);
    return { level: "primary", grade: n, label: `Grade ${n}` };
  }

  // High school: "form 1" … "form 5"
  const formMatch = t.match(/form\s*([1-5])/);
  if (formMatch) {
    const n = parseInt(formMatch[1]);
    return { level: "highschool", form: n, label: `Form ${n}` };
  }

  return null;
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxLen;
    // Try to break at a newline or space
    if (end < text.length) {
      const breakAt = text.lastIndexOf("\n", end) || text.lastIndexOf(" ", end);
      if (breakAt > start) end = breakAt;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

function menuText(gradeLabel) {
  return (
    `📚 *EduBot Menu* — ${gradeLabel}\n\n` +
    `• Ask any question to get help\n` +
    `• Type *"reset"* to change your grade\n` +
    `• Type *"help"* for tips on asking questions\n` +
    `• Type *"menu"* to see this again\n\n` +
    `_Subjects: Maths, Science, English, SiSwati, History, Geography, and more_`
  );
}

function helpText() {
  return (
    `💡 *Tips for better answers:*\n\n` +
    `✅ Be specific: _"How do I find the area of a triangle?"_\n` +
    `✅ Share context: _"I'm studying photosynthesis for Form 2"_\n` +
    `✅ Ask follow-ups: _"Can you give me an example?"_\n` +
    `✅ SiSwati is welcome: _"Ngicela ukhulume ngeSiSwati"_\n\n` +
    `I can also quiz you! Try: _"Quiz me on Grade 6 fractions"_ 🎯`
  );
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ EduBot running on port ${PORT}`));
