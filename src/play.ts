#!/usr/bin/env node
import { streamText, stepCountIs } from 'ai';
import chalk from 'chalk';
import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
    createModel,
    getHeaders,
    getProviderOptions,
    getExtraBody,
    createCachedSystemMessage,
    THINKING_BUDGETS,
    displayConfig,
    setProvider,
    getModelName,
} from './config.js';
import { GameDefinition } from './interfaces.js';

// Import all game definitions
import { travelGame } from './game-travel.js';
// import { mysteryGame } from './game-mystery.js';
// import { escapeGame } from './game-escape.js';
// import { treasureGame } from './game-treasure.js';
import { decoderGame } from './game-decoder.js';

// Game registry
const GAMES: Record<string, GameDefinition> = {
    travel: travelGame,
    //   mystery: mysteryGame as GameDefinition,
    //   escape: escapeGame as GameDefinition,
    //   treasure: treasureGame as GameDefinition,
    decoder: decoderGame as GameDefinition,
};

/**
 * Save game results to a game-specific JSON file
 */
function saveGameResult(
    gameName: string,
    steps: number,
    score: number,
    time: number,
    completed: boolean,
    toolCalls: number
): void {
    // Use the game name directly as filename (CLI names are already clean)
    const resultsPath = resolve(process.cwd(), `${gameName}.json`);
    let results: Record<
        string,
        Array<{
            steps: number;
            score: number;
            time: number;
            completed: boolean;
            toolCalls: number;
            timestamp: string;
        }>
    > = {};

    try {
        // Try to read existing results
        const existingData = readFileSync(resultsPath, 'utf-8');
        results = JSON.parse(existingData);
    } catch {
        // File doesn't exist or is invalid, start with empty results
        results = {};
    }

    const modelName = getModelName();
    if (!modelName) {
        console.warn('Warning: No model name available, cannot save results');
        return;
    }

    // Initialize model array if it doesn't exist
    if (!results[modelName]) {
        results[modelName] = [];
    }

    // Add the new result
    results[modelName].push({
        steps,
        score,
        time,
        completed,
        toolCalls,
        timestamp: new Date().toISOString(),
    });

    // Write back to file
    try {
        writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    } catch {
        console.error('Error saving results to file');
    }
}

/**
 * Create streamText configuration with common settings
 */
function createStreamConfig({
    messages,
    tools,
    maxSteps,
    thinkingBudget,
}: {
    messages: unknown[];
    tools: Record<string, unknown>;
    maxSteps: number;
    thinkingBudget: number;
}) {
    const extraBody = getExtraBody();
    const config: any = {
        model: createModel(),
        messages,
        tools: Object.keys(tools).length > 0 ? tools : undefined,
        stopWhen: stepCountIs(maxSteps),
        headers: getHeaders(),
        providerOptions: getProviderOptions(thinkingBudget),
        ...(extraBody && { extraBody }),
    };

    return config;
}

/**
 * Build messages array from prompts
 */
function buildMessages(systemPrompt: string | null, userPrompt: string) {
    const messages: unknown[] = [];
    if (systemPrompt) {
        messages.push(createCachedSystemMessage(systemPrompt));
    }
    if (userPrompt) {
        messages.push({
            role: 'user',
            content: userPrompt,
        });
    }
    return messages;
}

/**
 * Resolve prompt (can be string or function)
 */
function resolvePrompt(prompt: string | ((state: unknown) => string) | null): string | null {
    if (typeof prompt === 'function') {
        return prompt({});
    }
    return prompt;
}

/**
 * Extract reasoning text from event
 */
function extractReasoningText(reasoning: unknown): string {
    if (typeof reasoning === 'string') {
        return reasoning;
    } else if (Array.isArray(reasoning)) {
        return (reasoning as Array<{ text?: string }>)
            .filter((r) => r && r.text)
            .map((r) => r.text)
            .join(' ');
    } else if (reasoning && typeof reasoning === 'object' && 'text' in reasoning) {
        return (reasoning as { text: string }).text;
    }
    return '';
}

/**
 * Extract text content from event
 */
function extractTextContent(text: unknown): string {
    if (typeof text === 'string') {
        return text;
    } else if (text && typeof text === 'object' && 'text' in text) {
        return (text as { text: string }).text || '';
    }
    return '';
}

/**
 * Create step finish handler
 */
function createStepFinishHandler() {
    // let stepCounter = 0;

    return (event: any) => {
        // stepCounter++;

        // const stepLabel = `[STEP ${stepCounter}]`;

        console.log(chalk.blue('\n' + '─'.repeat(70)));
        // console.log(chalk.blue(stepLabel));
        // console.log(chalk.blue('─'.repeat(70)));

        // Display reasoning
        const reasoningText = extractReasoningText(event.reasoning);
        if (reasoningText) {
            // const trimmed = reasoningText.substring(0, 200).replace(/\n/g, ' ');
            // const ellipsis = reasoningText.length > 200 ? '...' : '';
            // console.log(chalk.white.dim(`\n💭 THINKING: ${trimmed}${ellipsis}`));
            console.log(chalk.white.dim(`\n💭 THINKING: ${reasoningText}`));
        }

        // Display text content
        const textContent = extractTextContent(event.text);
        if (textContent) {
            const trimmed = textContent.substring(0, 200).replace(/\n/g, ' ');
            const ellipsis = textContent.length > 200 ? '...' : '';
            console.log(chalk.white.bold(`\n💬 RESPONSE: ${trimmed}${ellipsis}`));
        }
    };
}

/**
 * Execute a single game playthrough
 */
async function executePlaythrough({ gameDefinition }: { gameDefinition: GameDefinition }) {
    const {
        systemPrompt: rawSystemPrompt = null,
        userPrompt: rawUserPrompt,
        tools = {},
        maxSteps = 15,
    } = gameDefinition;

    const thinkingBudget = THINKING_BUDGETS.extended;

    // Resolve prompts
    const resolvedSystemPrompt = resolvePrompt(rawSystemPrompt);
    const resolvedUserPrompt = resolvePrompt(rawUserPrompt);

    // Build messages and config
    const messages = buildMessages(resolvedSystemPrompt, resolvedUserPrompt || '');
    const config = createStreamConfig({
        messages,
        tools,
        maxSteps,
        thinkingBudget,
    });

    // Create step finish handler
    config.onStepFinish = createStepFinishHandler();

    // Execute stream
    const stream = streamText(config);
    // Consume the stream to ensure it's processed
    for await (const chunk of stream.textStream) {
        void chunk; // Explicitly ignore the chunk
    }

    const result = await stream;
    const finalText = await result.text;
    const finalReasoning = await result.reasoning;
    const finalSteps = await result.steps;
    const finalUsage = await result.usage;

    return {
        result,
        finalText,
        finalReasoning,
        finalSteps,
        finalUsage,
    };
}

/**
 * Universal Game Player
 */
async function playGame(
    gameDefinition: GameDefinition,
    gameKey: string
): Promise<{
    success: boolean;
    result?: any;
    finalScore?: number;
    error?: string;
}> {
    const startTime = Date.now(); // Track start time

    const { name, systemPrompt, userPrompt } = gameDefinition;

    // Display header
    console.log(`\n🎮 ${name}`);
    console.log('='.repeat(70));
    displayConfig();

    // Resolve prompts
    const resolvedSystemPrompt = resolvePrompt(systemPrompt);
    const resolvedUserPrompt = resolvePrompt(userPrompt);

    // Display prompts
    if (resolvedSystemPrompt) {
        console.log('📝 System Prompt:');
        console.log(resolvedSystemPrompt);
        console.log('\n' + '-'.repeat(70));
    }

    console.log('\n👤 User Request:');
    console.log(resolvedUserPrompt);
    console.log('\n' + '='.repeat(70));
    console.log('\n🔄 Starting game with interleaved thinking...\n');

    try {
        // Execute playthrough
        const playthrough = await executePlaythrough({
            gameDefinition,
        });

        console.log();

        // Check completion status and display appropriate message
        const isCompleted = gameDefinition.game?.isCompleted() ?? false;
        const modelName = getModelName();
        if (isCompleted) {
            console.log(chalk.green(`🎉 MISSION ACCOMPLISHED ${modelName}!\n`));
        } else {
            console.log(chalk.yellow(`⚠️ MISSION INCOMPLETE! ${modelName}!\n`));
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const moveCount = playthrough.finalSteps.length;

        // Count total tool calls across all steps
        const toolCallCount = playthrough.finalSteps.reduce((total, step) => {
            return total + (step.toolCalls?.length ?? 0);
        }, 0);
        const toolCallsPerMove = moveCount > 0 ? (toolCallCount / moveCount).toFixed(1) : '0.0';

        console.log(
            `✅ PLAYTHROUGH COMPLETE IN ${duration}s, ${moveCount} MOVES, ${toolCallCount} TOOL CALLS, ${toolCallsPerMove} TOOL CALLS/MOVE\n`
        );

        // Calculate and display final score
        let finalScoreValue = 0;
        if (gameDefinition.game) {
            // Display remaining energy if available
            const energyRemaining = (gameDefinition.game.state as any)?.energy;
            if (typeof energyRemaining === 'number') {
                console.log(`⚡ ENERGY REMAINING: ${energyRemaining}\n`);
            }

            finalScoreValue = gameDefinition.game.getFinalScore();
            console.log(`🏆 FINAL SCORE: ${finalScoreValue}\n`);
        }

        // Save results to file
        saveGameResult(gameKey, moveCount, finalScoreValue, parseFloat(duration), isCompleted, toolCallCount);

        return {
            success: true,
            result: playthrough.result,
            finalScore: finalScoreValue,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('\n❌ Error:', errorMessage);
        if (errorMessage.includes('API key')) {
            console.error('\n💡 Check that your API key in ~/.env is valid');
        }

        return {
            success: false,
            error: errorMessage,
        };
    }
}

// CLI Entry Point
if (import.meta.url === `file://${process.argv[1]}`) {
    const program = new Command();

    program
        .name('play')
        .description('Play AI thinking games')
        .argument('[game-name]', 'name of the game to play', 'hello')
        .option('--haiku', 'use Claude Haiku 4.5')
        .option('--sonnet', 'use Claude Sonnet 4.5')
        .option('--xai', 'use xAI Grok (grok-code-fast-1)')
        .option('--or-m2', 'use OpenRouter MiniMax M2')
        .option('--or-kk2', 'use OpenRouter Kimi K2 Thinking')
        .option('--or-haiku', 'use OpenRouter Claude Haiku 4.5')
        .option('--m2', 'use MiniMax M2 via Anthropic-compatible API')
        .action(async (gameName: string, options: any) => {
            // Validate that exactly one provider option is selected
            const providerOptions = ['haiku', 'sonnet', 'xai', 'orM2', 'orHaiku', 'orKk2', 'm2'];
            const selectedProviders = providerOptions.filter((option) => options[option]);

            if (selectedProviders.length !== 1) {
                console.error(
                    '\n❌ ERROR: You must specify exactly one model provider using one of: --haiku, --sonnet, --xai, --or-m2, --or-kk2, --or-haiku, --m2'
                );
                program.help();
                return;
            }

            // Set provider based on selected option
            const providerMap: Record<string, string> = {
                haiku: 'haiku',
                sonnet: 'sonnet',
                xai: 'xai',
                orM2: 'orM2',
                orKk2: 'orKk2',
                orHaiku: 'orHaiku',
                m2: 'm2',
            };

            const selectedOption = selectedProviders[0];
            setProvider(providerMap[selectedOption]);

            if (!GAMES[gameName]) {
                console.error(`\n❌ Unknown game: "${gameName}"`);
                console.error('\n📚 Available games:');
                Object.keys(GAMES).forEach((name) => {
                    console.error(`   - ${name}`);
                });
                process.exit(1);
            }

            try {
                const { success } = await playGame(GAMES[gameName], gameName);
                if (!success) process.exit(1);
            } catch (error) {
                console.error('Fatal error:', error);
                process.exit(1);
            }
        });

    program.parse();
}
