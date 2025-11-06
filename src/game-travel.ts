import { z } from 'zod';
import chalk from 'chalk';
import { BaseTool, ToolResult, createTool } from './tools.js';
import { Game, GameDefinition } from './interfaces.js';

const MAX_STEPS = 8;

/**
 * Travel Planning Game
 *
 * A strategic route optimization game where the AI must visit multiple destinations
 * with limited budget and time constraints, choosing optimal transportation methods.
 *
 * Tests: Resource management, route planning, cost optimization, strategic decision-making.
 */

// System prompt
const systemPrompt = `You are a travel planner optimizing routes with budget constraints.

GAME RULES:
- Start in New York with $2000 budget
- Visit all 5 destinations: Paris, Tokyo, Sydney, Rio, Cape Town
- Choose transportation: flight ($800-1200), train ($200-400), bus ($50-150)

SCORING (all bonuses stack):
- Base: visiting cities (100-200 pts each based on value)
- Budget bonus: 5 pts per $100 remaining
- Completion bonus: 500 pts for visiting all 5 required cities
- Goal: Visit all cities with maximum budget remaining

STRATEGY TIPS:
1. Prioritize visiting all 5 cities to unlock 500 pt completion bonus
2. Use cheapest viable transport to maximize budget bonus
3. Plan route to minimize backtracking and total cost
4. Check routes before traveling to compare options`;

// User prompt
const userPrompt =
    'You need to visit 5 major cities worldwide with a $2000 budget. Plan your route efficiently - you have only 8 steps. Start by checking available routes, then travel strategically to visit all destinations.';

// Game state
interface GameState {
    currentCity: string;
    budget: number;
    visitedCities: string[];
    totalSpent: number;
    score: number;
    stepCount: number;
    completed: boolean;
}

// City database with coordinates and values
interface CityInfo {
    name: string;
    region: string;
    value: number; // Points for visiting
    description: string;
}

// Transportation database
interface TransportInfo {
    cost: number;
    time: number; // Steps required
    description: string;
}

class TravelGame implements Game {
    state: GameState;
    database = {
        cities: {} as Record<string, CityInfo>,
        routes: {} as Record<string, TransportInfo>,
    };

    constructor() {
        this.init();
    }

    getFinalScore(): number {
        // Base score from visited cities
        const cityScore = this.state.visitedCities.reduce((sum, city) => {
            return sum + this.database.cities[city].value;
        }, 0);

        // Budget efficiency bonus
        const budgetBonus = Math.floor(this.state.budget / 100) * 5;

        // Completion bonus for visiting all cities
        const requiredCities = ['paris', 'tokyo', 'sydney', 'rio', 'capetown'];
        const allVisited = requiredCities.every((city) => this.state.visitedCities.includes(city));
        const completionBonus = allVisited ? 500 : 0;

        return cityScore + budgetBonus + completionBonus;
    }

    isCompleted(): boolean {
        const requiredCities = ['paris', 'tokyo', 'sydney', 'rio', 'capetown'];
        return requiredCities.every((city) => this.state.visitedCities.includes(city));
    }

    init(): void {
        this.state = {
            currentCity: 'newyork',
            budget: 2000,
            visitedCities: ['newyork'],
            totalSpent: 0,
            score: 0,
            stepCount: 0,
            completed: false,
        };

        // Initialize cities
        this.database.cities = {
            newyork: {
                name: 'New York',
                region: 'North America',
                value: 50,
                description: 'Starting city - financial capital',
            },
            paris: {
                name: 'Paris',
                region: 'Europe',
                value: 150,
                description: 'City of lights - cultural hub',
            },
            tokyo: {
                name: 'Tokyo',
                region: 'Asia',
                value: 200,
                description: 'Modern metropolis - tech center',
            },
            sydney: {
                name: 'Sydney',
                region: 'Australia',
                value: 120,
                description: 'Harbor city - natural beauty',
            },
            rio: {
                name: 'Rio de Janeiro',
                region: 'South America',
                value: 130,
                description: 'Carnival city - vibrant culture',
            },
            capetown: {
                name: 'Cape Town',
                region: 'Africa',
                value: 110,
                description: 'Cape city - scenic landscapes',
            },
        };

        // Initialize routes (simplified - not all connections shown)
        this.database.routes = {
            'newyork-paris': {
                cost: 800,
                time: 1,
                description: 'Transatlantic flight',
            },
            'newyork-tokyo': { cost: 1200, time: 2, description: 'Long-haul flight' },
            'newyork-rio': {
                cost: 900,
                time: 1,
                description: 'South America flight',
            },
            'paris-tokyo': { cost: 1000, time: 2, description: 'Europe-Asia flight' },
            'paris-sydney': {
                cost: 1100,
                time: 2,
                description: 'Europe-Australia flight',
            },
            'paris-capetown': {
                cost: 850,
                time: 1,
                description: 'Europe-Africa flight',
            },
            'tokyo-sydney': {
                cost: 600,
                time: 1,
                description: 'Asia-Pacific flight',
            },
            'tokyo-capetown': {
                cost: 950,
                time: 2,
                description: 'Asia-Africa flight',
            },
            'sydney-capetown': {
                cost: 700,
                time: 1,
                description: 'Southern route flight',
            },
            'rio-capetown': {
                cost: 750,
                time: 1,
                description: 'Atlantic crossing flight',
            },
            'rio-sydney': {
                cost: 1050,
                time: 2,
                description: 'South America-Australia flight',
            },
            // Cheaper alternatives
            'paris-capetown_train': {
                cost: 400,
                time: 3,
                description: 'Scenic train route',
            },
            'newyork-rio_bus': {
                cost: 150,
                time: 4,
                description: 'Cross-country bus',
            },
            'tokyo-sydney_bus': {
                cost: 200,
                time: 5,
                description: 'Budget overland route',
            },
        };
    }
}

/**
 * CheckRoutes tool - Check available routes from current city
 */
class CheckRoutesTool extends BaseTool {
    constructor(game: TravelGame) {
        super(game);
    }

    description = 'Check all available transportation routes from your current city. Free action - no cost.';

    schema = z.object({});

    public async execute(params: Record<string, unknown>): Promise<ToolResult> {
        void params; // No parameters needed for this tool
        console.log(chalk.cyan('\n🔧 TOOL: checkRoutes()'));

        const game = this.game as TravelGame;
        const currentCity = game.state.currentCity;
        const routes: Array<{
            routeKey: string;
            destination: string;
            cost: number;
            time: number;
            description: string;
        }> = [];

        // Find all routes from current city
        Object.keys(game.database.routes).forEach((routeKey) => {
            if (routeKey.startsWith(`${currentCity}-`)) {
                const destination = routeKey.replace(`${currentCity}-`, '').split('_')[0];
                if (destination && destination !== currentCity) {
                    const route = game.database.routes[routeKey];
                    routes.push({
                        routeKey,
                        destination: game.database.cities[destination]?.name || destination,
                        cost: route.cost,
                        time: route.time,
                        description: route.description,
                    });
                }
            }
        });

        return this.createSuccessResult({
            message: `Available routes from ${game.database.cities[currentCity].name}:`,
            routes: routes.map(
                (r) => `${r.routeKey} -> ${r.destination} ($${r.cost}, ${r.time} steps, ${r.description})`
            ),
            currentCity: game.database.cities[currentCity].name,
            budgetRemaining: game.state.budget,
            visitedCities: game.state.visitedCities.map((city) => game.database.cities[city].name),
            stepsRemaining: MAX_STEPS - game.state.stepCount,
        });
    }
}

/**
 * Travel tool - Travel to a destination city
 */
class TravelTool extends BaseTool {
    constructor(game: TravelGame) {
        super(game);
    }

    description = 'Travel to a destination city using specified route. Costs money and steps based on route.';

    schema = z.object({
        routeKey: z.string().describe('Route key from checkRoutes (e.g., "newyork-paris", "paris-capetown_train")'),
    });

    public async execute(params: Record<string, unknown>): Promise<ToolResult> {
        const { routeKey } = params as { routeKey: string };
        console.log(chalk.cyan(`\n🔧 TOOL: travel("${routeKey}")`));

        const game = this.game as TravelGame;
        const route = game.database.routes[routeKey];

        if (!route) {
            return this.createErrorResult(`Route "${routeKey}" not available`);
        }

        // Verify the route starts from current city
        if (!routeKey.startsWith(`${game.state.currentCity}-`)) {
            return this.createErrorResult(`Route "${routeKey}" doesn't start from ${game.state.currentCity}`);
        }

        // Extract destination from route key
        const destination = routeKey.replace(`${game.state.currentCity}-`, '').split('_')[0];

        if (game.state.budget < route.cost) {
            return this.createErrorResult(
                `Insufficient budget. Required: $${route.cost}, Available: $${game.state.budget}`
            );
        }

        if (game.state.stepCount + route.time > MAX_STEPS) {
            return this.createErrorResult(
                `Not enough steps remaining. Required: ${route.time}, Available: ${MAX_STEPS - game.state.stepCount}`
            );
        }

        // Execute travel
        game.state.budget -= route.cost;
        game.state.totalSpent += route.cost;
        game.state.stepCount += route.time;
        game.state.currentCity = destination;

        if (!game.state.visitedCities.includes(destination)) {
            game.state.visitedCities.push(destination);
            const visitBonus = game.database.cities[destination].value;
            game.state.score += visitBonus;
        }

        return this.createSuccessResult({
            success: true,
            newCity: game.database.cities[destination].name,
            cost: route.cost,
            timeSpent: route.time,
            visitBonus: game.state.visitedCities.includes(destination) ? 0 : game.database.cities[destination].value,
            budgetRemaining: game.state.budget,
            stepsRemaining: MAX_STEPS - game.state.stepCount,
            totalVisited: game.state.visitedCities.length,
        });
    }
}

/**
 * PlanRoute tool - Free action to analyze and plan optimal route
 */
class PlanRouteTool extends BaseTool {
    constructor(game: TravelGame) {
        super(game);
    }

    description = 'Analyze current progress and suggest optimal next moves. Free action - no cost.';

    schema = z.object({});

    public async execute(params: Record<string, unknown>): Promise<ToolResult> {
        void params; // No parameters needed for this tool
        console.log(chalk.cyan('\n🔧 TOOL: planRoute()'));

        const game = this.game as TravelGame;
        const requiredCities = ['paris', 'tokyo', 'sydney', 'rio', 'capetown'];
        const remainingCities = requiredCities.filter((city) => !game.state.visitedCities.includes(city));

        // Simple heuristic: prefer closer/cheaper routes
        const suggestions: string[] = [];

        if (remainingCities.length > 0) {
            suggestions.push(
                `Visit remaining cities: ${remainingCities.map((c) => game.database.cities[c].name).join(', ')}`
            );
            suggestions.push(
                `Budget remaining: $${game.state.budget}, Steps remaining: ${MAX_STEPS - game.state.stepCount}`
            );
            suggestions.push('Consider cheaper transportation options for budget efficiency');
        } else {
            suggestions.push('All cities visited! Focus on efficient budget use.');
        }

        return this.createSuccessResult({
            currentCity: game.database.cities[game.state.currentCity].name,
            remainingCities: remainingCities.map((c) => game.database.cities[c].name),
            suggestions,
            progress: `${game.state.visitedCities.length}/6 cities visited`,
        });
    }
}

// Create game instance and tools
const gameInstance = new TravelGame();

export const travelGame: GameDefinition = {
    name: 'Travel Planning',
    systemPrompt,
    userPrompt,
    tools: {
        checkRoutes: createTool(new CheckRoutesTool(gameInstance)),
        travel: createTool(new TravelTool(gameInstance)),
        planRoute: createTool(new PlanRouteTool(gameInstance)),
    },
    maxSteps: MAX_STEPS,
    game: gameInstance,
};
