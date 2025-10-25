import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Health Check', () => {
  const app = createApp();

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
    });
  });
});