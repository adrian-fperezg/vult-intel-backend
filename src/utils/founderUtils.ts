// src/utils/founderUtils.ts

export const FOUNDER_EMAIL = 'adrianfperezg@gmail.com';

/**
 * Checks if a given email belongs to the platform founder.
 */
export function isFounder(email: string | null | undefined): boolean {
    if (!email) return false;
    return email.toLowerCase() === FOUNDER_EMAIL.toLowerCase();
}
