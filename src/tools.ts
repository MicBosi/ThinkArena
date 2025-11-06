import { tool } from 'ai';
import { z } from 'zod';
import { Game } from './interfaces.js';
import chalk from 'chalk';

/**
 * Tool result interface
 */
export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

/**
 * Base tool class that all game tools should extend
 */
export abstract class BaseTool {
    protected game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public abstract get schema(): z.ZodSchema;
    public abstract get description(): string;

    /**
     * Implementation of tool execution - to be overridden by subclasses
     */
    public abstract execute(params: Record<string, unknown>): Promise<ToolResult>;

    /**
     * Creates a successful tool result
     */
    protected createSuccessResult(data: unknown): ToolResult {
        // console.log(JSON.stringify(data, null, 2));
        return {
            success: true,
            data,
        };
    }

    /**
     * Creates an error tool result
     */
    protected createErrorResult(message: string): ToolResult {
        console.error(chalk.red('Error: ' + message));
        return {
            success: false,
            error: message,
        };
    }
}

/**
 * Creates an AI SDK tool from a BaseTool class
 */
export const createTool = (baseTool: BaseTool) => {
    const instance = baseTool;
    return tool({
        description: instance.description,
        inputSchema: instance.schema as any,
        execute: async (params: Record<string, unknown>) => {
            try {
                //   const toolInstance = new ToolClass();
                const result = await instance.execute(params);
                if (result.success) {
                    return result.data;
                } else {
                    return { error: result.error || 'Tool execution failed' };
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Tool error: ${errorMessage}`);
                return { error: `Tool error: ${errorMessage}` };
            }
        },
    });
};
