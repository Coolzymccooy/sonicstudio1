
import type { User } from '../types';


// Simulating a backend database in memory
// In a real app, this would be Supabase, Firebase, or a Node.js API
const MOCK_DELAY = 800;

export const mockBackend = {
  login: async (email: string, password: string): Promise<User> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (email.includes("@")) {

          resolve({
            id: 'u_123',
            username: email.split('@')[0],
            email: email,
            isPro: true,
            joinedAt: Date.now()
          });
        } else {
          reject(new Error("Invalid credentials"));
        }
      }, MOCK_DELAY);
    });
  },

  signup: async (email: string, password: string): Promise<User> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id: `u_${Date.now()}`,
          username: email.split('@')[0],
          email: email,
          isPro: false,
          joinedAt: Date.now()
        });
      }, MOCK_DELAY);
    });
  },

  joinWaitlist: async (email: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`[BACKEND] Added ${email} to waitlist`);
        resolve(true);
      }, MOCK_DELAY);
    });
  },

  resetPassword: async (email: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`[BACKEND] Sent reset email to ${email}`);
        resolve(true);
      }, MOCK_DELAY);
    });
  }
};