import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { createAnthropic } from '@ai-sdk/anthropic';

/**
 * Configuration for a single AI model
 */
export interface ModelConfig {
    createProvider: (...args: any[]) => any;
    apiKeyName: string;
    modelId: string;
    systemPrompt: string;
    reasoningRemove?: boolean;
    // typelyExtraBody: Record<string, any>;
    creatorOptions?: Record<string, any>;
    providerOptions?: Record<string, any>;
    headers?: Record<string, string>;
}

const OR_CHAT_OPTIONS = {
    // Options copied ~ verbatim to HTTP request body according to OpenRouter native API
    // https://openrouter.ai/docs/api-reference/chat/send-chat-completion-request
    extraBody: {
        temperature: 0,
        top_p: 1,
        max_tokens: 8192,
        transforms: ['middle-out'],
        n: 1,
        // This one actually is ignored for anything other than auto, probably another bug on OR side
        tool_choice: 'auto',
    },

    // Options recognized by AI SDK OpenRouter provider `modelProvider.chat(config.modelId, providerOptions)`
    reasoning: { effort: 'medium', exclude: false, enabled: true },
    usage: { include: true },
    stream_options: {
        include_usage: true,
    },
    provider: {
        // order: ['google-vertex', 'cerebras'],
        // allow_fallbacks: true,
        data_collection: 'deny',
    },
};

/**
 * Configuration object containing all available AI models and their settings.
 * Each model includes OpenRouter model ID, system prompt file, minimum reasoning level,
 * and additional body parameters for API requests.
 */
export const modelConfigs: Record<string, ModelConfig> = {
    ANTHROPIC_HAIKU_4_5: {
        createProvider: createAnthropic,
        apiKeyName: 'ANTHROPIC_API_KEY',
        modelId: 'claude-haiku-4.5',
        systemPrompt: 'system-claude.md',
        reasoningRemove: false,
        creatorOptions: {
            headers: {
                'anthropic-beta': 'interleaved-thinking-2025-05-14',
            },
            baseURL: 'https://api.anthropic.com/v1',
        },
        providerOptions: {
            anthropic: {
                thinking: {
                    type: 'enabled',
                    budgetTokens: 4096,
                },
            },
        },
    },

    MINIMAX_M2: {
        createProvider: createAnthropic,
        apiKeyName: 'MINIMAX_API_KEY',
        modelId: 'MiniMax-M2',
        systemPrompt: 'system-claude.md',
        reasoningRemove: false,
        creatorOptions: {
            headers: {},
            baseURL: 'https://api.minimax.io/anthropic/v1',
        },
        providerOptions: {
            anthropic: {
                thinking: {
                    type: 'enabled',
                    budgetTokens: 4096,
                },
            },
        },
    },

    // https://ai-sdk.dev/providers/ai-sdk-providers/xai
    XAI_GROK_CODE_FAST_1: {
        // Does return reasoning traces
        createProvider: createXai,
        apiKeyName: 'XAI_API_KEY',
        modelId: 'grok-code-fast-1',
        systemPrompt: 'system-grok.md',
        reasoningRemove: false,
        creatorOptions: {
            headers: {},
            baseURL: 'https://api.x.ai/v1',
        },
        providerOptions: {
            xai: {
                parallel_function_calling: true,
            },
        },
    },

    XAI_GROK_4_FAST: {
        // Does return reasoning traces
        createProvider: createXai,
        apiKeyName: 'XAI_API_KEY',
        modelId: 'grok-4-fast-reasoning',
        systemPrompt: 'system-grok.md',
        reasoningRemove: false,
        creatorOptions: {
            headers: {},
            baseURL: 'https://api.x.ai/v1',
        },
        providerOptions: {
            xai: {
                parallel_function_calling: true,
            },
        },
    },

    XAI_GROK_4_FAST_NR: {
        // Does not return reasoning traces
        createProvider: createXai,
        apiKeyName: 'XAI_API_KEY',
        modelId: 'grok-4-fast-non-reasoning',
        systemPrompt: 'system-grok.md',
        reasoningRemove: false,
        creatorOptions: {
            headers: {},
            baseURL: 'https://api.x.ai/v1',
        },
        providerOptions: {
            xai: {
                parallel_function_calling: true,
            },
        },
    },

    OPENCODE_GROK_CODE_FAST_1: {
        // Does not return reasoning traces
        createProvider: createOpenAI,
        apiKeyName: 'OPENCODE_API_KEY',
        modelId: 'grok-code',
        systemPrompt: 'system-grok.md',
        reasoningRemove: false,
        creatorOptions: {
            baseURL: 'https://opencode.ai/zen/v1',
        },
        providerOptions: {
            openai: {
                parallelToolCalls: true,
                reasoningEffort: 'medium',
                textVerbosity: 'medium',
            },
        },
    },

    OPENAI_GPT_5_NANO: {
        // Does not return reasoning traces
        createProvider: createOpenAI,
        apiKeyName: 'OPENAI_API_KEY',
        modelId: 'gpt-5-nano-2025-08-07',
        systemPrompt: 'system-grok.md',
        reasoningRemove: false,
        providerOptions: {
            openai: {
                parallelToolCalls: true,
                reasoningEffort: 'medium',
                textVerbosity: 'medium',
            },
        },
    },

    COMPACT_MODEL: {
        createProvider: createOpenRouter,
        apiKeyName: 'OPENROUTER_API_KEY',
        modelId: 'anthropic/claude-haiku-4.5',
        systemPrompt: 'system-claude-compact.md',
        reasoningRemove: false,
        providerOptions: {
            ...OR_CHAT_OPTIONS,
        },
    },

    OR_GROK_4_FAST: {
        createProvider: createOpenRouter,
        apiKeyName: 'OPENROUTER_API_KEY',
        modelId: 'x-ai/grok-4-fast',
        systemPrompt: 'system-grok.md',
        reasoningRemove: false,
        providerOptions: {
            ...OR_CHAT_OPTIONS,
        },
    },

    OR_GLM_4_6: {
        createProvider: createOpenRouter,
        apiKeyName: 'OPENROUTER_API_KEY',
        modelId: 'z-ai/glm-4.6',
        systemPrompt: 'system-grok.md',
        reasoningRemove: false,
        providerOptions: {
            ...OR_CHAT_OPTIONS,
        },
    },

    OR_GPT_OSS_120B: {
        createProvider: createOpenRouter,
        apiKeyName: 'OPENROUTER_API_KEY',
        modelId: 'openai/gpt-oss-120b',
        systemPrompt: 'system-grok.md',
        reasoningRemove: false,
        providerOptions: {
            ...OR_CHAT_OPTIONS,
            provider: {
                order: ['google-vertex', 'cerebras'],
                allow_fallbacks: true,
                data_collection: 'deny',
            },
        },
    },

    OR_SONNET_4_5: {
        createProvider: createOpenRouter,
        apiKeyName: 'OPENROUTER_API_KEY',
        modelId: 'anthropic/claude-sonnet-4.5',
        systemPrompt: 'system-claude.md',
        reasoningRemove: false,
        providerOptions: {
            ...OR_CHAT_OPTIONS,
        },
    },

    OR_HAIKU_4_5: {
        createProvider: createOpenRouter,
        apiKeyName: 'OPENROUTER_API_KEY',
        modelId: 'anthropic/claude-haiku-4.5',
        systemPrompt: 'system-claude.md',
        reasoningRemove: false,
        providerOptions: {
            ...OR_CHAT_OPTIONS,
        },
    },

    OR_MINIMAX_M2: {
        createProvider: createOpenRouter,
        apiKeyName: 'OPENROUTER_API_KEY',
        modelId: 'minimax/minimax-m2',
        systemPrompt: 'system-grok.md',
        reasoningRemove: false,
        providerOptions: {
            ...OR_CHAT_OPTIONS,
        },
    },

    OR_KIMI_K2: {
        createProvider: createOpenRouter,
        apiKeyName: 'OPENROUTER_API_KEY',
        modelId: 'moonshotai/kimi-k2-thinking',
        systemPrompt: 'system-grok.md',
        reasoningRemove: false,
        providerOptions: {
            ...OR_CHAT_OPTIONS,
            provider: {
                order: ['moonshotai'],
                data_collection: 'deny',
            },
        },
    },
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * Union type representing all available model identifiers.
 * This type is derived from the keys of the modelConfigs object.
 */
export type ModelId = keyof typeof modelConfigs;

/**
 * Get all available model configurations.
 * @returns The model configurations object
 */
export function getModelConfigs() {
    return modelConfigs;
}

/**
 * Get a specific model configuration by ID.
 * @param modelId - The model identifier
 * @returns The model configuration or undefined if not found
 */
export function getModelConfig(modelId: ModelId): ModelConfig | undefined {
    return modelConfigs[modelId];
}
