# API Key Management - Summary

## What You Asked For

You asked:
> "How do I register/add API keys? How do I get them? How can I create the first one (that needs to be automatic as it will be done by a management system)?"

## The Answer

### 1. How API Keys Work in This System

- **API keys** authenticate servers (clients) that want to use the sync API
- Keys are **auto-generated** (64-char hex string) when you register a server
- Keys are stored in the `servers` table in SQLite (`./content.db`)
- Keys are validated via the `X-API-Key` HTTP header

### 2. How to Register/Add API Keys

**Method 1: Quick Command (Easiest)**
```bash
npm run create-api-key
```

**Method 2: HTTP API Call**
```bash
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{"name":"My Server","url":"http://localhost:3000"}'
```

**Method 3: Programmatic (Node.js)**
```javascript
import axios from 'axios';

const response = await axios.post('http://localhost:3000/api/servers', {
  name: 'My Server',
  url: 'http://localhost:3000'
});

const apiKey = response.data.apiKey;
console.log('API Key:', apiKey);
```

### 3. How Management Systems Can Automate This

**Example Scripts Provided:**
- `examples/create-first-api-key.js` - Node.js/JavaScript
- `examples/create_first_api_key.py` - Python
- `examples/create-first-api-key.sh` - Bash shell

**For Container Orchestration:**
```dockerfile
# In your Dockerfile or entrypoint script
CMD ["bash", "-c", "node examples/create-first-api-key.js && npm start"]
```

**For Kubernetes:**
```yaml
initContainers:
- name: register-api-key
  image: curlimages/curl
  command: ["sh", "-c", "curl -X POST http://api:3000/api/servers ..."]
```

**For CI/CD:**
```yaml
# GitHub Actions example
- name: Create API Key
  run: npm run create-api-key
```

### 4. Key Files and Locations

| File/Location | Purpose |
|---------------|---------|
| `src/middleware/auth.ts:110` | `generateApiKey()` function |
| `src/routes/servers.ts:45` | POST endpoint to register servers |
| `src/db/schema.ts:52-66` | `servers` table schema |
| `./content.db` | SQLite database storing API keys |
| `examples/` | Automation scripts for creating keys |

### 5. Complete Documentation

1. **[QUICK_START_API_KEYS.md](./QUICK_START_API_KEYS.md)** - 30-second quick start guide
2. **[API_KEY_GUIDE.md](./API_KEY_GUIDE.md)** - Complete API key management documentation
3. **[examples/README.md](./examples/README.md)** - Automation script documentation
4. **[README.md](./README.md)** - Updated with API key section

## Quick Reference

### Create First Key
```bash
npm run create-api-key
```

### Use the Key
```bash
curl -H "X-API-Key: your-key-here" http://localhost:3000/api/sync/directories
```

### View All Keys
```bash
curl http://localhost:3000/api/servers
```

### Update a Key
```bash
curl -X PUT http://localhost:3000/api/servers/1 \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"new-key"}'
```

### Delete a Key
```bash
curl -X DELETE http://localhost:3000/api/servers/1
```

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/servers` | Create server & get API key | No |
| GET | `/api/servers` | List all servers | No |
| GET | `/api/servers/:id` | Get server details | No |
| PUT | `/api/servers/:id` | Update server/key | No |
| DELETE | `/api/servers/:id` | Delete server | No |
| POST | `/api/servers/:id/ping` | Test connection | No |

**Note:** Server management endpoints don't require authentication to allow bootstrapping. Secure these in production (firewall/VPN).

## Key Features

✅ **Automatic generation** - Keys auto-created when not provided  
✅ **64-character hex** - Secure random keys using crypto.randomBytes  
✅ **HTTP API** - RESTful endpoints for management  
✅ **Multiple languages** - Examples in JS, Python, Bash  
✅ **Container-ready** - Easy to integrate with Docker/K8s  
✅ **CI/CD friendly** - Scripts for automation pipelines  
✅ **No manual DB access** - Everything via API  

## Response Example

```json
{
  "id": 1,
  "serverId": "server-1729864523456-a3x9k2",
  "name": "My Server",
  "url": "http://localhost:3000",
  "apiKey": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
  "active": true,
  "lastSeen": null,
  "createdAt": "2025-10-25T12:00:00.000Z",
  "updatedAt": "2025-10-25T12:00:00.000Z"
}
```

**Save the `apiKey` - you'll need it for authenticated requests!**

## Yes, There Is Documentation

**You asked:** "Is there a README.md?"

**Answer:** Yes! Now there are several:

1. **[README.md](./README.md)** - Main project documentation (updated)
2. **[QUICK_START_API_KEYS.md](./QUICK_START_API_KEYS.md)** - Quick start guide
3. **[API_KEY_GUIDE.md](./API_KEY_GUIDE.md)** - Comprehensive guide (NEW - 500+ lines)
4. **[examples/README.md](./examples/README.md)** - Automation examples (NEW)
5. **[SYNC_GUIDE.md](./SYNC_GUIDE.md)** - Sync functionality guide (existing)
6. **[CLAUDE.md](./CLAUDE.md)** - Development guide (existing)

All documentation is now comprehensive and includes:
- How to get API keys
- How to use them
- How to automate creation
- Security best practices
- Troubleshooting guides
- Integration examples

---

**Questions answered?** ✅  
**Documentation created?** ✅  
**Automation ready?** ✅  

**Next step:** Run `npm run create-api-key` and start syncing! 🚀
