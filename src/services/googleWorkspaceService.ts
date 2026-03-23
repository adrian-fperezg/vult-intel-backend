import { auth } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, linkWithPopup, User } from 'firebase/auth';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Ensures the user has granted the Google Drive scope.
 * If not, it prompts them to grant it.
 * Returns the OAuth access token.
 */
export const getGoogleWorkspaceToken = async (): Promise<string> => {
    const user = auth.currentUser;
    if (!user) throw new Error("User must be logged in to connect to Google Workspace.");

    // The user needs an access token. They either just logged in with Google and we have it,
    // or we need to re-authenticate them to get it.
    // The easiest way to get an access token with specific scopes in Firebase Web SDK on-demand
    // is to re-authenticate with pop-up or use `signInWithPopup`.

    const provider = new GoogleAuthProvider();
    provider.addScope(DRIVE_SCOPE);

    try {
        // We link with popup to get the credential, which contains the access token
        const result = await linkWithPopup(user, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
            return credential.accessToken;
        }
        throw new Error("Failed to retrieve access token.");
    } catch (error: any) {
        // If the account is already linked, linkWithPopup will throw auth/credential-already-in-use.
        // In that case, we can try signInWithPopup to get a fresh token for the existing user.
        if (error.code === 'auth/credential-already-in-use' || error.code === 'auth/provider-already-linked') {
            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                return credential.accessToken;
            }
        }
        throw error;
    }
};

/**
 * Creates a Google Doc file in the user's Drive from HTML content.
 */
export const createGoogleDocFromHtml = async (html: string, title: string): Promise<string> => {
    const token = await getGoogleWorkspaceToken();

    const metadata = {
        name: title,
        mimeType: 'application/vnd.google-apps.document',
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/html\r\n\r\n' +
        html +
        closeDelimiter;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
    });

    if (!res.ok) {
        throw new Error(`Failed to create Google Doc: ${await res.text()}`);
    }

    const data = await res.json();
    // Return the URL to open
    return `https://docs.google.com/document/d/${data.id}/edit`;
};

/**
 * Creates a Google Sheet file in the user's Drive from CSV content.
 */
export const createGoogleSheetFromCsv = async (csv: string, title: string): Promise<string> => {
    const token = await getGoogleWorkspaceToken();

    const metadata = {
        name: title,
        mimeType: 'application/vnd.google-apps.spreadsheet',
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/csv\r\n\r\n' +
        csv +
        closeDelimiter;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
    });

    if (!res.ok) {
        throw new Error(`Failed to create Google Sheet: ${await res.text()}`);
    }

    const data = await res.json();
    // Return the URL to open
    return `https://docs.google.com/spreadsheets/d/${data.id}/edit`;
};
