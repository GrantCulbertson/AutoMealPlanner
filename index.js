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
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(PLANS_FILE)) {
  fs.writeFileSync(PLANS_FILE, '[]', 'utf-8');
}
if (!fs.existsSync(PROFILE_FILE)) {
  fs.writeFileSync(PROFILE_FILE, '{}', 'utf-8');
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
  try {
    // Write to a temporary file first, then rename to avoid partial writes
    const tempFile = PLANS_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(plans, null, 2), 'utf-8');
    fs.renameSync(tempFile, PLANS_FILE);
  } catch (err) {
    console.error('Error writing plans:', err);
    throw err;
  }
}

function readProfile() {
  try {
    const content = fs.readFileSync(PROFILE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return {};
  }
}

function writeProfile(profile) {
  try {
    // Write to a temporary file first, then rename to avoid partial writes
    const tempFile = PROFILE_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(profile, null, 2), 'utf-8');
    fs.renameSync(tempFile, PROFILE_FILE);
  } catch (err) {
    console.error('Error writing profile:', err);
    throw err;
  }
}

// Routes
app.get('/', (req, res) => {
  const message = req.query.error || null;
  res.render('index', { title: 'AutoMeal Planner', message });
});

app.post('/generate', async (req, res) => {
  const profile = readProfile();
  
  // Check if profile has required fields
  if (!profile.location || !profile.groceryStore || !profile.weeklyBudgetUsd) {
    return res.redirect('/?error=Please complete your profile first with location, grocery store, and budget.');
  }
  
  const formInput = {
    location: profile.location,
    groceryStore: profile.groceryStore,
    weeklyBudgetUsd: profile.weeklyBudgetUsd,
    mealsRequested: profile.mealsRequested || '',
    kitchenTools: profile.kitchenTools || '',
    kitchenAppliances: profile.kitchenAppliances || '',
    cookingNotes: profile.cookingNotes || '',
    favoriteCategories: profile.favoriteCategories || '',
    complexity: profile.complexity || 3,
    selectedMealTypes: profile.selectedMealTypes || ['breakfast', 'lunch', 'dinner']
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
    // Fallback to redirecting with error message
    res.redirect('/?error=There was an error generating your plan. Please try again.');
  }
});

app.get('/plans', (req, res) => {
  const plans = readPlans();
  const message = req.query.message || null;
  const error = req.query.error || null;
  res.render('plans', { title: 'Your Weekly Plans', plans, message, error });
});

app.get('/profile', (req, res) => {
  const profile = readProfile();
  const message = req.query.message || null;
  res.render('profile', { title: 'Kitchen Profile', profile, message });
});

app.post('/profile', (req, res) => {
  const profileData = {
    location: (req.body.location || '').trim(),
    groceryStore: (req.body.groceryStore || '').trim(),
    weeklyBudgetUsd: Number(req.body.weeklyBudgetUsd || 0),
    mealsRequested: (req.body.mealsRequested || '').trim(),
    favoriteCategories: (req.body.favoriteCategories || '').trim(),
    complexity: Number(req.body.complexity || 3),
    kitchenTools: (req.body.kitchenTools || '').trim(),
    kitchenAppliances: (req.body.kitchenAppliances || '').trim(),
    cookingNotes: (req.body.cookingNotes || '').trim(),
    selectedMealTypes: Array.isArray(req.body.selectedMealTypes) ? req.body.selectedMealTypes : (req.body.selectedMealTypes ? [req.body.selectedMealTypes] : ['breakfast', 'lunch', 'dinner'])
  };
  
  writeProfile(profileData);
  res.redirect('/profile?message=Profile saved successfully!');
});

app.post('/delete-plan/:id', (req, res) => {
  try {
    const plans = readPlans();
    const planId = req.params.id;
    const filteredPlans = plans.filter(plan => plan.id !== planId);
    
    if (filteredPlans.length === plans.length) {
      return res.redirect('/plans?error=Plan not found');
    }
    
    writePlans(filteredPlans);
    res.redirect('/plans?message=Plan deleted successfully');
  } catch (error) {
    res.redirect('/plans?error=Error deleting plan');
  }
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

