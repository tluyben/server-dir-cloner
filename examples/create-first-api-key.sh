#!/bin/bash

###############################################################################
# Example: Create First API Key
#
# This script demonstrates how to programmatically create the first API key
# for a new server. This is useful for:
# - Initial bootstrap/setup
# - Container orchestration
# - CI/CD pipelines
# - Management systems
#
# Usage:
#   ./examples/create-first-api-key.sh
#   bash examples/create-first-api-key.sh
#
# Environment Variables:
#   API_URL: Base URL of the API (default: http://localhost:3000)
#   SERVER_NAME: Name for the server (default: Server-<timestamp>)
#   SERVER_URL: URL where this server is accessible (default: http://localhost:3000)
###############################################################################

set -e  # Exit on error

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
SERVER_NAME="${SERVER_NAME:-Server-$(date +%s)}"
SERVER_URL="${SERVER_URL:-http://localhost:3000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ Error: jq is required but not installed.${NC}"
    echo "   Install it with:"
    echo "   - Ubuntu/Debian: sudo apt-get install jq"
    echo "   - macOS: brew install jq"
    echo "   - CentOS/RHEL: sudo yum install jq"
    exit 1
fi

echo -e "${BLUE}🔑 Creating first API key...${NC}\n"

# Register the server and get an API key
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/servers" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$SERVER_NAME\",\"url\":\"$SERVER_URL\"}")

# Extract HTTP status code and response body
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" -ne 201 ]; then
    echo -e "${RED}❌ Failed to create API key:${NC}"
    echo "   Status: $HTTP_STATUS"

    ERROR_MESSAGE=$(echo "$RESPONSE_BODY" | jq -r '.error.message // "Unknown error"' 2>/dev/null || echo "Unknown error")
    echo "   Message: $ERROR_MESSAGE"

    if [ "$HTTP_STATUS" -eq 409 ]; then
        echo -e "\n${YELLOW}💡 Tip: A server with this name already exists. Try:${NC}"
        echo "   SERVER_NAME=\"MyServer-$(date +%s)\" bash examples/create-first-api-key.sh"
    elif [ "$HTTP_STATUS" -eq 000 ]; then
        echo -e "\n${YELLOW}💡 Tip: Could not connect to API server. Is it running?${NC}"
        echo "   Expected API at: $API_URL"
        echo "   Start the server with: npm run dev"
    fi

    exit 1
fi

# Parse response
SERVER_ID=$(echo "$RESPONSE_BODY" | jq -r '.id')
SERVER_UUID=$(echo "$RESPONSE_BODY" | jq -r '.serverId')
SERVER_NAME_RESP=$(echo "$RESPONSE_BODY" | jq -r '.name')
SERVER_URL_RESP=$(echo "$RESPONSE_BODY" | jq -r '.url')
SERVER_ACTIVE=$(echo "$RESPONSE_BODY" | jq -r '.active')
SERVER_CREATED=$(echo "$RESPONSE_BODY" | jq -r '.createdAt')
API_KEY=$(echo "$RESPONSE_BODY" | jq -r '.apiKey')

# Check if API key was extracted successfully
if [ -z "$API_KEY" ] || [ "$API_KEY" = "null" ]; then
    echo -e "${RED}❌ Error: Failed to extract API key from response${NC}"
    echo "Response: $RESPONSE_BODY"
    exit 1
fi

echo -e "${GREEN}✅ Server registered successfully!${NC}\n"
echo "Server Details:"
echo "────────────────────────────────────────────────────────────"
echo "ID:               $SERVER_ID"
echo "Server ID:        $SERVER_UUID"
echo "Name:             $SERVER_NAME_RESP"
echo "URL:              $SERVER_URL_RESP"
echo "Active:           $SERVER_ACTIVE"
echo "Created:          $SERVER_CREATED"
echo "────────────────────────────────────────────────────────────"
echo -e "\n${GREEN}🔐 API Key:        $API_KEY${NC}"
echo "────────────────────────────────────────────────────────────"

echo -e "\n📝 Important:"
echo "  1. Save this API key securely - it won't be shown again!"
echo "  2. Add it to your .env file:"
echo "     X_API_KEY=$API_KEY"
echo "  3. Use it in API requests with the X-API-Key header:"
echo "     curl -H \"X-API-Key: $API_KEY\" $API_URL/api/sync/directories"

# Save to .env.local for convenience (optional)
ENV_FILE=".env.local"
ENV_CONTENT="\n# API Key for $SERVER_NAME_RESP (created $(date -Iseconds))\nX_API_KEY=$API_KEY\n"

if echo -e "$ENV_CONTENT" >> "$ENV_FILE" 2>/dev/null; then
    echo -e "\n${GREEN}✅ API key appended to $ENV_FILE${NC}"
else
    echo -e "\n${YELLOW}⚠️  Could not write to $ENV_FILE (this is optional)${NC}"
fi

# Export for use in current shell (if sourced)
export X_API_KEY="$API_KEY"

echo -e "\n${GREEN}✨ Done!${NC}\n"
echo "You can now use this API key in your requests."
echo "Example:"
echo "  export X_API_KEY=\"$API_KEY\""
echo "  curl -H \"X-API-Key: \$X_API_KEY\" $API_URL/api/servers"

exit 0
