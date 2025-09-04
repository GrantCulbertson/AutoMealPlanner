const OpenAI = require('openai');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

function getExistingMeals() {
  try {
    const plansPath = path.join(__dirname, '..', 'data', 'plans.json');
    const plansData = fs.readFileSync(plansPath, 'utf8');
    const plans = JSON.parse(plansData);
    
    const existingMeals = new Set();
    plans.forEach(plan => {
      if (plan.plan && plan.plan.weekly_plan) {
        plan.plan.weekly_plan.forEach(day => {
          if (day.meals) {
            day.meals.forEach(meal => {
              if (meal.title) {
                existingMeals.add(meal.title.toLowerCase().trim());
              }
            });
          }
        });
      }
    });
    
    return Array.from(existingMeals);
  } catch (error) {
    console.log('Could not read existing plans:', error.message);
    return [];
  }
}

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
    complexity,
    selectedMealTypes
  } = input;

  // Get existing meals to avoid repetition
  const existingMeals = getExistingMeals();
  const existingMealsText = existingMeals.length > 0 ? 
    `\nAVOID THESE EXISTING MEALS: ${existingMeals.join(', ')} - Create NEW and DIFFERENT meals` : 
    '';

  // Determine which meals to include based on selection
  const mealTypes = selectedMealTypes && selectedMealTypes.length > 0 ? selectedMealTypes : ['breakfast', 'lunch', 'dinner'];
  const mealTypeText = mealTypes.join(', ');
  
  return [
    'You are an expert meal planner and budget-conscious chef who creates personalized meal plans.',
    `Create a one-week plan (7 days) with ${mealTypeText} only.`,
    'Return JSON with keys: grocery_list (array), weekly_plan (array of 7 days), totalEstimatedCost (number).',
    '',
    'GROCERY LIST FORMAT:',
    'Each item should be an object with:',
    '- item: Item name (e.g., "chicken breast", "brown rice")',
    '- quantity: Amount needed (e.g., "2 lb", "1 dozen")',
    '- estimatedCost: Estimated price in USD based on the specified store and location',
    '',
    'WEEKLY PLAN FORMAT:',
    `For each day, include a "meals" array with ${mealTypes.length} meal objects (${mealTypeText}):`,
    '- title: Recipe name',
    '- category: Food category/cuisine type (e.g., "Mexican", "Asian", "Italian", "Mediterranean", "American", "Scandinavian")',
    '- instructions: Detailed step-by-step cooking instructions (2-4 sentences)',
    '- recipeLink: URL to a verified, working recipe (ONLY include if you can confirm the link works)',
    '- Include cooking times, temperatures, and key techniques',
    '- Reference popular recipe sources like AllRecipes, Food Network, Bon Appétit, Serious Eats when possible',
    '',
    'CRITICAL REQUIREMENTS:',
    `- FAVORITE CUISINE CATEGORIES: ${favoriteCategories || 'None specified'} - MANDATORY: At least 70% of meals MUST be from these categories`,
    `- COOKING PREFERENCES: ${cookingNotes || 'No specific preferences'} - FOLLOW these preferences exactly`,
    `- KITCHEN TOOLS AVAILABLE: ${kitchenTools || 'Standard kitchen tools'} - ONLY use these tools`,
    `- KITCHEN APPLIANCES: ${kitchenAppliances || 'Standard appliances'} - Leverage these appliances`,
    `- COMPLEXITY LEVEL: ${complexity || 3} (1=very simple, 5=complex) - Match this exactly`,
    `- LOCATION: ${location || 'N/A'} - Use this for accurate cost estimation`,
    `- GROCERY STORE: ${groceryStore || 'N/A'} - Research typical prices at this store`,
    `- BUDGET: $${weeklyBudgetUsd || 'N/A'} - Stay within this budget`,
    `- DIETARY FOCUS: ${mealsRequested || 'General balanced meals'}`,
    `- MEAL TYPES: Only include ${mealTypeText} - do not include other meal types`,
    '',
    'FOOD CATEGORY PRIORITIZATION:',
    `- PRIMARY FOCUS: ${favoriteCategories || 'None specified'} - These should dominate your meal selection`,
    '- For each meal, assign a clear category that matches the user preferences',
    '- If user likes "Mexican, Asian, Italian, Scandinavian", ensure most meals fall into these categories',
    '- Only include other cuisines if absolutely necessary for variety',
    '- Each meal must have a "category" field indicating its cuisine type',
    '',
    'COST ESTIMATION:',
    '- Research typical prices at the specified grocery store in the given location',
    '- Provide realistic cost estimates for each ingredient',
    '- Ensure total cost stays within the weekly budget',
    '- Consider seasonal pricing and store-specific pricing',
    '',
    'RECIPE SOURCING - CRITICAL:',
    '- DO NOT generate fake or made-up recipe URLs',
    '- ONLY include recipeLink if you can provide a REAL, VERIFIED URL that actually exists',
    '- Use these trusted recipe sites: AllRecipes.com, FoodNetwork.com, BonAppetit.com, SeriousEats.com, BBCGoodFood.com',
    '- Search for popular, well-known recipes with these exact patterns:',
    '  * AllRecipes: https://www.allrecipes.com/recipe/[NUMBER]/[SLUG]/',
    '  * Food Network: https://www.foodnetwork.com/recipes/[CHEF]/[RECIPE-NAME]-[NUMBER]',
    '  * Bon Appétit: https://www.bonappetit.com/recipe/[RECIPE-NAME]',
    '  * Serious Eats: https://www.seriouseats.com/[RECIPE-NAME]-recipe',
    '- If you cannot find a verified working recipe, OMIT the recipeLink field completely',
    '- NEVER guess URLs or use placeholder links',
    '- Focus on classic, popular recipes that are guaranteed to exist',
    '',
    'MEAL PLANNING STRATEGY:',
    '- MANDATORY: At least 70% of meals must be from the favorite cuisine categories',
    '- Follow cooking notes preferences (cooking time, pan usage, etc.)',
    '- Use ingredients across multiple meals to reduce waste and cost',
    '- Ensure meals can be prepared with available kitchen tools and appliances',
    '- Match the complexity level exactly',
    '- Only plan for the selected meal types',
    '- Create VARIETY: Avoid repeating meals from previous plans',
    existingMealsText,
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

function mockPlan(selectedMealTypes = ['breakfast', 'lunch', 'dinner']) {
  const mealTypes = selectedMealTypes && selectedMealTypes.length > 0 ? selectedMealTypes : ['breakfast', 'lunch', 'dinner'];
  const existingMeals = getExistingMeals();
  
  const mealTemplates = {
    breakfast: [
      { title: 'Overnight oats with banana', category: 'American', instructions: 'Combine oats, milk, and sliced banana; refrigerate overnight.' },
      { title: 'Greek yogurt parfait', category: 'Mediterranean', instructions: 'Layer yogurt with granola and fresh berries.' },
      { title: 'Scrambled eggs with herbs', category: 'American', instructions: 'Whisk eggs with herbs and cook gently in butter.' }
    ],
    lunch: [
      { title: 'Chicken rice bowl', category: 'Asian', instructions: 'Grill chicken; serve over rice with steamed broccoli.' },
      { title: 'Mediterranean wrap', category: 'Mediterranean', instructions: 'Fill tortilla with hummus, vegetables, and feta cheese.' },
      { title: 'Asian noodle salad', category: 'Asian', instructions: 'Toss noodles with vegetables and sesame dressing.' }
    ],
    dinner: [
      { title: 'Tomato pasta with beans', category: 'Italian', instructions: 'Cook pasta; simmer tomatoes and beans; combine.' },
      { title: 'Mexican chicken tacos', category: 'Mexican', instructions: 'Season chicken with spices; serve in tortillas with toppings.' },
      { title: 'Scandinavian salmon', category: 'Scandinavian', instructions: 'Bake salmon with dill and lemon; serve with potatoes.' }
    ]
  };

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
      meals: mealTypes.map(mealType => {
        const templates = mealTemplates[mealType] || [];
        // Filter out existing meals
        const availableTemplates = templates.filter(template => 
          !existingMeals.includes(template.title.toLowerCase().trim())
        );
        
        if (availableTemplates.length > 0) {
          return availableTemplates[i % availableTemplates.length];
        } else {
          // If all templates are used, create a new one
          return {
            title: `${mealType} meal variation ${i + 1}`,
            category: 'General',
            instructions: `Prepare a simple ${mealType} meal with available ingredients.`,
            recipeLink: ''
          };
        }
      })
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
    plan = mockPlan(input.selectedMealTypes);
  }

  return plan;
}

module.exports = { generateMealPlan };

