# Feather Alert Tracker

A Node.js application that monitors a specific X (formerly Twitter) user's tweets for "feather alert" mentions and triggers a webhook when found.

## Purpose

This application continuously monitors tweets from a specified X user account, looking for posts containing the phrase "feather alert" (case-insensitive). When such a tweet is detected, it automatically sends a GET request to a configured trigger URL, enabling automated responses to specific tweet content.

## Features

- **Smart Polling Schedule**: Only polls during business hours (8 AM - 6 PM local time)
- **Rate Limit Compliance**: Automatically calculates polling intervals to stay within X API limits
- **Rate Limit Handling**: Gracefully handles API rate limits with automatic retry logic
- **Persistent Tracking**: Uses `since_id` to avoid processing duplicate tweets
- **Webhook Integration**: Triggers external actions via HTTP GET requests

## Limitations

### API Constraints
- **Monthly Poll Limit**: Maximum of 100 API calls per month to stay within free tier limits
- **Polling Window**: Only active between 8 AM and 6 PM local time (10 hours daily)
- **Minimum Interval**: Approximately 18 minutes between polls (calculated automatically)
- **Tweet Volume**: Fetches maximum 5 tweets per poll (X API minimum)

### Technical Limitations
- Requires continuous running to maintain monitoring
- Dependent on X API availability and rate limits
- Single user monitoring only
- Simple keyword matching (exact phrase "feather alert")

## Setup

### Prerequisites
- Node.js (ES modules support required)
- X (Twitter) API Bearer Token with read access
- Target webhook/trigger URL

### Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install node-fetch
   ```

3. Create a `.env` file with the required environment variables (see below)

4. Run the application:
   ```bash
   node app.js
   ```

## Required Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# X (Twitter) API Bearer Token
# Obtain from https://developer.twitter.com/en/portal/dashboard
X_BEARER_TOKEN=your_bearer_token_here

# X User ID to monitor
# Find using tools like https://tweeterid.com/ or X API
USER_ID=123456789

# Webhook URL to trigger when "feather alert" is found
# This will receive a GET request when alerts are detected
TRIGGER_URL=https://your-webhook-endpoint.com/alert
```

### How to Get Required Information

1. **X_BEARER_TOKEN**: 
   - Create a developer account at https://developer.twitter.com/
   - Create a new app and generate a Bearer Token
   - Ensure the app has read permissions for tweets

2. **USER_ID**: 
   - Use online tools like https://tweeterid.com/
   - Or use the X API to convert username to user ID

3. **TRIGGER_URL**: 
   - Any HTTP endpoint that can receive GET requests
   - Could be a webhook service, your own API, or automation platform

## Usage

Once configured and running, the application will:

1. Start polling immediately if within business hours (8 AM - 6 PM)
2. Wait until the next business day if started outside polling hours
3. Check for new tweets every ~18 minutes during active hours
4. Log all activity with timestamps
5. Trigger the webhook URL when "feather alert" tweets are found
6. Automatically handle rate limits and scheduling

## Monitoring

The application provides detailed console logging:
- Configuration settings on startup
- Polling schedule and timing
- Tweet detection and webhook triggers
- Rate limit handling
- Error messages and warnings

## Docker Support

A Dockerfile is included for containerized deployment. Build and run with:

```bash
docker build -t feather-alert-tracker .
docker run --env-file .env feather-alert-tracker
```

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the application.

## License

This project is open source.
