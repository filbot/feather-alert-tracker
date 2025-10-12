import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const BEARER_TOKEN = process.env.X_BEARER_TOKEN;
const USER_ID = process.env.USER_ID;
const TRIGGER_URL = process.env.TRIGGER_URL;

// Validate required environment variables
if (!BEARER_TOKEN || !USER_ID || !TRIGGER_URL) {
  console.error('[ERROR] Missing required environment variables:');
  if (!BEARER_TOKEN) console.error('  - X_BEARER_TOKEN');
  if (!USER_ID) console.error('  - USER_ID');
  if (!TRIGGER_URL) console.error('  - TRIGGER_URL');
  process.exit(1);
}

// ======== API Limit Calculations ========

const POLLING_START_HOUR = 8;   // 8am
const POLLING_END_HOUR = 18;    // 6pm (exclusive)

// Calculate polling interval
const POLLING_WINDOW_HOURS = POLLING_END_HOUR - POLLING_START_HOUR; // 10 hours
const WEEKDAYS_PER_MONTH = 22;
const ACTIVE_MINUTES_PER_MONTH = POLLING_WINDOW_HOURS * 60 * WEEKDAYS_PER_MONTH;

// We'll fetch 1 post per poll, so we can poll up to 100 times per 30 days
const ALLOWED_POLLS_PER_30_DAYS = 100;
const MINUTES_BETWEEN_POLLS = Math.ceil(ACTIVE_MINUTES_PER_MONTH / ALLOWED_POLLS_PER_30_DAYS);

// State tracking file
const STATE_FILE = path.join(process.cwd(), '.tracker-state.json');

console.log(`[CONFIG] Poll window: ${POLLING_START_HOUR}:00 to ${POLLING_END_HOUR}:00 (weekdays only)`);
console.log(`[CONFIG] Minutes between polls: ${MINUTES_BETWEEN_POLLS}`);

// ======== State Management ========

async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return { lastSinceId: parsed.lastSinceId || null };
  } catch {
    return { lastSinceId: null };
  }
}

async function saveState(sinceId) {
  await fs.writeFile(STATE_FILE, JSON.stringify({ lastSinceId: sinceId }, null, 2));
}

// Initialize state
let state = await loadState();
let sinceId = state.lastSinceId;

if (sinceId) {
  console.log(`[STARTUP] Resuming from tweet ID: ${sinceId}`);
} else {
  console.log(`[STARTUP] Starting fresh - will check most recent tweet`);
}

// ======== Helper Functions ========

function isWeekday(date = new Date()) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function isWithinPollingHours(date = new Date()) {
  const hour = date.getHours();
  return hour >= POLLING_START_HOUR && hour < POLLING_END_HOUR;
}

function shouldPoll(date = new Date()) {
  return isWeekday(date) && isWithinPollingHours(date);
}

// ========== Fetch Most Recent Tweet ==========

async function fetchMostRecentTweet() {
  const params = new URLSearchParams({
    max_results: '1', // Only fetch the most recent tweet
    'tweet.fields': 'id,text,created_at',
    'exclude': 'retweets,replies', // Only original tweets
  });
  
  if (sinceId) {
    params.set('since_id', sinceId);
  }

  const url = `https://api.x.com/2/users/${USER_ID}/tweets?${params}`;
  
  console.log(`[API] Checking for new tweet...`);
  
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });

  if (res.status === 429) {
    const reset = res.headers.get('x-rate-limit-reset');
    const waitMs = Math.max((reset * 1000) - Date.now(), 0);
    console.warn(`[RATE LIMIT] Rate limited. Waiting ${Math.ceil(waitMs / 1000 / 60)} minutes...`);
    await new Promise((r) => setTimeout(r, waitMs + 1000));
    return null;
  }
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[API ERROR] Status ${res.status}:`, errorText);
    return null;
  }

  const data = await res.json();
  const tweets = data.data || [];
  
  // Log rate limit info for monitoring
  const remaining = res.headers.get('x-rate-limit-remaining');
  const limit = res.headers.get('x-rate-limit-limit');
  if (remaining && limit) {
    console.log(`[RATE LIMIT] API calls remaining: ${remaining}/${limit}`);
  }
  
  return tweets.length > 0 ? tweets[0] : null;
}

async function triggerAction(tweet) {
  try {
    const res = await fetch(TRIGGER_URL);
    if (res.ok) {
      console.log(`[TRIGGERED] Successfully sent GET to ${TRIGGER_URL}`);
    } else {
      console.warn(`[TRIGGER FAILED] Status: ${res.status} - ${res.statusText}`);
    }
  } catch (err) {
    console.error(`[TRIGGER ERROR] Could not reach ${TRIGGER_URL}:`, err.message);
  }
}

// ======== Poll Function ========

async function poll() {
  try {
    const now = new Date();
    
    if (shouldPoll(now)) {
      const tweet = await fetchMostRecentTweet();
      
      if (tweet) {
        console.log(`[NEW TWEET] ${tweet.id} at ${tweet.created_at}`);
        console.log(`[CONTENT] ${tweet.text}`);
        
        // Check for feather alert
        if (tweet.text && tweet.text.toLowerCase().includes('feather alert')) {
          console.log(`[FEATHER ALERT DETECTED] Triggering webhook...`);
          await triggerAction(tweet);
        } else {
          console.log(`[NO MATCH] Tweet does not contain "feather alert"`);
        }
        
        // Update sinceId and save state
        sinceId = tweet.id;
        await saveState(sinceId);
      } else {
        console.log(`[${now.toLocaleString()}] No new tweets since last check.`);
      }
    } else {
      const reason = !isWeekday(now) ? "weekend" : "outside polling hours";
      console.log(`[${now.toLocaleString()}] Not polling (${reason}).`);
    }
  } catch (err) {
    console.error('[POLLING ERROR]', err);
  } finally {
    scheduleNextPoll();
  }
}

// ======== Scheduling ========

function scheduleNextPoll() {
  const now = new Date();
  
  if (shouldPoll(now)) {
    // Schedule next poll during active hours
    setTimeout(poll, MINUTES_BETWEEN_POLLS * 60 * 1000);
    const nextPoll = new Date(now.getTime() + MINUTES_BETWEEN_POLLS * 60 * 1000);
    console.log(`[${now.toLocaleString()}] Next poll: ${nextPoll.toLocaleString()}`);
  } else {
    // Calculate next valid polling time
    let next = new Date(now);
    
    if (isWeekday(now)) {
      if (now.getHours() < POLLING_START_HOUR) {
        // Same day at 8am
        next.setHours(POLLING_START_HOUR, 0, 0, 0);
      } else {
        // Next day at 8am
        next.setDate(next.getDate() + 1);
        next.setHours(POLLING_START_HOUR, 0, 0, 0);
      }
    } else {
      // It's weekend, find next Monday at 8am
      next.setHours(POLLING_START_HOUR, 0, 0, 0);
      const daysUntilMonday = (8 - next.getDay()) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
    }
    
    // Ensure it's a weekday
    while (!isWeekday(next)) {
      next.setDate(next.getDate() + 1);
    }
    
    const msUntilNext = next - now;
    setTimeout(poll, msUntilNext);
    const h = Math.floor(msUntilNext / 1000 / 60 / 60);
    const m = Math.floor((msUntilNext / 1000 / 60) % 60);
    console.log(`[${now.toLocaleString()}] Waiting ${h}h ${m}m until next polling window (${next.toLocaleString()}).`);
  }
}

// ======== Start Polling ========

console.log('[STARTUP] Feather Alert Tracker starting...');
poll();
