import admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { initializeFirebase } from './lib/firebase.js';

dotenv.config();

// Initialize Firebase Admin with support for JSON credentials
initializeFirebase();

export interface AuthRequest extends Request {
  user?: admin.auth.DecodedIdToken;
  projectId?: string;
  body: any;
  query: any;
  params: any;
}

export const verifyFirebaseToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[AUTH ERROR] No Bearer token provided in Authorization header');
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error: any) {
    console.error('[AUTH ERROR] verifyFirebaseToken failed:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    return res.status(401).json({ 
      error: 'Unauthorized: Invalid or expired token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

export const verifyToken = verifyFirebaseToken;
