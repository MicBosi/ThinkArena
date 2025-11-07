export interface Game {
    getFinalScore(): number;
    init(): void;
    isCompleted(): boolean;
    state?: unknown;
}

export interface GameDefinition {
    name: string;
    systemPrompt?: string | null;
    userPrompt: string;
    tools?: Record<string, unknown>;
    maxSteps?: number;
    game: Game;
}
