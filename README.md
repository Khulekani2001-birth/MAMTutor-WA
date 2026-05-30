# 🎓 MAMTutor — WhatsApp AI Tutor

A WhatsApp chatbot that tutors Eswatini students (Grades 1–7 and Forms 1–5) using OpenAI, in both English and SiSwati.

---

## 🗺️ Architecture

```
Student's WhatsApp
      │
      ▼
  Twilio API  ◄──── webhook POST ────►  Your Server (Node.js/Express)
                                               │
                                               ▼
                                         OpenAI API (gpt-4o-mini)
```

---

## 🚀 Setup Guide (Step by Step)

### Step 1 — Get a Free Twilio Account
1. Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Sign up for a free account
3. In your Twilio Console, go to **Messaging → Try it out → Send a WhatsApp message**
4. You'll get a **sandbox number** (e.g. +1 415 523 8886)
5. Note your **Account SID** and **Auth Token** from the Console dashboard

### Step 2 — Get an OpenAI API Key
1. Go to [https://platform.openai.com](https://platform.openai.com)
2. Sign up / log in
3. Go to **API Keys** and create a new key

### Step 3 — Deploy the Server

**Option A: Render.com (Recommended)**
1. Push this repo to GitHub
2. Go to [https://render.com](https://render.com) and create a free account
3. New → Web Service → connect your GitHub repo
4. Set these environment variables in Render's dashboard:
   - `OPENAI_API_KEY` = your key
   - `TWILIO_ACCOUNT_SID` = from Twilio
   - `TWILIO_AUTH_TOKEN` = from Twilio
5. Deploy — Render gives you a URL like `https://mamtutor.onrender.com`

**Option B: Run Locally (for testing)**
```bash
npm install
cp .env.example .env
# Edit .env with your keys
npm start
# Use ngrok to expose: npx ngrok http 3000
```

### Step 4 — Connect Twilio to Your Server
1. In Twilio Console → Messaging → Sandbox Settings
2. Set **"When a message comes in"** to:
   ```
   https://mamtutor.onrender.com/webhook
   ```
   (POST method)
3. Save

### Step 5 — Test It!
1. Join the sandbox by sending the join code to the Twilio number via WhatsApp
2. Then send: **"Grade 5"** or **"Form 3"**
3. Ask a question and watch the magic! ✨

---

## 💬 How the Bot Works

```
Student: "Grade 5"
Bot:     "✅ Got it! You're in Grade 5. Ask me anything..."

Student: "what is photosynthesis"
Bot:     "Great question! 🌱 Photosynthesis is how plants make their own food using sunlight..."

Student: "ngicela ukhulume ngeSiSwati"
Bot:     "Kulungile! 😊 Photosynthesis kusho indlela tihlahla letenta ngayo kudla kwazo..."

Student: "Quiz me on fractions"
Bot:     "Let's go! 🎯 Question 1: What is 1/2 + 1/4?"
```

---

## 📁 File Structure

```
mamtutor/
├── src/
│   ├── server.js      # Express webhook server (main entry)
│   ├── tutor.js       # AI system prompt builder
│   └── sessions.js    # In-memory session store (24hr TTL)
├── package.json
├── .env.example
└── README.md
```

---

## 🔧 Scaling Up (When You're Ready)

| Feature | How |
|---|---|
| Persist sessions across restarts | Replace `sessions.js` with Redis (Upstash free tier) |
| Support images (diagrams) | Add Twilio media handling + OpenAI vision |
| Analytics dashboard | Add logging to a database |
| Production WhatsApp number | Apply for Meta WhatsApp Business API |
| Rate limiting | Add per-user message limits |
| Uptime on free tier | Add UptimeRobot ping to `/health` every 5 min |

---

## 📞 Getting a Real WhatsApp Business Number (Production)

Once you're ready to go live beyond the sandbox:
1. Apply at [Meta Business Manager](https://business.facebook.com)
2. Or use **Twilio's WhatsApp Business Profile** (easiest path)
3. You'll need: a business name, website (`mamtutor.com`), and phone number
4. Approval takes 1–7 days

---

## 🇸🇿 Built for Eswatini
- Aligned with ECOS curriculum (EGCSE, JC, PSLE)
- English + SiSwati bilingual
- Local context in examples (Emalangeni, local places, culture)
- Works on basic Android smartphones with WhatsApp
