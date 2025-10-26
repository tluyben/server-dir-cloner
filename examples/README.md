# API Key Creation Examples

This directory contains example scripts demonstrating how to programmatically create API keys for the Directory Cloner API. These examples are useful for:

- **Initial Bootstrap**: Create the first API key during system setup
- **Container Orchestration**: Auto-register containers in Docker/Kubernetes
- **CI/CD Pipelines**: Automate server registration in deployment workflows
- **Management Systems**: Integrate with external provisioning tools

## Available Examples

### 1. JavaScript/Node.js (`create-first-api-key.js`)

**Usage:**

```bash
# Using npm script (recommended)
npm run create-api-key

# Or directly with node
node examples/create-first-api-key.js

# With custom configuration
SERVER_NAME="MyServer" SERVER_URL="http://192.168.1.100:3000" node examples/create-first-api-key.js
```

**Requirements:**

- Node.js 18+
- axios package (already in dependencies)

### 2. Python (`create_first_api_key.py`)

**Usage:**

```bash
# Make executable and run
chmod +x examples/create_first_api_key.py
./examples/create_first_api_key.py

# Or with python
python3 examples/create_first_api_key.py

# With custom configuration
SERVER_NAME="MyServer" SERVER_URL="http://192.168.1.100:3000" python3 examples/create_first_api_key.py
```

**Requirements:**

- Python 3.6+
- requests package: `pip install requests`

### 3. Bash Shell (`create-first-api-key.sh`)

**Usage:**

```bash
# Make executable and run
chmod +x examples/create-first-api-key.sh
./examples/create-first-api-key.sh

# Or with bash
bash examples/create-first-api-key.sh

# With custom configuration
SERVER_NAME="MyServer" SERVER_URL="http://192.168.1.100:3000" bash examples/create-first-api-key.sh
```

**Requirements:**

- bash shell
- curl
- jq (JSON processor)

**Install jq:**

```bash
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq

# CentOS/RHEL
sudo yum install jq
```

## Environment Variables

All scripts support the following environment variables:

| Variable      | Description                    | Default                 |
| ------------- | ------------------------------ | ----------------------- |
| `API_URL`     | Base URL of the API            | `http://localhost:3000` |
| `SERVER_NAME` | Name for the server            | `Server-<timestamp>`    |
| `SERVER_URL`  | URL where server is accessible | `http://localhost:3000` |

## Example Outputs

### Success

```
🔑 Creating first API key...

✅ Server registered successfully!

Server Details:
────────────────────────────────────────────────────────────
ID:               1
Server ID:        server-1729864523456-a3x9k2
Name:             MyServer
URL:              http://localhost:3000
Active:           true
Created:          2025-10-25T12:00:00.000Z
────────────────────────────────────────────────────────────

🔐 API Key:        d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5
────────────────────────────────────────────────────────────

📝 Important:
  1. Save this API key securely - it won't be shown again!
  2. Add it to your .env file:
     X_API_KEY=d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5
  3. Use it in API requests with the X-API-Key header:
     curl -H "X-API-Key: d4e5f6..." http://localhost:3000/api/sync/directories

✅ API key appended to .env.local

✨ Done!
```

### Error: Server Already Exists

```
❌ Failed to create API key:
   Status: 409
   Message: Server with name 'MyServer' already exists

💡 Tip: A server with this name already exists. Try:
   SERVER_NAME="MyServer-1729864600" node examples/create-first-api-key.js
```

### Error: API Not Running

```
❌ Failed to connect to API server:
   No response from server. Is the API running?
   Expected API at: http://localhost:3000

💡 Tip: Start the API server first:
   npm run dev
```

## Integration Examples

### Docker Entrypoint

```dockerfile
FROM node:18

WORKDIR /app
COPY . .
RUN npm install

# Add bootstrap script
COPY examples/create-first-api-key.sh /bootstrap.sh
RUN chmod +x /bootstrap.sh

CMD ["/bin/bash", "-c", "/bootstrap.sh && npm start"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - API_URL=http://localhost:3000
      - SERVER_NAME=docker-compose-instance
      - SERVER_URL=http://api:3000
    command: >
      bash -c "
        sleep 5 &&
        node examples/create-first-api-key.js &&
        npm start
      "
```

### Kubernetes InitContainer

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sync-server
spec:
  initContainers:
    - name: register-api-key
      image: python:3.9
      command:
        - python3
        - /scripts/create_first_api_key.py
      env:
        - name: API_URL
          value: 'http://management-api:3000'
        - name: SERVER_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: SERVER_URL
          value: 'http://$(POD_IP):3000'
      volumeMounts:
        - name: scripts
          mountPath: /scripts
  containers:
    - name: app
      image: your-app:latest
      # ... rest of container config
  volumes:
    - name: scripts
      configMap:
        name: api-key-scripts
```

### CI/CD Pipeline (GitHub Actions)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Register server and get API key
        env:
          API_URL: ${{ secrets.API_URL }}
          SERVER_NAME: github-actions-${{ github.run_number }}
          SERVER_URL: ${{ secrets.DEPLOYMENT_URL }}
        run: |
          npm run create-api-key
          # API key is saved to .env.local

      - name: Deploy with API key
        run: |
          source .env.local
          # Use $X_API_KEY in deployment
```

### Ansible Playbook

```yaml
---
- name: Register server and create API key
  hosts: servers
  tasks:
    - name: Create API key
      uri:
        url: '{{ api_url }}/api/servers'
        method: POST
        body_format: json
        body:
          name: '{{ inventory_hostname }}'
          url: 'http://{{ ansible_default_ipv4.address }}:3000'
        return_content: yes
      register: api_response

    - name: Save API key
      copy:
        content: 'X_API_KEY={{ api_response.json.apiKey }}'
        dest: /etc/sync-server/.env
        mode: '0600'

    - name: Display API key info
      debug:
        msg: 'API Key created for {{ api_response.json.name }}'
```

### Terraform

```hcl
resource "null_resource" "create_api_key" {
  provisioner "local-exec" {
    command = <<EOT
      SERVER_NAME="${var.instance_name}" \
      SERVER_URL="${var.instance_url}" \
      node examples/create-first-api-key.js
    EOT
  }

  triggers = {
    instance_id = aws_instance.app.id
  }
}
```

## Security Best Practices

1. **Never commit API keys to version control**
   - Add `.env.local` to `.gitignore`
   - Use secret managers in production (AWS Secrets Manager, HashiCorp Vault, etc.)

2. **Rotate keys regularly**
   - Implement automated key rotation
   - Update the API key via PUT `/api/servers/:id`

3. **Use HTTPS in production**
   - API keys transmitted over HTTP can be intercepted
   - Always use HTTPS for production deployments

4. **Limit key permissions** (future enhancement)
   - Implement role-based access control
   - Use scoped keys for different operations

5. **Monitor key usage**
   - Check `lastSeen` timestamp regularly
   - Deactivate unused keys

## Programmatic Usage (Library)

You can also import these functions in your own code:

```javascript
// JavaScript
import { createFirstApiKey } from './examples/create-first-api-key.js';

const apiKey = await createFirstApiKey();
console.log('API Key:', apiKey);
```

```python
# Python
from examples.create_first_api_key import create_first_api_key

api_key = create_first_api_key()
print(f'API Key: {api_key}')
```

## Troubleshooting

### "Server with name already exists"

Each server name must be unique. Either:

- Delete the existing server
- Use a different name
- Let the script auto-generate a timestamped name

### "Cannot connect to API server"

Ensure:

- The API server is running (`npm run dev`)
- The API_URL is correct
- No firewall blocking the connection
- Network connectivity exists

### "jq: command not found" (bash script)

Install jq:

```bash
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq
```

### API key not in response

This usually indicates:

- API endpoint changed
- Server error occurred
- JSON parsing failed

Check the raw response and API server logs.

## Further Reading

- [API_KEY_GUIDE.md](../API_KEY_GUIDE.md) - Comprehensive API key management guide
- [README.md](../README.md) - Project documentation
- [SYNC_GUIDE.md](../SYNC_GUIDE.md) - Directory synchronization guide

## Contributing

To add more examples:

1. Create a new script in this directory
2. Follow the naming convention: `create-first-api-key.<ext>`
3. Include proper error handling and output formatting
4. Update this README with usage instructions
5. Test the script in different environments

## Support

For issues or questions:

- Check the [API_KEY_GUIDE.md](../API_KEY_GUIDE.md)
- Review server logs
- Test with `curl` directly to isolate issues
