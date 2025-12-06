import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private readonly configService: ConfigService) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async onModuleInit() {
    const serviceAccountPath = this.configService.get<string>(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );
    const serviceAccountJson = this.configService.get<string>(
      'FIREBASE_CREDENTIALS_JSON',
    ); // New Support
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');

    // We try to initialize.
    try {
      if (admin.apps.length === 0) {
        let serviceAccount: any;

        if (serviceAccountJson) {
          // Support for Cloud Run where we pass JSON as Env Var
          try {
            serviceAccount = JSON.parse(serviceAccountJson);
            this.logger.log(
              'Loaded Firebase Credentials from FIREBASE_CREDENTIALS_JSON',
            );
          } catch (e) {
            this.logger.error('Failed to parse FIREBASE_CREDENTIALS_JSON', e);
          }
        } else if (serviceAccountPath) {
          // Check if it looks like a path or content (simple check)
          if (serviceAccountPath.trim().startsWith('{')) {
            // It's content disguised as path?
            serviceAccount = JSON.parse(serviceAccountPath);
          } else {
            try {
              // Fix: Resolve path absolute to CWD to handle ./firebase-config.json correctly
              const absolutePath = path.isAbsolute(serviceAccountPath)
                ? serviceAccountPath
                : path.resolve(process.cwd(), serviceAccountPath);

              // serviceAccount = require(absolutePath);
              const fileContent = fs.readFileSync(absolutePath, 'utf8');
              serviceAccount = JSON.parse(fileContent);
            } catch (e) {
              this.logger.warn(
                `Could not require credential file: ${serviceAccountPath} (resolved: ${path.resolve(process.cwd(), serviceAccountPath)}) - Error: ${e}`,
              );
            }
          }
        }

        if (serviceAccount) {
          // Safety Check: Users often confuse Client Config with Service Account
          if (!serviceAccount.private_key || !serviceAccount.client_email) {
            this.logger.error(
              `[FATAL] Invalid Firebase Credentials! Missing private_key or client_email. Found keys: ${Object.keys(
                serviceAccount,
              ).join(', ')}`,
            );
            return;
          }

          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: projectId || undefined,
          });
          this.logger.log(`Firebase Admin initialized successfully.`);
        } else {
          admin.initializeApp({
            projectId: projectId || undefined,
          });
          this.logger.log(
            `Firebase Admin initialized (ADC or default). Project ID: ${projectId || 'Auto-detected'}`,
          );
        }
      }
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin', err);
    }
  }

  async verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
    if (admin.apps.length === 0) {
      this.logger.error('Firebase Admin not initialized. Cannot verify token.');
      throw new Error(
        'Firebase integration is disabled due to missing credentials.',
      );
    }
    return admin.auth().verifyIdToken(token);
  }
}
