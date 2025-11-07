#!/usr/bin/env node
import { streamText, stepCountIs } from 'ai';
import chalk from 'chalk';
import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createModel, getProviderOptions, displayConfig, setModel, getModelName } from './model-utils.js';
import { getModelConfigs } from './models.js';
import { GameDefinition } from './interfaces.js';

// Import all game definitions
import { travelGame } from './game-travel.js';
import { decoderGame } from './game-decoder.js';

// Game registry
const GAMES: Record<string, GameDefinition> = {
    travel: travelGame,
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
 * Build messages array from prompts
 */
function buildMessages(systemPrompt: string | null, userPrompt: string): any[] {
    const messages: any[] = [];
    if (systemPrompt) {
        messages.push({
            role: 'system',
            content: systemPrompt,
        });
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

function createStepFinishHandler() {
    return (event: any) => {
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
    const { systemPrompt: rawSystemPrompt = null, userPrompt: rawUserPrompt, tools = {}, maxSteps } = gameDefinition;

    // Build messages
    const messages = buildMessages(rawSystemPrompt, rawUserPrompt || '');

    // Create config inline
    const config: any = {
        model: createModel(),
        messages,
        tools: Object.keys(tools).length > 0 ? tools : undefined,
        stopWhen: stepCountIs(maxSteps),
        providerOptions: getProviderOptions(),
        onStepFinish: createStepFinishHandler(),
    };

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

    const { name } = gameDefinition;

    // Display header
    console.log(chalk.bold(`\n🎮 ${name}\n`));
    // console.log('='.repeat(70));
    displayConfig();

    /*
    // Display prompts
    if (systemPrompt) {
        console.log('📝 System Prompt:');
        console.log(systemPrompt);
        console.log('\n' + '-'.repeat(70));
    }

    console.log('\n👤 User Request:');
    console.log(userPrompt);
    console.log('\n' + '='.repeat(70));
    console.log('\n🔄 Starting game with interleaved thinking...\n');
    */

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

/**
 * CLI Entry Point / Module Execution Guard
 */
if (import.meta.url === `file://${process.argv[1]}`) {
    const program = new Command();

    // Get list of available models
    const availableModels = Object.keys(getModelConfigs());
    const modelList = availableModels.join(', ');

    program
        .name('play')
        .description('Play AI thinking games')
        .argument('[game-name]', 'name of the game to play', 'decoder')
        .requiredOption('-m, --model <model-id>', `Model to use. Available: ${modelList}`, 'XAI_GROK_4_FAST')
        .action(async (gameName: string, options: { model: string }) => {
            // Validate model ID
            const modelId = options.model;
            if (!availableModels.includes(modelId)) {
                console.error(`\n❌ ERROR: Unknown model "${modelId}"`);
                console.error(`\n📚 Available models: ${modelList}`);
                process.exit(1);
            }

            // Set the model (cast to ModelId after validation)
            setModel(modelId as any);

            // Validate game name
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
