const OpenAI = require('openai');
const Groq = require('groq-sdk');

function buildPrompt(input) {
  const {
    location,
    groceryStore,
    weeklyBudgetUsd,
    mealsRequested,
    kitchenTools,
    kitchenAppliances,
    cookingNotes,
    favoriteCategories,
    complexity
  } = input;

  return [
    'You are an expert meal planner and budget-conscious chef who creates personalized meal plans.',
    'Create a one-week plan (7 days) with breakfast, lunch, dinner.',
    'Return JSON with keys: grocery_list (array), weekly_plan (array of 7 days), totalEstimatedCost (number).',
    '',
    'GROCERY LIST FORMAT:',
    'Each item should be an object with:',
    '- item: Item name (e.g., "chicken breast", "brown rice")',
    '- quantity: Amount needed (e.g., "2 lb", "1 dozen")',
    '- estimatedCost: Estimated price in USD based on the specified store and location',
    '',
    'WEEKLY PLAN FORMAT:',
    'For each day, include a "meals" array with 3 meal objects (breakfast, lunch, dinner):',
    '- title: Recipe name',
    '- instructions: Detailed step-by-step cooking instructions (2-4 sentences)',
    '- recipeLink: URL to the original recipe when available (optional)',
    '- Include cooking times, temperatures, and key techniques',
    '- Reference popular recipe sources like AllRecipes, Food Network, Bon Appétit, Serious Eats when possible',
    '',
    'CRITICAL REQUIREMENTS:',
    `- FAVORITE CUISINE CATEGORIES: ${favoriteCategories || 'None specified'} - PRIORITIZE these cuisines heavily in your meal selection`,
    `- COOKING PREFERENCES: ${cookingNotes || 'No specific preferences'} - FOLLOW these preferences exactly`,
    `- KITCHEN TOOLS AVAILABLE: ${kitchenTools || 'Standard kitchen tools'} - ONLY use these tools`,
    `- KITCHEN APPLIANCES: ${kitchenAppliances || 'Standard appliances'} - Leverage these appliances`,
    `- COMPLEXITY LEVEL: ${complexity || 3} (1=very simple, 5=complex) - Match this exactly`,
    `- LOCATION: ${location || 'N/A'} - Use this for accurate cost estimation`,
    `- GROCERY STORE: ${groceryStore || 'N/A'} - Research typical prices at this store`,
    `- BUDGET: $${weeklyBudgetUsd || 'N/A'} - Stay within this budget`,
    `- DIETARY FOCUS: ${mealsRequested || 'General balanced meals'}`,
    '',
    'COST ESTIMATION:',
    '- Research typical prices at the specified grocery store in the given location',
    '- Provide realistic cost estimates for each ingredient',
    '- Ensure total cost stays within the weekly budget',
    '- Consider seasonal pricing and store-specific pricing',
    '',
    'RECIPE SOURCING:',
    '- When possible, provide links to well-known recipe websites',
    '- Focus on recipes from reputable sources (AllRecipes, Food Network, etc.)',
    '- If no specific recipe exists, create original instructions but note this',
    '',
    'MEAL PLANNING STRATEGY:',
    '- Heavily emphasize the favorite cuisine categories in meal selection',
    '- Follow cooking notes preferences (cooking time, pan usage, etc.)',
    '- Use ingredients across multiple meals to reduce waste and cost',
    '- Ensure meals can be prepared with available kitchen tools and appliances',
    '- Match the complexity level exactly',
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
      { item: 'Chicken breast', quantity: '6 pieces', estimatedCost: 12.50 },
      { item: 'Brown rice', quantity: '2 lb', estimatedCost: 3.50 },
      { item: 'Broccoli', quantity: '4 heads', estimatedCost: 4.00 },
      { item: 'Eggs', quantity: '1 dozen', estimatedCost: 2.50 },
      { item: 'Oats', quantity: '1 lb', estimatedCost: 2.00 },
      { item: 'Bananas', quantity: '7', estimatedCost: 1.50 },
      { item: 'Greek yogurt', quantity: '32 oz', estimatedCost: 4.50 },
      { item: 'Tomatoes', quantity: '6', estimatedCost: 3.00 },
      { item: 'Pasta', quantity: '1 lb', estimatedCost: 1.50 },
      { item: 'Canned beans', quantity: '4 cans', estimatedCost: 3.00 }
    ],
    weekly_plan: Array.from({ length: 7 }, (_, i) => ({
      day: `Day ${i + 1}`,
      meals: [
        {
          title: 'Overnight oats with banana',
          instructions: 'Combine oats, milk, and sliced banana; refrigerate overnight.',
          recipeLink: 'https://www.allrecipes.com/recipe/overnight-oats/'
        },
        {
          title: 'Chicken rice bowl',
          instructions: 'Grill chicken; serve over rice with steamed broccoli.',
          recipeLink: 'https://www.foodnetwork.com/recipes/chicken-rice-bowl'
        },
        {
          title: 'Tomato pasta with beans',
          instructions: 'Cook pasta; simmer tomatoes and beans; combine.',
          recipeLink: 'https://www.bonappetit.com/recipe/tomato-pasta-beans'
        }
      ]
    })),
    totalEstimatedCost: 37.00
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

