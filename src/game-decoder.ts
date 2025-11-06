import { z } from 'zod';
import chalk from 'chalk';
import { BaseTool, ToolResult, createTool } from './tools.js';
import { Game } from './interfaces.js';

const MAX_STEPS = 20;

/**
 * Alien Signal Decoder
 *
 * A strategic exploration and puzzle-solving game where the AI must navigate an alien planet,
 * gather signals and artifacts, decode patterns, and uncover the central mystery.
 *
 * Tests: Reasoning, information gathering, exploration, reflection on progress,
 * pattern recognition, resource management, and adaptive planning.
 */

// System prompt
const systemPrompt = `You are an expert alien signal decoder exploring a mysterious planet to uncover its central secret signal.

GOAL:
Your goal is to reach the 'signal_source' with 3+ decoded signals and use finalizeDiscovery() to complete the mission and unlock Omega (500 pts)!

GAME RULES:
- Start at landing_zone with 30 energy
- Actions cost energy (move: 1-4 based on risk, collect:1, analyze:1, decode:2, plan:1)
- Some artifacts provide special abilities when collected
- Max ${MAX_STEPS} steps total - plan carefully!

IMPORTANT - SIGNAL NAMES:
- When you see signals like "harmonic_sequence: Gamma harmonics...", use just the NAME part
- Example: analyzeClue("harmonic_sequence") not the full description
- Same for decodeSignal: use names like decodeSignal("basic_frequency", "harmonic_sequence")

SCORING (all bonuses stack):
- Base: exploring areas (+10-30), collecting artifacts (+20-50), analyzing clues (+30), decoding signals (+100-150)
- Energy bonus: 10 pts per remaining energy
- Efficiency bonus: 100 pts if avg score/step >50, 200 pts if >100

STRATEGY TIPS:
1. Use planOptimalRoute() at the start to think through your strategy (costs 0 energy, 1 step)
2. Use exploreConnections() to see where you can go (costs 0 energy, 1 step)
3. Collect artifacts early - some reduce energy costs significantly!
4. Move to connected areas, prioritize low risk to conserve energy
5. Analyze signals using their NAMES (e.g., "harmonic_sequence")
6. Decode by combining compatible signal names
7. Call multiple tools in parallel to save steps - you can move, collect, and analyze in any combination in any amount per turn so you can move faster and gather more resources

ARTIFACT ABILITIES:
- signal_scanner: Reduces decode cost from 2 to 1 energy (collect at landing_zone!)
- energy_crystal: Use useEnergyCrystal() to restore 5 energy (one-time use)
- vibration_analyzer: Reduces analyze cost to 0 in harmonic/crystal areas
- symbol_decoder: Translates ancient cipher symbols

COMPLETE MAP REFERENCE:
landing_zone (low risk, connections: volcanic_plains, crystal_forest)
  Signals: basic_frequency
  Artifacts: signal_scanner, energy_crystal

volcanic_plains (medium risk, connections: landing_zone, underground_caverns, ancient_ruins)
  Signals: interference_pattern
  Artifacts: heat_resistant_probe, lava_sample

crystal_forest (low risk, connections: landing_zone, hidden_lake, ancient_ruins)
  Signals: harmonic_sequence
  Artifacts: vibration_analyzer, crystal_shard

underground_caverns (high risk, connections: volcanic_plains, signal_source)
  Signals: echo_code
  Artifacts: echo_locator, fossil_remnant

hidden_lake (medium risk, connections: crystal_forest, signal_source)
  Signals: wave_ripple
  Artifacts: water_sampler, aquatic_artifact

ancient_ruins (medium risk, connections: volcanic_plains, crystal_forest)
  Signals: symbol_cipher
  Artifacts: symbol_decoder, engraved_tablet

signal_source (very_high risk, connections: underground_caverns, hidden_lake)
  Signals: core_transmission
  Artifacts: master_artifact

VALID SIGNAL COMBINATIONS (6 total - must decode 3+ to win):
1. basic_frequency + harmonic_sequence → Alpha-Gamma Harmonic Link (100 pts)
2. interference_pattern + echo_code → Beta-Delta Thermal Echo (120 pts)
3. wave_ripple + symbol_cipher → Epsilon-Zeta Ancient Code (150 pts)
4. basic_frequency + interference_pattern → Alpha-Beta Baseline (90 pts)
5. harmonic_sequence + wave_ripple → Gamma-Epsilon Resonance (110 pts)
6. echo_code + symbol_cipher → Delta-Zeta Underground Cipher (130 pts)
`;

// User prompt
const userPrompt = `You are exploring an alien planet to decode its mystery signal. You have ${MAX_STEPS} steps and 30 energy. Explore areas, collect artifacts, analyze signals, and decode patterns to reach signal_source with 3+ decoded signals. Use exploreConnections() to see available paths and planOptimalRoute() to plan strategy.`;

// Game state with scoring
interface GameState {
  position: string;
  energy: number;
  artifacts: string[];
  decodedSignals: string[];
  exploredAreas: string[];
  gatheredClues: string[];
  hypotheses: string[];
  score: number;
  stepCount: number;
  bonusesEarned: string[];
  completed: boolean;
}

// Area database with descriptions, artifacts, signals, and connections
interface AreaInfo {
  description: string;
  artifacts: string[];
  signals: string[];
  connections: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'very_high';
  explored: boolean;
}

// Artifact database with properties and uses
interface ArtifactInfo {
  value: number;
  type: string;
  aidsIn: string[];
  hint: string;
}

class DecoderGame implements Game {
  state: GameState;
  database = {
    area: {} as Record<string, AreaInfo>,
    artifact: {} as Record<string, ArtifactInfo>,
    signal: {} as Record<string, { decoded: string; value: number; bonus: string }>,
  };
  constructor() {
    this.init();
  }

  getFinalScore(): number {
    // Energy bonus
    const energyBonus = this.state.energy * 10;

    // Efficiency bonus
    const efficiency = this.state.stepCount > 0 ? this.state.score / this.state.stepCount : 0;
    let efficiencyBonus = 0;
    if (efficiency > 100) {
      efficiencyBonus = 200;
    } else if (efficiency > 50) {
      efficiencyBonus = 100;
    }

    // Reflection bonus
    const reflectionBonus = this.state.hypotheses.length * 50;

    // Return current score with all bonuses
    return this.state.score + energyBonus + efficiencyBonus + reflectionBonus;
  }

  isCompleted(): boolean {
    return this.state.completed;
  }

  init(): void {
    this.state = {
      position: 'landing_zone',
      energy: 30, // Increased from 15 to make game winnable
      artifacts: [],
      decodedSignals: [],
      exploredAreas: ['landing_zone'],
      gatheredClues: [],
      hypotheses: [],
      score: 0,
      stepCount: 0,
      bonusesEarned: [],
      completed: false,
    };

    this.database.area = {
      landing_zone: {
        description: 'Your starting point with basic equipment and faint signal readings.',
        artifacts: ['signal_scanner', 'energy_crystal'],
        signals: ['basic_frequency: Alpha waves detected - pattern repeats every 3 units'],
        connections: ['volcanic_plains', 'crystal_forest'],
        riskLevel: 'low',
        explored: true,
      },
      volcanic_plains: {
        description: 'Hot, rocky terrain with geothermal activity and strong interference.',
        artifacts: ['heat_resistant_probe', 'lava_sample'],
        signals: ['interference_pattern: Beta spikes - correlates with heat sources, offset by 2'],
        connections: ['landing_zone', 'underground_caverns', 'ancient_ruins'],
        riskLevel: 'medium',
        explored: false,
      },
      crystal_forest: {
        description: 'Dense forest of glowing crystals emitting harmonic vibrations.',
        artifacts: ['vibration_analyzer', 'crystal_shard'],
        signals: ['harmonic_sequence: Gamma harmonics - builds on alpha, multiplies by 1.5'],
        connections: ['landing_zone', 'hidden_lake', 'ancient_ruins'],
        riskLevel: 'low',
        explored: false,
      },
      underground_caverns: {
        description: 'Dark caves with echoing sounds and hidden chambers.',
        artifacts: ['echo_locator', 'fossil_remnant'],
        signals: ['echo_code: Delta echoes - reflects beta, inverts every 4th unit'],
        connections: ['volcanic_plains', 'signal_source'],
        riskLevel: 'high',
        explored: false,
      },
      hidden_lake: {
        description: 'Serene lake with bioluminescent waters and submerged relics.',
        artifacts: ['water_sampler', 'aquatic_artifact'],
        signals: ['wave_ripple: Epsilon ripples - combines gamma and alpha, averages values'],
        connections: ['crystal_forest', 'signal_source'],
        riskLevel: 'medium',
        explored: false,
      },
      ancient_ruins: {
        description: 'Ruined structures with engraved symbols and faded tech.',
        artifacts: ['symbol_decoder', 'engraved_tablet'],
        signals: ['symbol_cipher: Zeta symbols - synthesizes beta and delta, shifts by 3'],
        connections: ['volcanic_plains', 'crystal_forest'],
        riskLevel: 'medium',
        explored: false,
      },
      signal_source: {
        description: 'The core mystery site with overwhelming signal strength.',
        artifacts: ['master_artifact'],
        signals: [
          'core_transmission: Omega core - integrates all patterns, solve with combined clues',
        ],
        connections: ['underground_caverns', 'hidden_lake'],
        riskLevel: 'very_high',
        explored: false,
      },
    };

    this.database.artifact = {
      signal_scanner: {
        value: 20,
        type: 'tool',
        aidsIn: ['decode_signal'],
        hint: 'Reduces decode energy cost from 2 to 1',
      },
      energy_crystal: {
        value: 15,
        type: 'resource',
        aidsIn: ['restore_energy'],
        hint: 'Use to restore 5 energy (one-time consumable)',
      },
      heat_resistant_probe: {
        value: 30,
        type: 'tool',
        aidsIn: ['explore_high_risk'],
        hint: 'Provides data about thermal patterns',
      },
      lava_sample: {
        value: 25,
        type: 'sample',
        aidsIn: ['analyze_clue'],
        hint: 'Contains thermal data useful for pattern analysis',
      },
      vibration_analyzer: {
        value: 35,
        type: 'tool',
        aidsIn: ['decode_signal'],
        hint: 'Reduces analyze cost to 0 in harmonic/crystal areas',
      },
      crystal_shard: {
        value: 20,
        type: 'sample',
        aidsIn: ['combine_artifacts'],
        hint: 'Crystalline sample with harmonic properties',
      },
      echo_locator: {
        value: 40,
        type: 'tool',
        aidsIn: ['navigate'],
        hint: 'Helps map underground connections',
      },
      fossil_remnant: {
        value: 30,
        type: 'sample',
        aidsIn: ['analyze_clue'],
        hint: 'Ancient biological data for pattern recognition',
      },
      water_sampler: {
        value: 25,
        type: 'tool',
        aidsIn: ['explore_medium_risk'],
        hint: 'Useful for analyzing aquatic signals',
      },
      aquatic_artifact: {
        value: 35,
        type: 'relic',
        aidsIn: ['combine_artifacts'],
        hint: 'Ancient tech from submerged ruins',
      },
      symbol_decoder: {
        value: 45,
        type: 'tool',
        aidsIn: ['decode_signal'],
        hint: 'Translates ancient cipher symbols',
      },
      engraved_tablet: {
        value: 40,
        type: 'relic',
        aidsIn: ['analyze_clue'],
        hint: 'Contains key cipher patterns',
      },
      master_artifact: {
        value: 100,
        type: 'core',
        aidsIn: ['final_decode'],
        hint: 'Central mystery artifact at signal source',
      },
    };

    this.database.signal = {
      // Compatible signal combinations
      'basic_frequency+harmonic_sequence': {
        decoded: 'Alpha-Gamma Harmonic Link',
        value: 100,
        bonus: 'pattern_chain',
      },
      'interference_pattern+echo_code': {
        decoded: 'Beta-Delta Thermal Echo',
        value: 120,
        bonus: 'risk_reward',
      },
      'wave_ripple+symbol_cipher': {
        decoded: 'Epsilon-Zeta Ancient Code',
        value: 150,
        bonus: 'synthesis',
      },
      // Additional valid combinations for more strategic options
      'basic_frequency+interference_pattern': {
        decoded: 'Alpha-Beta Baseline',
        value: 90,
        bonus: 'foundation',
      },
      'harmonic_sequence+wave_ripple': {
        decoded: 'Gamma-Epsilon Resonance',
        value: 110,
        bonus: 'resonance',
      },
      'echo_code+symbol_cipher': {
        decoded: 'Delta-Zeta Underground Cipher',
        value: 130,
        bonus: 'ancient_link',
      },
    };
  }
}

/**
 * ExploreConnections tool - List connected areas from current position
 */
class ExploreConnectionsTool extends BaseTool {
  constructor(game: DecoderGame) {
    super(game);
  }

  description =
    'List all connected areas from your current position, including risk levels and exploration status. Costs 0 energy.';

  schema = z.object({});

  public async execute(): Promise<ToolResult> {
    console.log(chalk.cyan('\n🔧 TOOL: exploreConnections()'));

    const game = this.game as DecoderGame;
    console.log(chalk.yellow(`📍 Current location: ${game.state.position}`));
    game.state.stepCount++;

    const currentArea = game.database.area[game.state.position];
    const connections = currentArea.connections.map((areaName) => {
      const area = game.database.area[areaName];
      return {
        name: areaName,
        explored: area.explored ? '✓ explored' : '⚠ unexplored',
        risk: area.riskLevel,
        energyCost: { low: 1, medium: 2, high: 3, very_high: 4 }[area.riskLevel],
        description: area.description,
      };
    });

    return this.createSuccessResult({
      success: true,
      currentPosition: game.state.position,
      connectedAreas: connections,
      energyRemaining: game.state.energy,
      stepsUsed: game.state.stepCount,
    });
  }
}

/**
 * MoveToArea tool - Move to a connected area
 */
class MoveToAreaTool extends BaseTool {
  constructor(game: DecoderGame) {
    super(game);
  }

  description =
    'Move to a connected area. Costs energy based on risk level (low:1, medium:2, high:3, very_high:4). Updates position and explores.';

  schema = z.object({
    area: z.string().describe('Area to move to (must be connected to current position)'),
  });

  public async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { area } = params as { area: string };
    console.log(chalk.cyan(`\n🔧 TOOL: moveToArea("${area}")`));

    const game = this.game as DecoderGame;

    const currentArea = game.database.area[game.state.position];
    const targetArea = game.database.area[area];

    if (!targetArea) {
      return this.createErrorResult('Unknown area');
    }

    if (!currentArea.connections.includes(area)) {
      return this.createErrorResult('Not connected to current position');
    }

    const riskCosts: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      very_high: 4,
    };
    const energyCost = riskCosts[targetArea.riskLevel];
    if (game.state.energy < energyCost) {
      return this.createErrorResult(
        `Insufficient energy. Required: ${energyCost}, Available: ${game.state.energy}`
      );
    }

    game.state.energy -= energyCost;
    game.state.stepCount++;
    game.state.position = area;
    if (!targetArea.explored) {
      targetArea.explored = true;
      game.state.exploredAreas.push(area);
      const exploreBonus = energyCost * 10;
      game.state.score += exploreBonus;
      return this.createSuccessResult({
        success: true,
        newPosition: area,
        description: targetArea.description,
        signalsAvailable: targetArea.signals,
        artifactsAvailable: targetArea.artifacts,
        exploreBonus,
        currentScore: game.state.score,
        energyRemaining: game.state.energy,
      });
    } else {
      return this.createSuccessResult({
        success: true,
        newPosition: area,
        message: 'Returned to previously explored area',
        currentScore: game.state.score,
        energyRemaining: game.state.energy,
        stepsUsed: game.state.stepCount,
      });
    }
  }
}

/**
 * CollectArtifact tool - Collect an available artifact
 */
class CollectArtifactTool extends BaseTool {
  constructor(game: DecoderGame) {
    super(game);
  }

  description =
    'Collect an available artifact in the current area. Costs 1 energy. Adds to inventory and scores base value.';

  schema = z.object({
    artifact: z.string().describe('Artifact to collect'),
  });

  public async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { artifact } = params as { artifact: string };
    console.log(chalk.cyan(`\n🔧 TOOL: collectArtifact("${artifact}")`));

    const energyCost = 1;
    const game = this.game as DecoderGame;

    if (game.state.energy < energyCost) {
      return this.createErrorResult(
        `Insufficient energy. Required: ${energyCost}, Available: ${game.state.energy}`
      );
    }

    const currentArea = game.database.area[game.state.position];
    if (!currentArea.artifacts.includes(artifact)) {
      return this.createErrorResult('Artifact not available here');
    }

    if (game.state.artifacts.includes(artifact)) {
      return this.createErrorResult('Already collected');
    }

    game.state.energy -= energyCost;
    game.state.stepCount++;
    game.state.artifacts.push(artifact);

    const artifactData = game.database.artifact[artifact];
    game.state.score += artifactData.value;

    // Remove from area
    const index = currentArea.artifacts.indexOf(artifact);
    if (index > -1) {
      currentArea.artifacts.splice(index, 1);
    }

    return this.createSuccessResult({
      success: true,
      artifact,
      value: artifactData.value,
      hint: artifactData.hint,
      currentScore: game.state.score,
      energyRemaining: game.state.energy,
      stepsUsed: game.state.stepCount,
    });
  }
}

/**
 * AnalyzeClue tool - Analyze a signal or clue
 */
class AnalyzeClueTool extends BaseTool {
  constructor(game: DecoderGame) {
    super(game);
  }

  description =
    'Analyze a signal or clue in the current area. Costs 1 energy (0 if you have vibration_analyzer in harmonic areas). Pass the signal name (e.g., "harmonic_sequence") or full signal string.';

  schema = z.object({
    signal: z
      .string()
      .describe('Signal name to analyze (e.g., "harmonic_sequence", "basic_frequency")'),
  });

  public async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { signal } = params as { signal: string };
    console.log(chalk.cyan(`\n🔧 TOOL: analyzeClue("${signal}")`));

    const game = this.game as DecoderGame;

    // Check if vibration_analyzer reduces cost in harmonic areas
    let energyCost = 1;
    const hasVibrationAnalyzer = game.state.artifacts.includes('vibration_analyzer');
    const currentArea = game.database.area[game.state.position];
    const isHarmonicArea = currentArea.signals.some(
      (s) => s.includes('harmonic') || s.includes('Gamma')
    );

    if (hasVibrationAnalyzer && isHarmonicArea) {
      energyCost = 0;
    }

    if (game.state.energy < energyCost) {
      return this.createErrorResult(
        `Insufficient energy. Required: ${energyCost}, Available: ${game.state.energy}`
      );
    }

    // Find the matching signal - allow partial match on signal name (before colon)
    const matchingSignal = currentArea.signals.find((s) => {
      const signalName = s.split(':')[0].trim();
      const inputName = signal.split(':')[0].trim();
      return signalName === inputName || s === signal;
    });

    if (!matchingSignal) {
      return this.createErrorResult(
        `Signal not available here. Available signals: ${currentArea.signals.map((s) => s.split(':')[0]).join(', ')}`
      );
    }

    if (game.state.gatheredClues.includes(matchingSignal)) {
      return this.createErrorResult('Already analyzed');
    }

    game.state.energy -= energyCost;
    game.state.stepCount++;
    game.state.gatheredClues.push(matchingSignal);

    const analysisBonus = 30;
    game.state.score += analysisBonus;

    return this.createSuccessResult({
      success: true,
      signal: matchingSignal,
      signalName: matchingSignal.split(':')[0].trim(),
      details: matchingSignal.split(': ')[1],
      energyCost,
      reducedCost: hasVibrationAnalyzer && isHarmonicArea,
      analysisBonus,
      currentScore: game.state.score,
      energyRemaining: game.state.energy,
      stepsUsed: game.state.stepCount,
      hint: 'Use this signal name with others in decodeSignal()',
    });
  }
}

/**
 * DecodeSignal tool - Attempt to decode a signal
 */
class DecodeSignalTool extends BaseTool {
  constructor(game: DecoderGame) {
    super(game);
  }

  description =
    'Attempt to decode a signal using two analyzed signals. Costs 2 energy (1 if you have signal_scanner). Pass signal names like "harmonic_sequence" and "basic_frequency".';

  schema = z.object({
    signal1: z.string().describe('First signal name (e.g., "harmonic_sequence")'),
    signal2: z.string().describe('Second signal name (e.g., "basic_frequency")'),
  });

  public async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { signal1, signal2 } = params as { signal1: string; signal2: string };
    console.log(chalk.cyan(`\n🔧 TOOL: decodeSignal("${signal1}", "${signal2}")`));

    const game = this.game as DecoderGame;

    // Check if signal_scanner reduces cost
    let energyCost = 2;
    const hasSignalScanner = game.state.artifacts.includes('signal_scanner');
    if (hasSignalScanner) {
      energyCost = 1;
    }

    if (game.state.energy < energyCost) {
      return this.createErrorResult(
        `Insufficient energy. Required: ${energyCost}, Available: ${game.state.energy}`
      );
    }

    // Find matching clues - allow flexible matching
    const findClue = (input: string) => {
      return game.state.gatheredClues.find((clue) => {
        const clueName = clue.split(':')[0].trim();
        const inputName = input.split(':')[0].trim();
        return clueName === inputName || clue === input;
      });
    };

    const clue1 = findClue(signal1);
    const clue2 = findClue(signal2);

    if (!clue1 || !clue2) {
      return this.createErrorResult(
        `Missing required clues. Gathered: ${game.state.gatheredClues.map((c) => c.split(':')[0]).join(', ')}`
      );
    }

    const comboKey1 = `${clue1.split(':')[0].trim()}+${clue2.split(':')[0].trim()}`;
    const comboKey2 = `${clue2.split(':')[0].trim()}+${clue1.split(':')[0].trim()}`;
    const recipe = game.database.signal[comboKey1] || game.database.signal[comboKey2];

    if (!recipe) {
      return this.createErrorResult(
        `Incompatible signals. Try different combinations from: ${game.state.gatheredClues.map((c) => c.split(':')[0]).join(', ')}`
      );
    }

    const decodedKey = `${clue1}+${clue2}`;
    const reverseKey = `${clue2}+${clue1}`;
    if (
      game.state.decodedSignals.includes(decodedKey) ||
      game.state.decodedSignals.includes(reverseKey)
    ) {
      return this.createErrorResult('Already decoded this combination');
    }

    // Only deduct energy if all validations pass and decode will succeed
    game.state.energy -= energyCost;
    game.state.stepCount++;
    game.state.decodedSignals.push(decodedKey);
    game.state.score += recipe.value;
    game.state.bonusesEarned.push(recipe.bonus);

    return this.createSuccessResult({
      success: true,
      decoded: recipe.decoded,
      value: recipe.value,
      bonus: recipe.bonus,
      energyCost,
      reducedCost: hasSignalScanner,
      currentScore: game.state.score,
      energyRemaining: game.state.energy,
      stepsUsed: game.state.stepCount,
    });
  }
}

/**
 * PlanOptimalRoute tool - Plan an optimal route
 */
class PlanOptimalRouteTool extends BaseTool {
  description = 'Plan and think through an optimal route without executing moves.';

  schema = z.object({
    moves: z.array(z.string()).describe('Array of planned moves describing your strategy'),
  });

  public async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { moves } = params as { moves: string[] };
    console.log(chalk.cyan('\n🔧 TOOL: planOptimalRoute()'));
    moves.forEach((move, idx) => console.log(chalk.white.dim(`  ${idx + 1}. ${move}`)));

    const game = this.game as DecoderGame;
    game.state.stepCount++;

    return this.createSuccessResult({
      moves: moves,
    });
  }
}

/**
 * UseEnergyCrystal tool - Use energy crystal to restore energy
 */
class UseEnergyCrystalTool extends BaseTool {
  constructor(game: DecoderGame) {
    super(game);
  }

  description =
    'Use an energy crystal to restore 5 energy. Costs 0 energy but consumes the crystal. Must have energy_crystal in inventory.';

  schema = z.object({});

  public async execute(): Promise<ToolResult> {
    console.log(chalk.cyan('\n🔧 TOOL: useEnergyCrystal()'));

    const game = this.game as DecoderGame;

    if (!game.state.artifacts.includes('energy_crystal')) {
      return this.createErrorResult('No energy crystal in inventory - collect it first');
    }

    game.state.stepCount++;

    // Remove crystal from inventory
    const index = game.state.artifacts.indexOf('energy_crystal');
    game.state.artifacts.splice(index, 1);

    // Restore energy
    game.state.energy += 5;

    return this.createSuccessResult({
      success: true,
      energyRestored: 5,
      energyRemaining: game.state.energy,
      message: 'Energy crystal consumed, 5 energy restored!',
      stepsUsed: game.state.stepCount,
    });
  }
}

/**
 * FinalizeDiscovery tool - Finalize exploration by decoding the core signal
 */
class FinalizeDiscoveryTool extends BaseTool {
  description =
    'Finalize your exploration by attempting to decode the core signal. Ends the game if you have 3+ decoded signals.';

  schema = z.object({
    finalHypothesis: z.string().describe('Your final theory on the signal source'),
  });

  public async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { finalHypothesis } = params as { finalHypothesis: string };
    console.log(chalk.cyan(`\n🔧 TOOL: finalizeDiscovery("${chalk.magenta(finalHypothesis)}")`));

    const game = this.game as DecoderGame;

    game.state.stepCount++;

    // Check if at signal_source and have at least 3 decoded signals
    const isAtSource = game.state.position === 'signal_source';
    const hasMinimumDecodes = game.state.decodedSignals.length >= 3;

    if (!isAtSource) {
      return this.createErrorResult('Must be at signal_source to finalize discovery');
    }

    if (!hasMinimumDecodes) {
      return this.createErrorResult(
        `Need at least 3 decoded signals. Currently have: ${game.state.decodedSignals.length}`
      );
    }

    // Mark game as completed
    game.state.completed = true;

    // Award Omega Revelation bonus for successful completion
    const omegaBonus = 500;
    game.state.score += omegaBonus;
    game.state.bonusesEarned.push('omega_revelation');

    // Energy bonus
    const energyBonus = game.state.energy * 10;

    // Efficiency bonus
    const efficiency =
      game.state.stepCount > 0 ? (game.state.score / game.state.stepCount).toFixed(1) : '0';
    let efficiencyBonus = 0;
    if (parseFloat(efficiency) > 100) {
      efficiencyBonus = 200;
    } else if (parseFloat(efficiency) > 50) {
      efficiencyBonus = 100;
    }

    const finalScore = game.state.score + energyBonus + efficiencyBonus;

    return this.createSuccessResult({
      gameEnded: true,
      baseScore: game.state.score,
      omegaBonus,
      energyBonus,
      efficiencyBonus,
      finalScore,
      stepsUsed: game.state.stepCount,
      areasExplored: game.state.exploredAreas.length,
      cluesGathered: game.state.gatheredClues.length,
      signalsDecoded: game.state.decodedSignals.length,
      finalHypothesis: finalHypothesis,
      ranking:
        finalScore > 1500
          ? 'MASTER DECODER'
          : finalScore > 1000
            ? 'EXPERT DECODER'
            : finalScore > 600
              ? 'SKILLED DECODER'
              : 'NOVICE DECODER',
      message: `🏆 OMEGA REVELATION UNLOCKED! Final Score: ${finalScore} points! Rank: ${finalScore > 1500 ? 'MASTER' : finalScore > 1000 ? 'EXPERT' : finalScore > 600 ? 'SKILLED' : 'NOVICE'}`,
    });
  }
}

// Export game definition factory
export const createDecoderGame = (game: DecoderGame) => ({
  name: 'Alien Signal Decoder - Adaptive Reasoning Test',
  systemPrompt,
  userPrompt,
  tools: {
    exploreConnections: createTool(new ExploreConnectionsTool(game)),
    moveToArea: createTool(new MoveToAreaTool(game)),
    collectArtifact: createTool(new CollectArtifactTool(game)),
    analyzeClue: createTool(new AnalyzeClueTool(game)),
    decodeSignal: createTool(new DecodeSignalTool(game)),
    useEnergyCrystal: createTool(new UseEnergyCrystalTool(game)),
    planOptimalRoute: createTool(new PlanOptimalRouteTool(game)),
    finalizeDiscovery: createTool(new FinalizeDiscoveryTool(game)),
  },
  maxSteps: MAX_STEPS,
  game,
});

// Export game definition with new instance
export const decoderGame = createDecoderGame(new DecoderGame());
