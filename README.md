# Feather Alert Tracker

A Node.js application that monitors a specific X (formerly Twitter) user's tweets for "feather alert" mentions and triggers a webhook when found. Designed to run on [Once](https://github.com/basecamp/once).

## How It Works

1. Polls the X API for new tweets from a configured user during business hours (8 AM - 6 PM, weekdays only)
2. Checks each tweet for the phrase "feather alert" (case-insensitive)
3. Triggers a webhook (HTTP GET) when a match is found
4. Tracks the last processed tweet ID in `/storage` to avoid duplicates across restarts
5. Exposes a `/up` healthcheck endpoint on port 80

Polling intervals are calculated automatically to stay within the X API free tier limit of 100 calls per month (~18 minutes between polls).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `X_BEARER_TOKEN` | Yes | X API Bearer Token ([get one here](https://developer.twitter.com/)) |
| `USER_ID` | Yes | X user ID to monitor ([lookup tool](https://tweeterid.com/)) |
| `TRIGGER_URL` | Yes | Webhook URL that receives a GET request on alert |
| `TZ` | No | Timezone (default: `America/Los_Angeles`) |
| `PORT` | No | Healthcheck server port (default: `80`) |
| `STATE_DIR` | No | Override state file directory (default: `/storage`) |

When running on Once, configure these through the Once settings UI.

## Docker

Multi-platform images (amd64, arm64, arm/v7) are published to GHCR on every push to `main`:

```
ghcr.io/<owner>/feather-alert-tracker:latest
```

### Run locally

```bash
docker run -p 80:80 \
  -e X_BEARER_TOKEN=your_token \
  -e USER_ID=123456789 \
  -e TRIGGER_URL=https://your-webhook.com/alert \
  -v feather-storage:/storage \
  ghcr.io/<owner>/feather-alert-tracker:latest
```

### Build locally

```bash
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -t feather-alert-tracker .
```

## Once Compatibility

The app follows Once conventions:
- Serves HTTP on port 80 with a `GET /up` healthcheck
- Persists state to `/storage` (backed up automatically by Once)
- Configured via environment variables
- Runs as a non-root user

## Development

```bash
npm install
STATE_DIR=. PORT=3000 X_BEARER_TOKEN=... USER_ID=... TRIGGER_URL=... node app.js
```

## License

This project is open source. Please check the repository for specific license terms.
