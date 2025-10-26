# Quick Start: API Keys

**TL;DR**: This guide shows you how to get an API key in 30 seconds.

## What Are API Keys For?

API keys authenticate servers (clients) that want to use the sync functionality. Think of it like a password for your server instance.

## Getting Your First API Key

### Option 1: One-Command Setup (Easiest)

```bash
# Make sure the API is running first
npm run dev

# In another terminal, create an API key
npm run create-api-key
```

**Output:**

```
✅ Server registered successfully!
🔐 API Key: d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5
✅ API key appended to .env.local
```

**Done!** Your API key is now in `.env.local`

### Option 2: Manual Registration via cURL

```bash
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{"name":"My Server","url":"http://localhost:3000"}'
```

**Copy the `apiKey` from the response.**

### Option 3: Using Other Languages

```bash
# Python
python3 examples/create_first_api_key.py

# Bash
bash examples/create-first-api-key.sh
```

## Using Your API Key

Add it to your `.env` file:

```bash
echo "X_API_KEY=your-api-key-here" >> .env
```

Then use it in requests:

```bash
curl -H "X-API-Key: your-api-key-here" \
  http://localhost:3000/api/sync/directories
```

## Common Questions

### Q: How do I view my existing API keys?

```bash
curl http://localhost:3000/api/servers
```

### Q: How do I create a new API key?

Run `npm run create-api-key` again with a different server name:

```bash
SERVER_NAME="MyOtherServer" npm run create-api-key
```

### Q: How do I delete an API key?

```bash
# First, find the server ID
curl http://localhost:3000/api/servers

# Then delete it (replace 1 with the actual ID)
curl -X DELETE http://localhost:3000/api/servers/1
```

### Q: Can I use my own custom API key?

Yes:

```bash
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{"name":"My Server","url":"http://localhost:3000","apiKey":"my-custom-key"}'
```

⚠️ **Security Note**: Custom keys should be long and random. Use auto-generated keys for production.

### Q: What if I lose my API key?

View it again:

```bash
curl http://localhost:3000/api/servers/1
```

Or regenerate it:

```bash
curl -X PUT http://localhost:3000/api/servers/1 \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"new-key-here"}'
```

### Q: How do I automate this for containers/CI/CD?

See [API_KEY_GUIDE.md](./API_KEY_GUIDE.md#automated-key-management-system-integration) for Docker, Kubernetes, and CI/CD examples.

## Next Steps

- **Full Guide**: [API_KEY_GUIDE.md](./API_KEY_GUIDE.md) - Complete API key management documentation
- **Examples**: [examples/README.md](./examples/README.md) - Automation scripts for different platforms
- **Sync Guide**: [SYNC_GUIDE.md](./SYNC_GUIDE.md) - How to use your API key for directory synchronization

## Troubleshooting

### Error: "Missing X-API-Key header"

You forgot to include the API key in your request. Add it:

```bash
curl -H "X-API-Key: your-key" http://localhost:3000/api/sync/directories
```

### Error: "Invalid API key"

Your API key is wrong or the server was deleted. Create a new one:

```bash
npm run create-api-key
```

### Error: "Cannot connect to API"

The API server isn't running. Start it:

```bash
npm run dev
```

## Visual Workflow

```
┌─────────────────────────────────────────────────────────┐
│  Step 1: Start API Server                              │
│  $ npm run dev                                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Step 2: Create API Key                                │
│  $ npm run create-api-key                              │
│                                                         │
│  ✅ API Key: abc123...                                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Step 3: Save to .env                                  │
│  $ echo "X_API_KEY=abc123..." >> .env                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Step 4: Use in Requests                               │
│  $ curl -H "X-API-Key: abc123..." \                    │
│      http://localhost:3000/api/sync/directories        │
└─────────────────────────────────────────────────────────┘
```

## Security Checklist

- [x] API key created
- [ ] API key saved to `.env` (not committed to git)
- [ ] Using HTTPS in production
- [ ] API key is long and random (auto-generated preferred)
- [ ] Unused API keys are deleted
- [ ] API keys are rotated regularly (e.g., every 90 days)

---

**Need more details?** See the comprehensive [API_KEY_GUIDE.md](./API_KEY_GUIDE.md)
