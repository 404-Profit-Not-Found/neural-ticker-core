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
    // Priority 1: JSON Content from Config (Env: GCP_SA_KEY or FIREBASE_CREDENTIALS_JSON)
    const serviceAccountJson = this.configService.get<string>(
      'firebase.serviceAccountJson',
    );
    // Priority 2: File Path (Legacy / Local Dev)
    const serviceAccountPath = this.configService.get<string>(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );
    const projectId = this.configService.get<string>('firebase.projectId');

    // We try to initialize.
    try {
      if (admin.apps.length === 0) {
        let serviceAccount: any;

        if (serviceAccountJson) {
          try {
            // Priority 1: Direct JSON parsing
            if (serviceAccountJson.trim().startsWith('{')) {
              serviceAccount = JSON.parse(serviceAccountJson);
            } else {
              // Priority 2: Base64 Decoding
              const decoded = Buffer.from(
                serviceAccountJson,
                'base64',
              ).toString('utf8');
              if (decoded.trim().startsWith('{')) {
                serviceAccount = JSON.parse(decoded);
                this.logger.log(
                  'Loaded Firebase Credentials from Config (Base64 Encoded)',
                );
              }
            }
          } catch {
            // Ignore initial parse errors if we are going to try file path next
            if (!serviceAccount) {
              this.logger.warn(
                'firebase.serviceAccountJson is not valid JSON or Base64',
              );
            }
          }
        } else if (serviceAccountPath) {
          // Legacy path handling
          try {
            const absolutePath = path.isAbsolute(serviceAccountPath)
              ? serviceAccountPath
              : path.resolve(process.cwd(), serviceAccountPath);

            if (fs.existsSync(absolutePath)) {
              const fileContent = fs.readFileSync(absolutePath, 'utf8');
              serviceAccount = JSON.parse(fileContent);
              this.logger.log(
                `Loaded Firebase Credentials from file: ${serviceAccountPath}`,
              );
            } else {
              this.logger.warn(`Credential file not found: ${absolutePath}`);
            }
          } catch (e) {
            this.logger.warn(`Could not read credential file: ${e.message}`);
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
