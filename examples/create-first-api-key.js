#!/usr/bin/env node

/**
 * Example: Create First API Key
 *
 * This script demonstrates how to programmatically create the first API key
 * for a new server. This is useful for:
 * - Initial bootstrap/setup
 * - Container orchestration
 * - CI/CD pipelines
 * - Management systems
 *
 * Usage:
 *   node examples/create-first-api-key.js
 *   npm run create-api-key
 */

import axios from 'axios';

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const SERVER_NAME = process.env.SERVER_NAME || `Server-${Date.now()}`;
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

async function createFirstApiKey() {
  console.log('🔑 Creating first API key...\n');

  try {
    // Register the server and get an API key
    const response = await axios.post(`${API_URL}/api/servers`, {
      name: SERVER_NAME,
      url: SERVER_URL,
      // API key will be auto-generated if not provided
    });

    const server = response.data;

    console.log('✅ Server registered successfully!\n');
    console.log('Server Details:');
    console.log('─'.repeat(60));
    console.log(`ID:               ${server.id}`);
    console.log(`Server ID:        ${server.serverId}`);
    console.log(`Name:             ${server.name}`);
    console.log(`URL:              ${server.url}`);
    console.log(`Active:           ${server.active}`);
    console.log(`Created:          ${server.createdAt}`);
    console.log('─'.repeat(60));
    console.log(`\n🔐 API Key:        ${server.apiKey}`);
    console.log('─'.repeat(60));

    console.log('\n📝 Important:');
    console.log("  1. Save this API key securely - it won't be shown again!");
    console.log('  2. Add it to your .env file:');
    console.log(`     X_API_KEY=${server.apiKey}`);
    console.log('  3. Use it in API requests with the X-API-Key header:');
    console.log(`     curl -H "X-API-Key: ${server.apiKey}" ${API_URL}/api/sync/directories`);

    // Save to .env.local for convenience (optional)
    const fs = await import('node:fs');
    const envContent = `\n# API Key for ${SERVER_NAME} (created ${new Date().toISOString()})\nX_API_KEY=${server.apiKey}\n`;

    try {
      fs.appendFileSync('.env.local', envContent);
      console.log('\n✅ API key appended to .env.local');
    } catch (err) {
      console.log('\n⚠️  Could not write to .env.local (this is optional)');
    }

    return server.apiKey;
  } catch (error) {
    console.error('\n❌ Failed to create API key:');

    if (error.response) {
      // Server responded with error
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.data?.error?.message || error.message}`);

      if (error.response.status === 409) {
        console.log('\n💡 Tip: A server with this name already exists. Try:');
        console.log(
          `   SERVER_NAME="MyServer-${Date.now()}" node examples/create-first-api-key.js`,
        );
      }
    } else if (error.request) {
      // No response received
      console.error('   No response from server. Is the API running?');
      console.error(`   Expected API at: ${API_URL}`);
      console.log('\n💡 Tip: Start the API server first:');
      console.log('   npm run dev');
    } else {
      // Other error
      console.error(`   ${error.message}`);
    }

    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createFirstApiKey()
    .then(() => {
      console.log('\n✨ Done!\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Unexpected error:', err.message);
      process.exit(1);
    });
}

export { createFirstApiKey };
