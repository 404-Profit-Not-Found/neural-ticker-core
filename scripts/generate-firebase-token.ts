
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

async function generateToken() {
  const serviceAccountPath = path.resolve(__dirname, '../firebase-config.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`Error: Could not find ${serviceAccountPath}`);
    console.error('This script requires firebase-config.json to allow minting tokens.');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const uid = 'test-admin-user';
  const additionalClaims = {
    email: 'branislavlang@gmail.com', // Matches logic for auto-admin
    name: 'Test Admin',
  };

  // 1. Get API Key from Env Var (Service Account JSON does NOT contain it)
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: Missing FIREBASE_API_KEY environment variable.');
    console.error('The Service Account JSON does NOT contain the Web API Key needed for the exchange.');
    console.log('\n👉 Go to Firebase Console > Project Settings > General > "Web API Key"');
    console.log('👉 Then run:');
    console.log('   FIREBASE_API_KEY=AIzbSy... npx ts-node scripts/generate-firebase-token.ts');
    return;
  }

  try {
    // 2. Mint Custom Token
    const customToken = await admin.auth().createCustomToken(uid, additionalClaims);
    console.log('✅ Custom Token Generated.');

    // 3. Exchange for ID Token
    console.log('🔄 Exchanging for ID Token...');
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );

    const data: any = await response.json();

    if (!response.ok) {
      console.error('❌ Error exchanging token:', data.error?.message || data);
      return;
    }

    console.log('\n🎉 SUCCESS! Here is your Firebase ID Token:');
    console.log('---------------------------------------------------');
    console.log(data.idToken);
    console.log('---------------------------------------------------');
    console.log('Paste this into Swagger "authorize" for the /auth/firebase endpoint.');
  } catch (error) {
    console.error('Error:', error);
  }
}

generateToken();
