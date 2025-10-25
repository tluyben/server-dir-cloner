#!/bin/bash
# Container setup script - runs inside the container as claude user

# We should already be in the project directory from docker-compose working_dir
WORK_DIR="$(pwd)"
echo "Current directory: ${WORK_DIR}"

# Install npm dependencies FIRST (BEFORE changing directories!)
if [ -f "package.json" ]; then
    echo "Installing npm dependencies in container..."
    npm install
fi

# Export the SKIP_PLAYWRIGHT_INSTALL variable for claude4ever to use
export SKIP_PLAYWRIGHT_INSTALL=${SKIP_PLAYWRIGHT_INSTALL}

# Conditionally install Playwright and configure MCP as claude user
if [ "${SKIP_PLAYWRIGHT_INSTALL}" != "true" ]; then
    echo "Installing Playwright chromium browser as claude user..."
    cd /home/claude
    export PLAYWRIGHT_BROWSERS_PATH=/home/claude/.cache/ms-playwright
    npx -y playwright install chromium || true
    
    echo "Finding installed Chrome binary path..."
    # Try multiple possible paths since Playwright changes locations
    CHROME_BIN=$(ls $HOME/.cache/ms-playwright/chromium*/chrome-linux/chrome 2>/dev/null | head -n1)
    
    if [ -n "${CHROME_BIN}" ] && [ -f "${CHROME_BIN}" ]; then
        echo "Found Chrome binary at: ${CHROME_BIN}"
        
        echo "Removing any existing playwright MCP..."
        claude mcp remove playwright 2>/dev/null || true
        
        echo "Adding Playwright MCP with --isolated flag..."
        claude mcp add playwright -s user -- \
            npx @playwright/mcp@latest \
            --headless \
            --isolated \
            --no-sandbox \
            --executable-path "${CHROME_BIN}" \
            || echo "MCP already exists or failed"
        
        echo "Verifying MCP installation..."
        claude mcp list
    else
        echo "ERROR: Could not find Chrome binary after Playwright install"
        echo "Actual contents of ms-playwright directory:"
        ls -la /home/claude/.cache/ms-playwright/ 2>/dev/null || echo "Directory not found"
        ls -la /home/claude/.cache/ms-playwright/*/chrome-linux/ 2>/dev/null || echo "Chrome directory not found"
    fi
    # Return to project directory (use saved directory)
    cd "${WORK_DIR}"
else
    echo "SKIPPING Playwright installation and MCP configuration"
fi

# ENSURE we're back in the project directory
cd "${WORK_DIR}"

# Note: npm dependencies already installed above before Playwright
# npm dev will be started by claude4ever with proper logging to /var/log/next.log

# Start tailing the Next.js log in background so it is visible in docker logs
echo "Starting tail of /var/log/next.log in background..."
# Use tail -F to follow even if file does not exist yet or gets recreated
tail -F /var/log/next.log 2>/dev/null &
TAIL_PID=$!
echo "Tail started with PID: $TAIL_PID for Next.js logs"

# Control watcher is handled by claude4everdocker from outside the container
# (inside watcher can't actually stop/restart the container)

# Start claude4ever with --skip-tests flag
# Use exec so the container continues running with claude4ever as PID 1
echo "Starting claude4ever with --skip-tests flag..."
exec ./claude4ever --skip-tests