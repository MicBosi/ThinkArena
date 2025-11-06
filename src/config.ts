import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { xai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { config } from 'dotenv';
import { resolve } from 'path';
import { homedir } from 'os';

// Load API keys from ~/.env
const envPath = resolve(homedir(), '.env');
config({ path: envPath });

// Global provider selection (can be overridden)
let currentProvider: string | null = null; // 'm2', 'xai', 'haiku', 'sonnet', 'orM2', 'orHaiku'

// ============================================================
// Model Configuration
// ============================================================

interface ModelConfig {
  default: string;
  apiKeyEnv: string;
  config?: Record<string, unknown>;
}

interface ModelConfigMap {
  [key: string]: ModelConfig;
}

export const MODEL_CONFIG: ModelConfigMap = {
  // MiniMax models
  m2: {
    default: 'MiniMax-M2',
    apiKeyEnv: 'MINIMAX_API_KEY',
  },

  // xAI models
  xai: {
    // Alternatives:
    // - 'grok-4-fast-reasoning' (optimized for deep reasoning)
    // - 'grok-4' (most capable)
    default: 'grok-code-fast-1', // Fast code generation with reasoning
    apiKeyEnv: 'XAI_API_KEY',
  },

  // Anthropic models
  haiku: {
    default: 'claude-haiku-4-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },

  sonnet: {
    default: 'claude-sonnet-4-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },

  // OpenRouter MiniMax models
  orM2: {
    default: 'minimax/minimax-m2', // MiniMax M2 model with reasoning support
    apiKeyEnv: 'OPENROUTER_API_KEY',
    config: {
      reasoning: {
        effort: 'high',
        exclude: true, // OpenRouter breaks both MiniMax M2 and Claude/Haiku if reasoning is returned and sent back to the model
      },
      provider: {
        order: [
          // 'fireworks',
          'minimax',
        ],
        allow_fallbacks: true,
      },
    },
  },

  // OpenRouter Claude Haiku models
  orHaiku: {
    default: 'anthropic/claude-haiku-4.5',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    config: {
      reasoning: {
        effort: 'high',
        exclude: true, // OpenRouter breaks both MiniMax M2 and Claude/Haiku if reasoning is returned and sent back to the model
      },
    },
  },
};

// ============================================================
// Thinking Budget Configuration
// ============================================================

export const THINKING_BUDGETS = {
  minimal: 2000, // Quick tests, simple calculations
  basic: 5000, // Standard reasoning tasks
  standard: 10000, // Travel planning, multi-step problems
  extended: 15000, // Complex reasoning, mystery investigation
  maximum: 20000, // Escape room, adaptive thinking scenarios
};

// ============================================================
// Interleaved Thinking Configuration
// ============================================================

export const ANTHROPIC_THINKING_CONFIG = {
  // Critical: Beta header enables true interleaving
  headers: {
    'anthropic-beta': 'interleaved-thinking-2025-05-14',
  },
};

// Check API keys based on provider
export function setProvider(provider: string): void {
  currentProvider = provider;
}

export function getProvider(): string | null {
  return currentProvider;
}

// Initialize with xAI by default
setProvider('xai');

// ============================================================
// Helper Functions
// ============================================================

export function createModel(): LanguageModelV2 {
  if (!currentProvider) {
    throw new Error('No provider set. Call setProvider() first.');
  }

  const providerConfig = MODEL_CONFIG[currentProvider];
  if (!providerConfig) {
    throw new Error(`Unknown provider '${currentProvider}'`);
  }

  const apiKey = process.env[providerConfig.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`${providerConfig.apiKeyEnv} not found. Configure in ~/.env file.`);
  }

  // Lazy initialization
  if (currentProvider === 'orM2' || currentProvider === 'orHaiku') {
    // Uses OPENROUTER_API_KEY from env
    const openrouterInstance = createOpenRouter({});
    return openrouterInstance.chat(providerConfig.default);
  }

  if (currentProvider === 'm2') {
    // Uses MINIMAX_API_KEY from env
    const minimaxInstance = createAnthropic({
      apiKey: apiKey,
      baseURL: 'https://api.minimax.io/anthropic/v1',
    });
    return minimaxInstance(providerConfig.default);
  }

  if (currentProvider === 'xai') {
    // Uses XAI_API_KEY from env
    return xai(providerConfig.default);
  }

  // Anthropic providers: haiku, sonnet
  // Uses ANTHROPIC_API_KEY from env
  return anthropic(providerConfig.default);
}

/**
 * Get provider options for interleaved thinking with custom budget
 */
/**
 * Get provider options for interleaved thinking with custom budget
 */
export function getProviderOptions(budgetTokens = THINKING_BUDGETS.standard) {
  if (currentProvider === 'xai') {
    // xAI Grok options
    return { xai: { parallel_function_calling: true } };
  }

  if (currentProvider === 'orM2' || currentProvider === 'orHaiku') {
    // OpenRouter options - pass config from MODEL_CONFIG
    const providerConfig = MODEL_CONFIG[currentProvider];
    if (providerConfig?.config) {
      return {
        openrouter: providerConfig.config,
      };
    }
    return { openrouter: {} };
  }

  // Anthropic and MiniMax options
  return {
    anthropic: {
      thinking: {
        type: 'enabled',
        budgetTokens,
      },
    },
  };
}

/**
 * Get extraBody parameters for OpenRouter reasoning
 * @returns {object|undefined} Extra body object with reasoning settings, or undefined
 */
export function getExtraBody() {
  if (currentProvider === 'orM2' || currentProvider === 'orHaiku') {
    // OpenRouter reasoning configuration - note: exclude: true means reasoning is performed but excluded from the response
    // Related Issue: https://github.com/OpenRouterTeam/ai-sdk-provider/issues/177
    return {
      reasoning: {
        effort: 'high',
        exclude: true,
      },
    };
  }
  return undefined;
}

/**
 * Get headers for interleaved thinking
 * @returns {object} Headers object with beta flag (Anthropic only)
 */
export function getHeaders() {
  if (currentProvider === 'sonnet' || currentProvider === 'haiku') {
    // MiniMax M2 should not need this
    return ANTHROPIC_THINKING_CONFIG.headers;
  }
  return {};
}

/**
 * Create a system message with caching enabled
 * @param {string} content - System message content
 * @param {boolean} enableCache - Enable caching for this message
 * @returns {object} System message object
 */
export function createCachedSystemMessage(content: string): unknown {
  return {
    role: 'system',
    content,
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' as const } },
    },
  };
}

// ============================================================
// Display current configuration
// ============================================================

export function displayConfig(): void {
  console.log('\n' + '='.repeat(70));
  console.log('📋 CONFIGURATION');
  console.log('='.repeat(70));

  if (!currentProvider) {
    console.log('Provider: Not set');
    console.log('='.repeat(70) + '\n');
    return;
  }

  const config = MODEL_CONFIG[currentProvider];
  if (!config) {
    console.log(`Provider: ${currentProvider} (unknown)`);
    console.log('='.repeat(70) + '\n');
    return;
  }

  if (currentProvider === 'xai') {
    console.log(`Provider: xAI (Grok)`);
    console.log(`Model: ${config.default}`);
    console.log(
      `API Key: ${process.env[config.apiKeyEnv] ? '✓ Loaded from ~/.env' : '✗ NOT FOUND'}`
    );
    console.log(`\nReasoning: Always enabled (built-in)`);
    console.log(`Parallel Function Calling: Configurable`);
  } else if (currentProvider === 'orM2') {
    console.log(`Provider: OpenRouter`);
    console.log(`Model: ${config.default}`);
    console.log(
      `API Key: ${process.env[config.apiKeyEnv] ? '✓ Loaded from ~/.env' : '✗ NOT FOUND'}`
    );
  } else if (currentProvider === 'orHaiku') {
    console.log(`Provider: OpenRouter`);
    console.log(`Model: ${config.default}`);
    console.log(
      `API Key: ${process.env[config.apiKeyEnv] ? '✓ Loaded from ~/.env' : '✗ NOT FOUND'}`
    );
  } else if (currentProvider === 'm2') {
    console.log(`Provider: MiniMax (via Anthropic SDK)`);
    console.log(`Model: ${config.default}`);
    console.log(`Base URL: https://api.minimax.io/anthropic/v1`);
    console.log(
      `API Key: ${process.env[config.apiKeyEnv] ? '✓ Loaded from ~/.env' : '✗ NOT FOUND'}`
    );
  } else {
    // Anthropic providers: haiku, sonnet
    console.log(`Provider: Anthropic (Claude ${currentProvider})`);
    console.log(`Model: ${config.default}`);
    console.log(
      `API Key: ${process.env[config.apiKeyEnv] ? '✓ Loaded from ~/.env' : '✗ NOT FOUND'}`
    );
  }

  console.log('='.repeat(70) + '\n');
}
