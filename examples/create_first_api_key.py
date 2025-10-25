#!/usr/bin/env python3

"""
Example: Create First API Key

This script demonstrates how to programmatically create the first API key
for a new server. This is useful for:
- Initial bootstrap/setup
- Container orchestration
- CI/CD pipelines
- Management systems

Usage:
    python examples/create_first_api_key.py
    python3 examples/create_first_api_key.py

Environment Variables:
    API_URL: Base URL of the API (default: http://localhost:3000)
    SERVER_NAME: Name for the server (default: Server-<timestamp>)
    SERVER_URL: URL where this server is accessible (default: http://localhost:3000)
"""

import os
import sys
import time
import json
import requests
from typing import Dict, Any


# Configuration
API_URL = os.getenv('API_URL', 'http://localhost:3000')
SERVER_NAME = os.getenv('SERVER_NAME', f'Server-{int(time.time() * 1000)}')
SERVER_URL = os.getenv('SERVER_URL', 'http://localhost:3000')


def create_first_api_key() -> str:
    """
    Create the first API key by registering a new server.

    Returns:
        str: The generated API key

    Raises:
        Exception: If registration fails
    """
    print('🔑 Creating first API key...\n')

    try:
        # Register the server and get an API key
        response = requests.post(
            f'{API_URL}/api/servers',
            json={
                'name': SERVER_NAME,
                'url': SERVER_URL,
                # API key will be auto-generated if not provided
            },
            headers={'Content-Type': 'application/json'}
        )

        response.raise_for_status()
        server = response.json()

        print('✅ Server registered successfully!\n')
        print('Server Details:')
        print('─' * 60)
        print(f"ID:               {server['id']}")
        print(f"Server ID:        {server['serverId']}")
        print(f"Name:             {server['name']}")
        print(f"URL:              {server['url']}")
        print(f"Active:           {server['active']}")
        print(f"Created:          {server['createdAt']}")
        print('─' * 60)
        print(f"\n🔐 API Key:        {server['apiKey']}")
        print('─' * 60)

        print('\n📝 Important:')
        print("  1. Save this API key securely - it won't be shown again!")
        print('  2. Add it to your .env file:')
        print(f"     X_API_KEY={server['apiKey']}")
        print('  3. Use it in API requests with the X-API-Key header:')
        print(f"     curl -H 'X-API-Key: {server['apiKey']}' {API_URL}/api/sync/directories")

        # Save to .env.local for convenience (optional)
        env_content = f"\n# API Key for {SERVER_NAME} (created {time.strftime('%Y-%m-%d %H:%M:%S')})\nX_API_KEY={server['apiKey']}\n"

        try:
            with open('.env.local', 'a') as f:
                f.write(env_content)
            print('\n✅ API key appended to .env.local')
        except Exception as e:
            print(f'\n⚠️  Could not write to .env.local (this is optional): {e}')

        return server['apiKey']

    except requests.exceptions.HTTPError as e:
        print('\n❌ Failed to create API key:')

        if e.response is not None:
            print(f"   Status: {e.response.status_code}")

            try:
                error_data = e.response.json()
                message = error_data.get('error', {}).get('message', str(e))
            except json.JSONDecodeError:
                message = e.response.text or str(e)

            print(f"   Message: {message}")

            if e.response.status_code == 409:
                print('\n💡 Tip: A server with this name already exists. Try:')
                print(f'   SERVER_NAME="MyServer-{int(time.time())}" python examples/create_first_api_key.py')
        else:
            print(f"   {str(e)}")

        sys.exit(1)

    except requests.exceptions.ConnectionError as e:
        print('\n❌ Failed to connect to API server:')
        print('   No response from server. Is the API running?')
        print(f'   Expected API at: {API_URL}')
        print('\n💡 Tip: Start the API server first:')
        print('   npm run dev')
        sys.exit(1)

    except Exception as e:
        print(f'\n❌ Unexpected error: {str(e)}')
        sys.exit(1)


def main():
    """Main entry point"""
    try:
        api_key = create_first_api_key()
        print('\n✨ Done!\n')
        return 0
    except Exception as e:
        print(f'\n❌ Unexpected error: {str(e)}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
