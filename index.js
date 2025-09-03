const path = require('path');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const { generateMealPlan } = require('./services/aiProvider');

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
const PLANS_FILE = path.join(DATA_DIR, 'plans.json');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(PLANS_FILE)) {
  fs.writeFileSync(PLANS_FILE, '[]', 'utf-8');
}

// Express setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Helper to read and write plans
function readPlans() {
  try {
    const content = fs.readFileSync(PLANS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return [];
  }
}

function writePlans(plans) {
  fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2), 'utf-8');
}

// Routes
app.get('/', (req, res) => {
  res.render('index', { title: 'AutoMeal Planner', message: null });
});

app.post('/generate', async (req, res) => {
  const formInput = {
    location: (req.body.location || '').trim(),
    groceryStore: (req.body.groceryStore || '').trim(),
    weeklyBudgetUsd: Number(req.body.weeklyBudgetUsd || 0),
    mealsRequested: (req.body.mealsRequested || '').trim(),
    kitchenTools: (req.body.kitchenTools || '').trim(),
    favoriteCategories: (req.body.favoriteCategories || '').trim(),
    complexity: Number(req.body.complexity || 3)
  };

  try {
    const plan = await generateMealPlan(formInput);
    const plans = readPlans();
    const newEntry = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      input: formInput,
      plan
    };
    plans.unshift(newEntry);
    writePlans(plans);
    res.redirect('/plans');
  } catch (error) {
    // Fallback to rendering form with error message
    res.status(500).render('index', {
      title: 'AutoMeal Planner',
      message: 'There was an error generating your plan. Please try again.'
    });
  }
});

app.get('/plans', (req, res) => {
  const plans = readPlans();
  res.render('plans', { title: 'Your Weekly Plans', plans });
});

// Start server
const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});

// Optional: start a localtunnel and write URL to file for discovery
async function startTunnelIfEnabled() {
  if (process.env.ENABLE_TUNNEL !== 'true') {
    return;
  }
  try {
    // Import localtunnel lazily to avoid requiring it in production where not needed
    // eslint-disable-next-line global-require
    const localtunnel = require('localtunnel');
    const subdomain = process.env.TUNNEL_SUBDOMAIN || undefined;
    const tunnel = await localtunnel({ port: PORT, subdomain });
    const url = tunnel.url;
    const urlFile = path.join(__dirname, 'tunnel-url.txt');
    fs.writeFileSync(urlFile, url, 'utf-8');
    // eslint-disable-next-line no-console
    console.log(`Tunnel started at ${url}`);
    tunnel.on('close', () => {
      // eslint-disable-next-line no-console
      console.log('Tunnel closed');
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to start tunnel', err.message);
  }
}

startTunnelIfEnabled();

module.exports = { app, server };

