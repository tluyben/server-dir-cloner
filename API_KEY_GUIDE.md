# API Key Management Guide

## Overview

This Express API uses API keys to authenticate servers (clients) connecting to sync directories. API keys are stored in the `servers` table and validated via the `X-API-Key` header on protected endpoints.

## How API Keys Work

### Authentication Flow

1. **API Key Generation**: A 64-character hexadecimal string generated using `crypto.randomBytes(32)`
2. **Storage**: API keys are stored in the `servers` table alongside server metadata
3. **Validation**: The `authenticateApiKey` middleware validates the `X-API-Key` header against registered servers
4. **Authorization**: Only active servers with valid API keys can access protected endpoints

### Key Components

- **Location**: `src/middleware/auth.ts` - Contains authentication logic and key generation
- **Database**: `servers` table in `./content.db`
- **Header**: `X-API-Key` (configurable via `API_KEY_HEADER` environment variable)

## How to Register/Add API Keys

### Option 1: Auto-Generated API Key (Recommended)

When registering a new server, the API automatically generates a secure API key if none is provided.

**Request:**
```bash
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Server",
    "url": "http://remote-server.example.com:3000"
  }'
```

**Response:**
```json
{
  "id": 1,
  "serverId": "server-1729864523456-a3x9k2",
  "name": "My Server",
  "url": "http://remote-server.example.com:3000",
  "apiKey": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
  "active": true,
  "lastSeen": null,
  "createdAt": "2025-10-25T12:00:00.000Z",
  "updatedAt": "2025-10-25T12:00:00.000Z"
}
```

**Save the `apiKey` from the response** - you'll need it to authenticate requests from this server.

### Option 2: Provide Your Own API Key

You can specify your own API key when registering a server:

```bash
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Server",
    "url": "http://remote-server.example.com:3000",
    "apiKey": "my-custom-key-12345"
  }'
```

**Note**: Custom API keys should be long, random, and secure. Use the auto-generated option for production.

## Creating the First API Key Programmatically

For management systems that need to create API keys automatically (e.g., during server bootstrap, container orchestration), use the API programmatically.

### Node.js Example

```javascript
import axios from 'axios';

async function registerServer() {
  try {
    const response = await axios.post('http://localhost:3000/api/servers', {
      name: 'Automated Server Instance',
      url: 'http://automated-instance.example.com:3000'
    });

    const { apiKey, serverId, id } = response.data;

    console.log('Server registered successfully!');
    console.log('Server ID:', id);
    console.log('Unique Server ID:', serverId);
    console.log('API Key:', apiKey);

    // Store the API key securely (e.g., in environment variables, secrets manager)
    // DO NOT commit API keys to version control

    return apiKey;
  } catch (error) {
    console.error('Failed to register server:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
registerServer()
  .then(apiKey => {
    // Use the API key for subsequent requests
    console.log('Use this API key in your X-API-Key header:', apiKey);
  });
```

### Python Example

```python
import requests
import json

def register_server():
    url = 'http://localhost:3000/api/servers'
    payload = {
        'name': 'Automated Python Server',
        'url': 'http://python-server.example.com:3000'
    }

    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()

        data = response.json()
        api_key = data['apiKey']
        server_id = data['serverId']

        print(f'Server registered successfully!')
        print(f'Server ID: {data["id"]}')
        print(f'Unique Server ID: {server_id}')
        print(f'API Key: {api_key}')

        # Store securely (e.g., environment variable, secrets file)
        return api_key

    except requests.exceptions.RequestException as e:
        print(f'Failed to register server: {e}')
        raise

# Usage
if __name__ == '__main__':
    api_key = register_server()
    print(f'\nUse this in your X-API-Key header: {api_key}')
```

### Shell Script Example (for CI/CD)

```bash
#!/bin/bash

API_URL="http://localhost:3000/api/servers"
SERVER_NAME="CI/CD Server Instance"
SERVER_URL="http://ci-server.example.com:3000"

# Register server and extract API key
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$SERVER_NAME\",\"url\":\"$SERVER_URL\"}")

# Extract API key from JSON response (requires jq)
API_KEY=$(echo "$RESPONSE" | jq -r '.apiKey')
SERVER_ID=$(echo "$RESPONSE" | jq -r '.id')

if [ -z "$API_KEY" ] || [ "$API_KEY" = "null" ]; then
  echo "Error: Failed to register server"
  echo "$RESPONSE"
  exit 1
fi

echo "Server registered successfully!"
echo "Server ID: $SERVER_ID"
echo "API Key: $API_KEY"

# Export as environment variable for subsequent steps
export X_API_KEY="$API_KEY"

# Or save to a secure location
echo "$API_KEY" > /secure/path/.api_key
chmod 600 /secure/path/.api_key

echo "API key saved securely"
```

## Using API Keys

Once you have an API key, include it in the `X-API-Key` header for protected endpoints:

```bash
# Example: Create a sync directory
curl -X POST http://localhost:3000/api/sync/directories \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "localPath": "/path/to/local",
    "remoteServerId": 1,
    "remotePath": "/path/to/remote"
  }'
```

## Managing API Keys

### List All Servers

```bash
curl http://localhost:3000/api/servers
```

### View Server Details (Including API Key)

```bash
curl http://localhost:3000/api/servers/1
```

### Update Server API Key

```bash
curl -X PUT http://localhost:3000/api/servers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "new-api-key-12345"
  }'
```

**Note**: Updating the API key will invalidate the old key immediately. Update all clients using this server.

### Regenerate API Key Programmatically

```javascript
import crypto from 'node:crypto';

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

const newApiKey = generateApiKey();
console.log('New API Key:', newApiKey);

// Then update via API
await axios.put('http://localhost:3000/api/servers/1', {
  apiKey: newApiKey
});
```

### Deactivate a Server (Without Deleting)

```bash
curl -X PUT http://localhost:3000/api/servers/1 \
  -H "Content-Type: application/json" \
  -d '{
    "active": false
  }'
```

Deactivated servers cannot authenticate even with valid API keys.

### Delete a Server

```bash
curl -X DELETE http://localhost:3000/api/servers/1
```

**Note**: Servers with active sync directories cannot be deleted. Remove all sync directories first.

## Security Best Practices

### 1. **Never Commit API Keys to Version Control**

```bash
# Add to .gitignore
.env
.api_key
secrets/
```

### 2. **Use Environment Variables**

```bash
# .env
X_API_KEY=your-api-key-here
API_KEY_HEADER=X-API-Key
```

```javascript
// In your application
const apiKey = process.env.X_API_KEY;
```

### 3. **Rotate API Keys Regularly**

Implement a key rotation policy:

```javascript
async function rotateApiKey(serverId) {
  const newKey = generateApiKey();

  await axios.put(`http://localhost:3000/api/servers/${serverId}`, {
    apiKey: newKey
  });

  return newKey;
}

// Schedule rotation every 90 days
```

### 4. **Use HTTPS in Production**

API keys transmitted over HTTP can be intercepted. Always use HTTPS in production:

```bash
# .env
CORS_ORIGIN=https://your-domain.com
```

### 5. **Monitor API Key Usage**

The `lastSeen` field is automatically updated when a server authenticates:

```bash
curl http://localhost:3000/api/servers/1 | jq '.lastSeen'
```

### 6. **Implement Rate Limiting (Future Enhancement)**

Consider adding rate limiting middleware to prevent API key abuse.

## Automated Key Management System Integration

### Docker Container Example

```dockerfile
# Dockerfile
FROM node:18

WORKDIR /app
COPY . .
RUN npm install

# Bootstrap script that registers with management API
COPY bootstrap.sh /app/bootstrap.sh
RUN chmod +x /app/bootstrap.sh

CMD ["/app/bootstrap.sh"]
```

```bash
# bootstrap.sh
#!/bin/bash

# Register with management API
MANAGEMENT_API="http://management-server:3000/api/servers"
INSTANCE_NAME="container-${HOSTNAME}"
INSTANCE_URL="http://${HOSTNAME}:3000"

# Register and get API key
RESPONSE=$(curl -s -X POST "$MANAGEMENT_API" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$INSTANCE_NAME\",\"url\":\"$INSTANCE_URL\"}")

API_KEY=$(echo "$RESPONSE" | jq -r '.apiKey')

# Export for application use
export X_API_KEY="$API_KEY"

# Start the application
npm start
```

### Kubernetes Secret Example

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sync-server
spec:
  initContainers:
  - name: register-api-key
    image: curlimages/curl:latest
    command:
    - sh
    - -c
    - |
      RESPONSE=$(curl -s -X POST http://management-api:3000/api/servers \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"pod-$POD_NAME\",\"url\":\"http://$POD_IP:3000\"}")
      echo "$RESPONSE" | jq -r '.apiKey' > /shared/api-key
    volumeMounts:
    - name: shared-data
      mountPath: /shared
  containers:
  - name: app
    image: your-app:latest
    env:
    - name: X_API_KEY
      valueFrom:
        secretKeyRef:
          name: api-key
          key: key
    volumeMounts:
    - name: shared-data
      mountPath: /shared
  volumes:
  - name: shared-data
    emptyDir: {}
```

## Database Direct Access (For Advanced Use Cases)

If you need to create API keys directly in the database (e.g., during initial setup):

```javascript
import Database from 'better-sqlite3';
import crypto from 'node:crypto';

const db = new Database('./content.db');

function createServerWithApiKey(name, url) {
  const serverId = `server-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const apiKey = crypto.randomBytes(32).toString('hex');

  const stmt = db.prepare(`
    INSERT INTO servers (server_id, name, url, api_key, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);

  const result = stmt.run(serverId, name, url, apiKey);

  return {
    id: result.lastInsertRowid,
    serverId,
    name,
    url,
    apiKey,
    active: true
  };
}

// Usage
const server = createServerWithApiKey('Direct DB Server', 'http://localhost:3000');
console.log('Created server:', server);
console.log('API Key:', server.apiKey);
```

**Warning**: Direct database access bypasses validation. Use the API endpoints when possible.

## Troubleshooting

### "Missing X-API-Key header"

Ensure you're including the header in your requests:

```bash
curl -H "X-API-Key: your-key" http://localhost:3000/api/endpoint
```

### "Invalid API key"

- Verify the API key is correct (64 hex characters for auto-generated keys)
- Check that the server exists in the database
- Ensure the server is active (`active = true`)

### "Server is not active"

Reactivate the server:

```bash
curl -X PUT http://localhost:3000/api/servers/{id} \
  -H "Content-Type: application/json" \
  -d '{"active": true}'
```

### Connection Test Failed During Registration

The API tests server connectivity before registration. Ensure:
- The remote server URL is accessible
- The remote server has the same API running
- Network connectivity exists between servers

### Custom API Key Header

To use a different header name:

```bash
# .env
API_KEY_HEADER=Authorization
```

Then use:

```bash
curl -H "Authorization: your-key" http://localhost:3000/api/endpoint
```

## API Reference

### Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/servers` | Register new server | No |
| GET | `/api/servers` | List all servers | No |
| GET | `/api/servers/:id` | Get server details | No |
| PUT | `/api/servers/:id` | Update server | No |
| DELETE | `/api/servers/:id` | Delete server | No |
| POST | `/api/servers/:id/ping` | Test server connection | No |

**Note**: Server management endpoints don't require authentication to allow initial bootstrapping. Secure these endpoints in production environments (e.g., firewall, VPN, separate management network).

### Protected Endpoints (Require X-API-Key)

Sync-related endpoints require authentication:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync/directories` | Create sync directory |
| GET | `/api/sync/directories` | List sync directories |
| PUT | `/api/sync/directories/:id` | Update sync directory |
| DELETE | `/api/sync/directories/:id` | Delete sync directory |
| POST | `/api/sync/files` | Upload file |
| GET | `/api/sync/files` | Download file |

## Next Steps

1. **Implement Role-Based Access**: Add roles/permissions to servers (read-only, admin, etc.)
2. **Add API Key Scopes**: Limit what resources each API key can access
3. **Implement Key Expiration**: Auto-expire keys after a set period
4. **Add Audit Logging**: Track all API key usage and operations
5. **Create Admin Dashboard**: Web UI for managing API keys visually

## Related Documentation

- [README.md](./README.md) - Project overview and quick start
- [SYNC_GUIDE.md](./SYNC_GUIDE.md) - Directory synchronization guide
- [CLAUDE.md](./CLAUDE.md) - Development guide for LLMs
- [PRD.md](./PRD.md) - Product requirements document

## Support

For issues or questions about API key management, check:
- Database schema in `src/db/schema.ts:52-66`
- Authentication middleware in `src/middleware/auth.ts`
- Server routes in `src/routes/servers.ts`
