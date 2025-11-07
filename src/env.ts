import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

/**
 * Loads environment variables from a .env file
 * @param filePath - Path to the .env file (defaults to ~/.env)
 */
export function loadEnv(filePath?: string): void {
    const envPath = filePath || resolve(homedir(), '.env');

    if (!existsSync(envPath)) {
        console.warn(`Warning: .env file not found at ${envPath}`);
        return;
    }

    try {
        const envContent = readFileSync(envPath, 'utf-8');

        envContent.split('\n').forEach((line, index) => {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#')) {
                return;
            }

            // Parse key=value pairs
            const equalsIndex = trimmed.indexOf('=');
            if (equalsIndex === -1) {
                console.warn(`Warning: Invalid line ${index + 1} in .env file: ${trimmed}`);
                return;
            }

            const key = trimmed.substring(0, equalsIndex).trim();
            const value = trimmed.substring(equalsIndex + 1).trim();

            // Remove surrounding quotes if present
            const cleanValue = value.replace(/^["']|["']$/g, '');

            if (key) {
                process.env[key] = cleanValue;
            }
        });
    } catch (error) {
        console.error(`Error loading .env file from ${envPath}:`, error);
    }
}
