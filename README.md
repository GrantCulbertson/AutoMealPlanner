# AutoMealPlanner
AutoMeal Planner: Node.js + Express + EJS web app that generates budget-conscious weekly grocery lists and meal plans using Groq or OpenAI. If no API key is configured, a realistic mock is used.

## Quick start

1. Copy environment config

```
cp .env.example .env
```

2. (Optional) Add `GROQ_API_KEY` or `OPENAI_API_KEY` to `.env`.

3. Start the app

```
npm run dev
```

4. Open the app at `http://localhost:3000`.
   - If `ENABLE_TUNNEL=true`, a public URL is written to `tunnel-url.txt` and printed in the console.

## Scripts

- `npm start` – start server
- `npm run dev` – start with nodemon and localtunnel enabled

## Tech decisions

- Express + EJS keeps things simple and server-rendered, no client-side build step.
- Bootstrap for quick, modern UI with custom sage green and dark gray palette.
- AI provider picks Groq first (usually lower cost), then OpenAI; both are optional.
- JSON file storage for demo persistence.
