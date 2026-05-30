/**
 * MAMTutor — WhatsApp AI Tutor
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
          `Welcome to MAMTutor! 🎓\n` +
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
    console.error("MAMTutor error:", err);
    twiml.message(
      "Sorry, I ran into a problem. Please try again in a moment. 🙏\n" +
      "Uxolo, kukhona inkinga. Zama futsi."
    );
  }

  res.type("text/xml").send(twiml.toString());
});

// ─── Landing page ─────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send(landingPage()));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", service: "MAMTutor" }));

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
    `📚 *MAMTutor Menu* — ${gradeLabel}\n\n` +
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

// ─── Landing page HTML ────────────────────────────────────────────────────────
function landingPage() {
  const JOIN_CODE = "join cast-careful";
  const TWILIO_NUMBER = "14155238886";
  const waLink = `https://wa.me/${TWILIO_NUMBER}?text=${encodeURIComponent(JOIN_CODE)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(waLink)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MAMTutor — Your WhatsApp Tutor</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f0fdf4;
      color: #1a1a1a;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
    }
    header { text-align: center; margin-bottom: 2.5rem; }
    .logo { font-size: 2.8rem; font-weight: 800; color: #16a34a; letter-spacing: -1px; }
    .logo span { color: #15803d; }
    .tagline { font-size: 1.15rem; color: #4b5563; margin-top: 0.5rem; }
    .flag { font-size: 1.5rem; }

    .card {
      background: #fff;
      border-radius: 1.25rem;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 2rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .card h2 { font-size: 1.4rem; margin-bottom: 0.5rem; }
    .card p { color: #6b7280; margin-bottom: 1.5rem; font-size: 0.95rem; line-height: 1.6; }

    .cta-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      background: #25d366;
      color: #fff;
      font-size: 1.1rem;
      font-weight: 700;
      padding: 0.85rem 2rem;
      border-radius: 3rem;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(37,211,102,0.4);
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(37,211,102,0.5); }
    .cta-btn svg { width: 24px; height: 24px; fill: #fff; }

    .divider { color: #d1d5db; margin: 1.5rem 0; font-size: 0.85rem; }

    .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
    .qr-wrap img { border-radius: 0.75rem; border: 3px solid #e5e7eb; }
    .qr-label { font-size: 0.8rem; color: #9ca3af; }

    .join-code {
      background: #f0fdf4;
      border: 1.5px dashed #16a34a;
      border-radius: 0.75rem;
      padding: 0.75rem 1.25rem;
      margin-top: 1.5rem;
      font-family: monospace;
      font-size: 1rem;
      color: #15803d;
      letter-spacing: 0.5px;
    }
    .join-code span { color: #9ca3af; font-size: 0.8rem; display: block; font-family: sans-serif; margin-bottom: 0.2rem; }

    .features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-top: 2rem;
      max-width: 480px;
      width: 100%;
    }
    .feat {
      background: #fff;
      border-radius: 1rem;
      padding: 1rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      font-size: 0.9rem;
      color: #374151;
      line-height: 1.5;
    }
    .feat .icon { font-size: 1.5rem; margin-bottom: 0.4rem; }

    footer {
      margin-top: 3rem;
      font-size: 0.8rem;
      color: #9ca3af;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">MAM<span>Tutor</span></div>
    <div class="tagline">Free AI tutoring for Eswatini students <span class="flag">🇸🇿</span></div>
  </header>

  <div class="card">
    <h2>Start learning on WhatsApp</h2>
    <p>Ask anything — Maths, Science, English, SiSwati, and more. Available for Grades 1–7 and Forms 1–5. English &amp; SiSwati. Free.</p>

    <a class="cta-btn" href="${waLink}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.118.553 4.103 1.522 5.828L.044 23.956l6.286-1.649A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-4.99-1.365l-.358-.213-3.731.978 1.001-3.641-.234-.374A9.77 9.77 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
      </svg>
      Chat on WhatsApp
    </a>

    <div class="divider">— or scan the QR code —</div>

    <div class="qr-wrap">
      <img src="${qrUrl}" alt="Scan to open WhatsApp chat" width="200" height="200" />
      <div class="qr-label">Point your camera here to open WhatsApp</div>
    </div>

    <div class="join-code">
      <span>Sandbox join code (paste into WhatsApp)</span>
      ${JOIN_CODE}
    </div>
  </div>

  <div class="features">
    <div class="feat"><div class="icon">📚</div>Grades 1–7 &amp; Forms 1–5, fully ECOS-aligned</div>
    <div class="feat"><div class="icon">🗣️</div>English &amp; SiSwati — switch anytime</div>
    <div class="feat"><div class="icon">🎯</div>Quiz mode, homework help, step-by-step explanations</div>
    <div class="feat"><div class="icon">📱</div>Works on any phone with WhatsApp — no app to install</div>
  </div>

  <footer>
    &copy; ${new Date().getFullYear()} MAMTutor &mdash; Built for Eswatini students 🇸🇿
  </footer>
</body>
</html>`;
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ MAMTutor running on port ${PORT}`));
