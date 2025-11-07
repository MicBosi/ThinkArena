import { LanguageModelV2 } from '@ai-sdk/provider';
import { resolve } from 'path';
import chalk from 'chalk';
import { mkdir, writeFile } from 'fs/promises';
import { highlight } from 'cli-highlight';
import { loadEnv } from './env.js';
import { modelConfigs, ModelConfig, ModelId } from './models.js';

// Load API keys from ~/.env
loadEnv();

// ============================================================
// Request Logging
// ============================================================

/**
 * Sanitizes headers by removing sensitive information
 * @param headers - Headers object to sanitize
 * @returns Sanitized headers object
 */
export function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
    if (!headers) return headers;

    const sanitized = { ...headers };
    const sensitiveHeaders = [
        'authorization',
        'api-key',
        'x-api-key',
        'bearer',
        'token',
        'apikey',
        'x-auth-token',
        'x-access-token',
    ];

    // Remove sensitive headers (case-insensitive)
    Object.keys(sanitized).forEach((key) => {
        if (sensitiveHeaders.some((sensitive) => key.toLowerCase().includes(sensitive))) {
            sanitized[key] = '[REDACTED]';
        }
    });

    return sanitized;
}

/**
 * Creates a custom fetch wrapper that logs requests to last-request.json
 * Removes tools from logged body for readability.
 * @returns A fetch function that wraps the global fetch and logs requests
 */
function logFetch() {
    return async (input: any, init?: any): Promise<any> => {
        // Extract request details
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const method = init?.method || 'GET';

        let bodyObj: any = null;
        if (init?.body) {
            try {
                const bodyStr = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
                bodyObj = JSON.parse(bodyStr);

                // Remove tools from logged body for readability
                if (bodyObj && typeof bodyObj === 'object') {
                    const cleaned = { ...bodyObj };
                    delete cleaned.tools;
                    bodyObj = cleaned;
                }
            } catch {
                // If body is not JSON, keep as is
                bodyObj = init.body;
            }
        }

        // Write to last-request.json
        try {
            const requestData = {
                timestamp: new Date().toISOString(),
                url,
                method,
                headers: sanitizeHeaders(init?.headers),
                body: bodyObj,
            };

            const requestFilePath = resolve(process.cwd(), 'last-request.json');
            const requestDir = resolve(process.cwd());

            // Fire and forget - mkdir then writeFile (no await, but maintain order)
            void mkdir(requestDir, { recursive: true }).then(() => {
                void writeFile(requestFilePath, JSON.stringify(requestData, null, 2));
            });
        } catch (e) {
            console.error('Failed to write last-request.json:', e);
        }

        // Call the global fetch
        const response = await fetch(input, init);
        return response;
    };
}

// ============================================================
// Global State
// ============================================================

let currentModelId: ModelId | null = null;
let currentConfig: ModelConfig | null = null;
let currentModel: LanguageModelV2 | null = null;

/**
 * Set the active model by model ID
 * @param modelId - Model ID from models.ts (e.g., 'XAI_GROK_4_FAST', 'ANTHROPIC_HAIKU_4_5')
 */
export function setModel(modelId: ModelId): void {
    const config = modelConfigs[modelId];
    if (!config) {
        const available = Object.keys(modelConfigs).join(', ');
        throw new Error(`Model configuration not found for: ${modelId}. Available models: ${available}`);
    }

    currentModelId = modelId;
    currentConfig = config;
    currentModel = null; // Reset model instance
}

/**
 * Get the current model ID
 * @returns The model ID or null if not set
 */
export function getCurrentModelId(): ModelId | null {
    return currentModelId;
}

/**
 * Get the current model name
 * @returns The model ID string or 'unknown'
 */
export function getModelName(): string {
    return currentConfig?.modelId || 'unknown';
}

/**
 * Create and configure an AI model instance
 * @returns Configured language model instance
 */
export function createModel(): LanguageModelV2 {
    if (!currentModelId || !currentConfig) {
        throw new Error('No provider set. Call setProvider() first.');
    }

    // Return cached model if available
    if (currentModel) {
        return currentModel;
    }

    // Validate API key
    const apiKey = process.env[currentConfig.apiKeyName];
    if (!apiKey) {
        throw new Error(`${currentConfig.apiKeyName} not found. Configure in ~/.env file.`);
    }

    // Create provider options
    const creatorOptions: any = {
        // apiKey: ...
        // baseURL: ...
        // headers: { ... }
        fetch: logFetch(),
        ...currentConfig.creatorOptions,
        apiKey: apiKey,
    };

    // Create the provider and model
    const modelProvider = currentConfig.createProvider(creatorOptions);
    currentModel = modelProvider.chat(currentConfig.modelId, currentConfig.providerOptions);

    return currentModel;
}

/**
 * Get provider options for the current model
 * @returns Provider-specific options object
 */
export function getProviderOptions(): Record<string, any> {
    if (!currentConfig) {
        throw new Error('No provider set. Call setModel() first.');
    }

    // Return a copy of provider options from model config
    return { ...currentConfig.providerOptions };
}

/**
 * Display current configuration
 */
export function displayConfig(): void {
    // console.log('\n' + '='.repeat(70));
    // console.log('📋 CONFIGURATION');
    // console.log('='.repeat(70));

    if (!currentModelId || !currentConfig) {
        console.log('Provider: Not set');
        console.log('='.repeat(70) + '\n');
        return;
    }

    console.log(chalk.cyan(`Model: ${currentModelId} (${currentConfig.modelId})`));

    // Display creator options
    if (currentConfig.creatorOptions) {
        console.log(
            'Creator Options: ' + highlight(JSON.stringify(currentConfig.creatorOptions, null, 2), { language: 'json' })
        );
    }

    // Display provider options
    if (currentConfig.providerOptions) {
        console.log(
            'Provider Options: ' +
                highlight(JSON.stringify(currentConfig.providerOptions, null, 2), { language: 'json' })
        );
    }

    console.log(chalk.blue('\n' + '─'.repeat(70)));
}

// ============================================================
// Initialize with default model
// ============================================================

// Initialize with XAI Grok Code Fast 1 by default
setModel('XAI_GROK_CODE_FAST_1');
