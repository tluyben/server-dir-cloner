#!/usr/bin/env node

/**
 * Common utilities for administration scripts
 *
 * Provides shared functionality for managing servers and sync directories
 * without needing to deal with API keys or curl commands directly.
 */

import axios from 'axios';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const DEFAULT_API_URL = 'http://localhost:3000';
const ENV_FILE = join(dirname(__dirname), '.env.local');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * Get API URL from environment or use default
 */
export function getApiUrl() {
  return process.env.API_URL || DEFAULT_API_URL;
}

/**
 * Load API key from .env.local file
 */
export function loadApiKey() {
  if (process.env.X_API_KEY) {
    return process.env.X_API_KEY;
  }

  if (existsSync(ENV_FILE)) {
    const content = readFileSync(ENV_FILE, 'utf-8');
    const match = content.match(/X_API_KEY=(.+)/);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Create axios instance with API key header
 */
export function createApiClient(apiKey = null) {
  const key = apiKey || loadApiKey();
  const baseURL = getApiUrl();

  const headers = {};
  if (key) {
    headers['X-API-Key'] = key;
  }

  return axios.create({
    baseURL,
    headers,
    validateStatus: () => true, // Don't throw on any status
  });
}

/**
 * Print colored output
 */
export function print(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Print success message
 */
export function success(message) {
  print(`✅ ${message}`, 'green');
}

/**
 * Print error message
 */
export function error(message) {
  print(`❌ ${message}`, 'red');
}

/**
 * Print warning message
 */
export function warning(message) {
  print(`⚠️  ${message}`, 'yellow');
}

/**
 * Print info message
 */
export function info(message) {
  print(`ℹ️  ${message}`, 'cyan');
}

/**
 * Print section header
 */
export function header(message) {
  print(`\n${message}`, 'bright');
  print('─'.repeat(60), 'dim');
}

/**
 * Print table row
 */
export function row(label, value) {
  const paddedLabel = label.padEnd(20);
  console.log(`${colors.dim}${paddedLabel}${colors.reset} ${value}`);
}

/**
 * Handle API response
 */
export function handleResponse(response, successMessage = null) {
  if (response.status >= 200 && response.status < 300) {
    if (successMessage) {
      success(successMessage);
    }
    return { success: true, data: response.data };
  } else {
    const errorMsg = response.data?.error?.message || response.statusText || 'Unknown error';
    error(`API Error (${response.status}): ${errorMsg}`);
    return { success: false, error: errorMsg, status: response.status };
  }
}

/**
 * Format date string
 */
export function formatDate(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Format file size
 */
export function formatSize(bytes) {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Check if server is running
 */
export async function checkServer() {
  try {
    const client = createApiClient();
    const response = await client.get('/health');

    if (response.status === 200) {
      return true;
    }

    error('Server is not responding properly');
    return false;
  } catch (err) {
    error('Cannot connect to server at ' + getApiUrl());
    info('Make sure the server is running: npm run dev');
    return false;
  }
}

/**
 * Require API key or exit
 */
export function requireApiKey() {
  const apiKey = loadApiKey();

  if (!apiKey) {
    error('No API key found');
    info('Create an API key first: npm run create-api-key');
    info('Or set X_API_KEY environment variable');
    process.exit(1);
  }

  return apiKey;
}

/**
 * Parse command line arguments into object
 */
export function parseArgs(args) {
  const result = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('--')) {
        result[key] = nextArg;
        i++;
      } else {
        result[key] = true;
      }
    }
  }

  return result;
}

/**
 * Print usage/help information
 */
export function printUsage(scriptName, usage, examples = []) {
  header(`${scriptName} - Usage`);
  console.log(usage);

  if (examples.length > 0) {
    header('Examples');
    examples.forEach((example) => {
      print(`  ${example}`, 'dim');
    });
  }

  console.log('');
}

/**
 * Confirm action (simple yes/no)
 */
export function confirm(message) {
  // For non-interactive environments, always return true
  // In a real implementation, you might use readline for interactive prompts
  return true;
}

export default {
  getApiUrl,
  loadApiKey,
  createApiClient,
  print,
  success,
  error,
  warning,
  info,
  header,
  row,
  handleResponse,
  formatDate,
  formatSize,
  checkServer,
  requireApiKey,
  parseArgs,
  printUsage,
  confirm,
};
