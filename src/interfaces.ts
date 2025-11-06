export interface Game {
    getFinalScore(): number;
    init(): void;
    isCompleted(): boolean;
    state?: unknown;
}

export interface GameDefinition {
    name: string;
    systemPrompt?: string | ((state: unknown) => string) | null;
    userPrompt: string | ((state: unknown) => string);
    tools?: Record<string, unknown>;
    maxSteps?: number;
    game: Game;
}
