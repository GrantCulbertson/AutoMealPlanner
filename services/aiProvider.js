const OpenAI = require('openai');
const Groq = require('groq-sdk');

function buildPrompt(input) {
  const {
    location,
    groceryStore,
    weeklyBudgetUsd,
    mealsRequested,
    kitchenTools,
    favoriteCategories,
    complexity
  } = input;

  return [
    'You are an expert meal planner and budget-conscious chef.',
    'Create a one-week plan (7 days) with breakfast, lunch, dinner.',
    'Return JSON with keys: grocery_list (array), weekly_plan (array of 7 days).',
    'For each day include breakfast, lunch, dinner with recipe titles and brief instructions.',
    'Optimize to shop at the specified store and stay within the weekly budget.',
    'Use ingredients across multiple meals to reduce waste.',
    'Respect dietary preferences and available tools; keep complexity within the rating.',
    '',
    `Location: ${location || 'N/A'}`,
    `Grocery store: ${groceryStore || 'N/A'}`,
    `Weekly budget (USD): ${weeklyBudgetUsd || 'N/A'}`,
    `Meals requested: ${mealsRequested || 'General balanced meals'}`,
    `Kitchen tools: ${kitchenTools || 'Standard kitchen tools'}`,
    `Favorite categories: ${favoriteCategories || 'None specified'}`,
    `Complexity rating (1-5): ${complexity || 3}`,
    '',
    'Return ONLY minified JSON. Do not include markdown or commentary.'
  ].join('\n');
}

async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const groq = new Groq({ apiKey });
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: 'You output strict minified JSON only.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4,
    max_tokens: 2048
  });
  const text = response.choices?.[0]?.message?.content?.trim();
  return text || null;
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You output strict minified JSON only.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4,
    max_tokens: 2048
  });
  const text = response.choices?.[0]?.message?.content?.trim();
  return text || null;
}

function mockPlan() {
  return {
    grocery_list: [
      { item: 'Chicken breast', quantity: '6 pieces' },
      { item: 'Brown rice', quantity: '2 lb' },
      { item: 'Broccoli', quantity: '4 heads' },
      { item: 'Eggs', quantity: '1 dozen' },
      { item: 'Oats', quantity: '1 lb' },
      { item: 'Bananas', quantity: '7' },
      { item: 'Greek yogurt', quantity: '32 oz' },
      { item: 'Tomatoes', quantity: '6' },
      { item: 'Pasta', quantity: '1 lb' },
      { item: 'Canned beans', quantity: '4 cans' }
    ],
    weekly_plan: Array.from({ length: 7 }, (_, i) => ({
      day: `Day ${i + 1}`,
      breakfast: {
        title: 'Overnight oats with banana',
        instructions: 'Combine oats, milk, and sliced banana; refrigerate.'
      },
      lunch: {
        title: 'Chicken rice bowl',
        instructions: 'Grill chicken; serve over rice with steamed broccoli.'
      },
      dinner: {
        title: 'Tomato pasta with beans',
        instructions: 'Cook pasta; simmer tomatoes and beans; combine.'
      }
    }))
  };
}

async function generateMealPlan(input) {
  const prompt = buildPrompt(input);
  let raw = null;
  try {
    raw = await callGroq(prompt);
    if (!raw) raw = await callOpenAI(prompt);
  } catch (err) {
    // ignore and fall back
  }

  let plan;
  if (raw) {
    try {
      plan = JSON.parse(raw);
    } catch (err) {
      // Attempt to recover simple JSON blocks within text
      const match = raw.match(/\{[\s\S]*\}$/);
      if (match) {
        plan = JSON.parse(match[0]);
      }
    }
  }

  if (!plan) {
    plan = mockPlan();
  }

  return plan;
}

module.exports = { generateMealPlan };

