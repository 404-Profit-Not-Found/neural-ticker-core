#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

const SERVICE_ACCOUNT_KEY = '/tmp/gcp-sa-key.json';
const PROJECT_ID = 'neuro-b7a51';
const SERVICE_NAME = 'neural-ticker-core';

// Read service account key
const key = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_KEY, 'utf8'));

// Create JWT for authentication
function createJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64url');
  
  const signatureInput = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signatureInput), key.private_key)
    .toString('base64url');
  
  return `${header}.${payload}.${signature}`;
}

// Exchange JWT for access token
async function getAccessToken() {
  return new Promise((resolve, reject) => {
    const jwt = createJWT();
    const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
    
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error('No access token in response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Fetch logs
async function fetchLogs(accessToken, minutes = 30, severity = 'ERROR') {
  return new Promise((resolve, reject) => {
    const sinceTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${SERVICE_NAME}" AND severity="${severity}" AND timestamp>="${sinceTime}"`;
    
    const requestBody = JSON.stringify({
      resourceNames: [`projects/${PROJECT_ID}`],
      filter: filter,
      orderBy: 'timestamp desc',
      pageSize: 20
    });
    
    const req = https.request({
      hostname: 'logging.googleapis.com',
      path: '/v2/entries:list',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': requestBody.length
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

// Main
(async () => {
  try {
    console.log('🔍 Fetching Cloud Run logs...\n');
    const token = await getAccessToken();
    const logs = await fetchLogs(token, 30, 'ERROR');
    
    const entries = logs.entries || [];
    
    if (entries.length === 0) {
      console.log('✅ No ERROR logs in the last 30 minutes!\n');
    } else {
      console.log(`⚠️  Found ${entries.length} ERROR log(s):\n`);
      
      entries.forEach((entry, i) => {
        console.log(`[${i + 1}] ${entry.timestamp}`);
        console.log(`Severity: ${entry.severity}`);
        
        // Extract error message
        if (entry.textPayload) {
          console.log(entry.textPayload.substring(0, 300));
        } else if (entry.jsonPayload) {
          const msg = entry.jsonPayload.message || JSON.stringify(entry.jsonPayload, null, 2);
          console.log(msg.substring(0, 300));
        }
        console.log('---\n');
      });
    }
  } catch (error) {
    console.error('❌ Error fetching logs:', error.message);
    process.exit(1);
  }
})();
