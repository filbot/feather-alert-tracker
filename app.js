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
const WEEKDAYS_PER_MONTH = 22; // Approximate weekdays in a month (30 days * 5/7 ≈ 21.4, rounded up)

// Total active polling minutes per month (weekdays only)
const ACTIVE_MINUTES_PER_MONTH = POLLING_WINDOW_HOURS * 60 * WEEKDAYS_PER_MONTH;

// Calculate required interval in minutes to stay under cap
const MINUTES_BETWEEN_POLLS = Math.ceil(ACTIVE_MINUTES_PER_MONTH / ALLOWED_POLLS_PER_MONTH);

// For logging
console.log(`[CONFIG] Max polls per month: ${ALLOWED_POLLS_PER_MONTH}`);
console.log(`[CONFIG] Poll window: ${POLLING_START_HOUR}:00 to ${POLLING_END_HOUR}:00 (weekdays only)`);
console.log(`[CONFIG] Minimum minutes between polls: ${MINUTES_BETWEEN_POLLS}`);

// ======== Helper Functions ========

function isWeekday(date = new Date()) {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Monday (1) to Friday (5)
}

function isWithinPollingHours(date = new Date()) {
  const hour = date.getHours();
  return hour >= POLLING_START_HOUR && hour < POLLING_END_HOUR;
}

function shouldPoll(date = new Date()) {
  return isWeekday(date) && isWithinPollingHours(date);
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
    if (shouldPoll(now)) {
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
      const reason = !isWeekday(now) ? "weekend" : "outside polling hours";
      console.log(`[${now.toLocaleString()}] Not polling (${reason}). Next poll will occur on next weekday at 8am.`);
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
  if (shouldPoll(now)) {
    // Schedule next poll at MINUTES_BETWEEN_POLLS
    setTimeout(poll, MINUTES_BETWEEN_POLLS * 60 * 1000);
    const nextPoll = new Date(now.getTime() + MINUTES_BETWEEN_POLLS * 60 * 1000);
    console.log(`[${now.toLocaleString()}] Next poll scheduled for: ${nextPoll.toLocaleString()}`);
  } else {
    // Calculate next valid polling time (next weekday at 8am)
    let next = new Date(now);
    
    // If it's a weekday but outside hours, go to next 8am (same day or next day)
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
      const daysUntilMonday = (8 - next.getDay()) % 7 || 7; // If it's Sunday (0), add 1 day. If Saturday (6), add 2 days
      next.setDate(next.getDate() + daysUntilMonday);
    }
    
    // Ensure we don't schedule for a weekend (edge case protection)
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

poll();
