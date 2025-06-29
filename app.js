// app.js
import fetch from 'node-fetch';

const BEARER_TOKEN = process.env.X_BEARER_TOKEN;
const USER_ID = process.env.USER_ID;
const TRIGGER_URL = process.env.TRIGGER_URL;

// ======== API Limit Calculations ========

// User's limits
const ALLOWED_POLLS_PER_MONTH = 100;
const POLLING_START_HOUR = 8;   // 8am
const POLLING_END_HOUR = 18;    // 6pm (exclusive)

// Calculate daily polling window (in hours)
const POLLING_WINDOW_HOURS = POLLING_END_HOUR - POLLING_START_HOUR; // 10 hours
const DAYS_PER_MONTH = 30; // Approximate for calculation

// Total active polling minutes per month
const ACTIVE_MINUTES_PER_MONTH = POLLING_WINDOW_HOURS * 60 * DAYS_PER_MONTH;

// Calculate required interval in minutes to stay under cap
const MINUTES_BETWEEN_POLLS = Math.ceil(ACTIVE_MINUTES_PER_MONTH / ALLOWED_POLLS_PER_MONTH);

// For logging
console.log(`[CONFIG] Max polls per month: ${ALLOWED_POLLS_PER_MONTH}`);
console.log(`[CONFIG] Poll window: ${POLLING_START_HOUR}:00 to ${POLLING_END_HOUR}:00 local time`);
console.log(`[CONFIG] Minimum minutes between polls: ${MINUTES_BETWEEN_POLLS}`);

// ======== Helper Functions ========

function isWithinPollingHours(date = new Date()) {
  const hour = date.getHours();
  return hour >= POLLING_START_HOUR && hour < POLLING_END_HOUR;
}

let sinceId = null;

// ========== Fetch Latest ==========

async function fetchLatest() {
  const params = new URLSearchParams({
    max_results: '5', // Minimum allowed by X API
    'tweet.fields': 'id,text,created_at',
  });
  if (sinceId) params.set('since_id', sinceId);

  const url = `https://api.x.com/2/users/${USER_ID}/tweets?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });

  if (res.status === 429) {
    const reset = res.headers.get('x-rate-limit-reset');
    const waitMs = Math.max((reset * 1000) - Date.now(), 0);
    console.warn(`Rate limited. Waiting ${Math.ceil(waitMs / 1000 / 60)} minutes...`);
    await new Promise((r) => setTimeout(r, waitMs + 1000));
    return [];
  }
  if (!res.ok) {
    console.error('Error fetching tweets:', await res.text());
    return [];
  }

  const data = await res.json();
  return data.data || [];
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
    if (isWithinPollingHours(now)) {
      const tweets = await fetchLatest();
      if (tweets.length) {
        sinceId = tweets[0].id;
        for (const tweet of tweets.reverse()) {
          if (tweet.text && tweet.text.toLowerCase().includes('feather alert')) {
            console.log(`[Feather Alert] ${tweet.id} at ${tweet.created_at}: ${tweet.text}`);
            await triggerAction(tweet);
          }
        }
      } else {
        console.log(`[${now.toLocaleString()}] No new tweets found.`);
      }
    } else {
      console.log(`[${now.toLocaleString()}] Outside polling hours. Next poll will occur at 8am.`);
    }
  } catch (err) {
    console.error('Polling error:', err);
  } finally {
    scheduleNextPoll();
  }
}

// ======== Scheduling ========

function scheduleNextPoll() {
  const now = new Date();
  if (isWithinPollingHours(now)) {
    // Schedule next poll at MINUTES_BETWEEN_POLLS
    setTimeout(poll, MINUTES_BETWEEN_POLLS * 60 * 1000);
    const nextPoll = new Date(now.getTime() + MINUTES_BETWEEN_POLLS * 60 * 1000);
    console.log(`[${now.toLocaleString()}] Next poll scheduled for: ${nextPoll.toLocaleString()}`);
  } else {
    // Calculate ms until next 8am local time
    let next = new Date(now);
    next.setHours(POLLING_START_HOUR, 0, 0, 0);
    if (now.getHours() >= POLLING_END_HOUR) {
      // If after 6pm, go to next day
      next.setDate(next.getDate() + 1);
    }
    const msUntilNext = next - now;
    setTimeout(poll, msUntilNext);
    const h = Math.floor(msUntilNext / 1000 / 60 / 60);
    const m = Math.floor((msUntilNext / 1000 / 60) % 60);
    console.log(`[${now.toLocaleString()}] Waiting ${h}h ${m}m until next polling window.`);
  }
}

// ======== Start Polling ========

poll();