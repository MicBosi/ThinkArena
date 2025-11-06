# Think Arena Games - Agent Implementation Guide

## Repository Layout

This repository contains AI reasoning games designed to test and compare different AI models' capabilities in strategic thinking, planning, and problem-solving. The codebase is structured as follows:

```
src/
├── interfaces.ts         # Core game interfaces
├── tools.ts              # Base tool classes and utilities
├── play.ts               # Game execution engine
├── config.ts             # Model configuration and providers
├── game-*.ts             # Individual game implementations
│   ├── game-decoder.ts   # Alien Signal Decoder game
│   ├── game-travel.ts    # Travel planning game
│   ├── game-mystery.ts   # Mystery solving game
│   ├── game-escape.ts    # Escape room game
│   └── game-treasure.ts  # Treasure hunting game
```

## Principles

- Progressive scoring systems combine base actions with various bonuses for continuous performance measurement across AI models.
- Strategic thinking is promoted through planning, resource allocation, and adaptive decision-making, rewarding efficient use of limited resources.
- Parallel tool usage enables concurrent actions and exploration of multiple solution paths for complex problem-solving.
- Search spaces require systematic exploration, pattern recognition, clue combination, and progressive information synthesis.

## Implementing a New Game

### Step 1: Implement the Game Interface

Every game must implement the `Game` interface from `interfaces.ts`:

```typescript
export interface Game {
  getFinalScore(): number;
  init(): void;
}
```

See `game-decoder.ts` for a complete example implementation.

### Step 2: Define Game State and Database

Create a comprehensive game state that tracks:
- Current position/status
- Resources (energy, steps, inventory)
- Progress metrics (score, explored areas, collected items)
- Strategic elements (hypotheses, plans)

Include databases for:
- Areas/locations with connections and properties
- Items/artifacts with values and uses
- Clues/signals with combination rules

See `game-decoder.ts` for examples of game state and database structures.

### Step 3: Create Game Tools

Extend `BaseTool` from `tools.ts` to create game-specific tools:

```typescript
class YourGameTool extends BaseTool {
  description = 'Tool description for AI understanding';
  schema = z.object({
    param: z.string().describe('Parameter description')
  });

  public async execute(params: Record<string, unknown>): Promise<ToolResult> {
    // Tool implementation
    // Return success/error results
  }
}
```

Common tool patterns:
- **Movement/Navigation**: Move between areas with risk/cost calculations
- **Resource Collection**: Gather items with scoring and inventory management
- **Analysis/Processing**: Examine clues, combine information, decode patterns
- **Reflection/Planning**: Free actions for strategic thinking and hypothesis formation
- **Final Actions**: High-stakes moves that require preparation

See `game-decoder.ts` for complete tool implementations and patterns.

### Step 4: Design Scoring System

Implement a cumulative scoring system that combines:
- **Base Actions**: Points for exploration, collection, basic tasks
- **Efficiency Bonuses**: Rewards for optimal resource usage
- **Strategic Bonuses**: Points for planning and reflection
- **Completion Bonuses**: Major rewards for achieving objectives
- **Resource Bonuses**: Points for unused resources

All bonuses are added together into a single final score.

See `game-decoder.ts` for a complete scoring implementation example.

### Step 5: Create Game Definition

Export a `GameDefinition` object. **Important**: All tools must be wrapped with `createTool()` to work with the AI SDK:

```typescript
import { createTool } from './tools.js';

// ... tool classes defined above ...

export const yourGame: GameDefinition = {
  name: 'Your Game Name',
  systemPrompt,
  userPrompt,
  tools: {
    yourTool: createTool(new YourToolClass(gameInstance)),
    anotherTool: createTool(new AnotherToolClass(gameInstance)),
  },
  maxSteps: MAX_STEPS,
  game: gameInstance,
};
```

The definition includes:
- `name`: Descriptive game title
- `systemPrompt`: Rules and strategy guidance
- `userPrompt`: Initial user instructions
- `tools`: Object mapping tool names to `createTool()` wrapped tool instances
- `maxSteps`: Maximum allowed actions
- `game`: Game instance

**Critical**: Never use tool class instances directly in the `tools` object. Always wrap them with `createTool(new YourToolClass(gameInstance))`.

See `game-decoder.ts` for a complete game definition example.

### Step 6: Register the Game

Add your game to the `GAMES` registry in `play.ts`:

```typescript
import { yourGame } from './game-yourgame.js';

const GAMES: Record<string, GameDefinition> = {
  // ... existing games
  yourgame: yourGame as GameDefinition,
};
```

See `play.ts` for how the `decoder` game is registered.
