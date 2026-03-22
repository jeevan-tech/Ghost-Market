# 👻 Ghost Market

**Ghost Market** is a synthetic audience sandbox powered by **Google Gemini**. It allows you to test websites, mockups, and landing pages with hundreds of autonomous AI agents before launching to the real world.

## The Problem
Launching ad campaigns or new startup landing pages without user testing is expensive and risky. Real user testing takes weeks and costs thousands of dollars. You need to know if your copy lands, if your checkout funnel works, and if people will actually buy your product.

## The Solution
Drop in a URL. Instantly deploy a swarm of up to 100 autonomous AI "Ghost Consumers." Watch them browse your site, argue about your value proposition, scroll through your pages, and decide whether to convert or bounce in real-time.

## 🚀 Powered by Google Cloud & Gemini
Ghost Market heavily utilizes the Google Cloud ecosystem to bring this complex orchestration to life:

- **Google Gemini 2.0 Flash:** Serves as the high-speed, reasoning "brain" for every single agent. Real-time thought processing, persona adoption, and decision making (read, scroll, click, buy, bounce) are strictly driven by the `google-generativeai` SDK.
- **AI Analyst Reports (Gemini):** Once a swarm completes its run, Gemini synthesizes the entire SQLite database of agent actions into a beautiful, actionable Markdown report detailing UX flaws, persona mismatches, and copy recommendations.

## 🛠 Tech Stack
- **AI Engine:** Google Gemini (`google-generativeai`), Python, Playwright (headless browser navigation).
- **Concurrency:** Python `Multiprocessing` / ThreadPoolExecutor for scaling up to 100 simultaneous browsers.
- **Frontend Dashboard:** Next.js, React, Tailwind CSS, Lucide Icons.
- **Real-Time Data:** Server-Sent Events (SSE) stream AI thoughts directly to the live ticker.
- **Database:** SQLite (Stores every click, scroll, and Gemini thought process).

## 🏃‍♂️ How to Run the Demo Locally

Ensure you have your Gemini API key ready and placed in the `.env` file of the `engine` directory as `GEMINI_API_KEY=your_key_here`.

### 1. Start the Python Engine
```bash
cd engine
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python api.py
```
*The engine runs on http://localhost:8000*

### 2. Start the Next.js Dashboard
```bash
cd dashboard
npm install
npm run dev
```
*The dashboard runs on http://localhost:3000*

## 💡 Using the Sandbox
1. Open the dashboard at `http://localhost:3000`.
2. Enter a target URL (e.g., `https://stripe.com` or your own startup).
3. Select your desired Swarm Size (Small, Medium, or Large).
4. Click **Run Simulation**.
5. Watch the Live Agent Ticker as **Google Gemini** powers the agents to read the DOM via Playwright, make decisions, and either bounce or convert.
6. Review the beautiful generated charts and the final AI Analyst Report.
