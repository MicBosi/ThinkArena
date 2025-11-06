import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the data
const dataPath = path.join(__dirname, '..', 'decoder.json');
const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Calculate comprehensive statistics
function calculateAllStats(data) {
    const results = {
        summary: {
            totalModels: Object.keys(data).length,
            totalRuns: 0,
            timestamp: new Date().toISOString()
        },
        models: {},
        rankings: {
            byAverageScore: [],
            bySuccessRate: [],
            bySpeed: [],
            byEfficiency: [],
            byConsistency: []
        }
    };

    // Process each model
    for (const [modelName, runs] of Object.entries(data)) {
        const scores = runs.map(r => r.score);
        const times = runs.map(r => r.time);
        const toolCalls = runs.map(r => r.toolCalls);
        const completedRuns = runs.filter(r => r.completed);
        const failedRuns = runs.filter(r => !r.completed);

        // Basic statistics
        const count = runs.length;
        const sum = scores.reduce((a, b) => a + b, 0);
        const averageScore = sum / count;

        // Completion statistics
        const completedCount = completedRuns.length;
        const failedCount = failedRuns.length;
        const successRate = (completedCount / count) * 100;

        // Time statistics (only for completed runs)
        const completedScores = completedRuns.map(r => r.score);
        const completedTimes = completedRuns.map(r => r.time);
        const avgTime = completedTimes.length > 0 ?
            completedTimes.reduce((a, b) => a + b, 0) / completedTimes.length : 0;

        // Time variance and standard deviation
        const timeVariance = completedTimes.length > 0 ?
            completedTimes.reduce((acc, time) => acc + Math.pow(time - avgTime, 2), 0) / completedTimes.length : 0;
        const timeStdDev = Math.sqrt(timeVariance);

        // Tool call statistics
        const avgToolCalls = toolCalls.reduce((a, b) => a + b, 0) / count;

        // Score statistics
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        const median = scores.slice().sort((a, b) => a - b)[Math.floor(count / 2)];

        // Variance and standard deviation
        const scoreVariance = scores.reduce((acc, score) => {
            return acc + Math.pow(score - averageScore, 2);
        }, 0) / count;
        const stdDev = Math.sqrt(scoreVariance);
        const coefficientOfVariation = (stdDev / averageScore) * 100;

        // Efficiency metrics
        const efficiency = avgToolCalls > 0 ? averageScore / avgToolCalls : 0;
        const speed = avgTime > 0 ? averageScore / avgTime : 0; // Score per second

        // Percentile calculations
        const sortedScores = scores.slice().sort((a, b) => a - b);
        const p25 = sortedScores[Math.floor(count * 0.25)];
        const p75 = sortedScores[Math.floor(count * 0.75)];
        const p90 = sortedScores[Math.floor(count * 0.90)];
        const p95 = sortedScores[Math.floor(count * 0.95)];

        // Consistency metrics (lower is better for stdDev and cv)
        const consistencyScore = 100 - coefficientOfVariation; // Higher is better

        // Store model statistics
        results.models[modelName] = {
            runs: {
                total: count,
                completed: completedCount,
                failed: failedCount,
                successRate: successRate
            },
            scores: {
                average: averageScore,
                median: median,
                min: minScore,
                max: maxScore,
                sum: sum,
                variance: scoreVariance,
                standardDeviation: stdDev,
                coefficientOfVariation: coefficientOfVariation,
                percentiles: {
                    p25: p25,
                    p50: median,
                    p75: p75,
                    p90: p90,
                    p95: p95
                }
            },
            time: {
                average: avgTime,
                completedRuns: completedTimes.length,
                standardDeviation: timeStdDev
            },
            toolCalls: {
                average: avgToolCalls
            },
            efficiency: {
                scorePerToolCall: efficiency,
                scorePerSecond: speed
            },
            consistency: {
                score: consistencyScore,
                rank: 0 // Will be calculated later
            },
            // Best and worst runs
            bestRun: {
                score: maxScore,
                time: runs.find(r => r.score === maxScore)?.time || 0,
                toolCalls: runs.find(r => r.score === maxScore)?.toolCalls || 0
            },
            worstRun: {
                score: minScore,
                time: runs.find(r => r.score === minScore)?.time || 0,
                toolCalls: runs.find(r => r.score === minScore)?.toolCalls || 0
            }
        };

        results.summary.totalRuns += count;
    }

    // Calculate rankings
    const modelEntries = Object.entries(results.models);

    // By Average Score (descending)
    results.rankings.byAverageScore = modelEntries
        .sort((a, b) => b[1].scores.average - a[1].scores.average)
        .map(([name, data], idx) => ({
            rank: idx + 1,
            model: name,
            value: data.scores.average,
            unit: 'points'
        }));

    // By Success Rate (descending)
    results.rankings.bySuccessRate = modelEntries
        .sort((a, b) => b[1].runs.successRate - a[1].runs.successRate)
        .map(([name, data], idx) => ({
            rank: idx + 1,
            model: name,
            value: data.runs.successRate,
            unit: 'percentage'
        }));

    // By Speed (descending - higher score per second is better)
    results.rankings.bySpeed = modelEntries
        .filter(([_, data]) => data.efficiency.scorePerSecond > 0)
        .sort((a, b) => b[1].efficiency.scorePerSecond - a[1].efficiency.scorePerSecond)
        .map(([name, data], idx) => ({
            rank: idx + 1,
            model: name,
            value: data.efficiency.scorePerSecond,
            unit: 'points/second'
        }));

    // By Efficiency (descending - higher score per tool call is better)
    results.rankings.byEfficiency = modelEntries
        .sort((a, b) => b[1].efficiency.scorePerToolCall - a[1].efficiency.scorePerToolCall)
        .map(([name, data], idx) => ({
            rank: idx + 1,
            model: name,
            value: data.efficiency.scorePerToolCall,
            unit: 'points/tool call'
        }));

    // By Consistency (descending - higher consistency score is better)
    results.rankings.byConsistency = modelEntries
        .sort((a, b) => b[1].consistency.score - a[1].consistency.score)
        .map(([name, data], idx) => ({
            rank: idx + 1,
            model: name,
            value: data.consistency.score,
            unit: 'consistency score'
        }));

    // Calculate overall recommendations
    results.recommendations = {
        bestOverall: results.rankings.byAverageScore[0].model,
        fastest: results.rankings.bySpeed[0]?.model || 'N/A',
        mostEfficient: results.rankings.byEfficiency[0].model,
        mostReliable: results.rankings.bySuccessRate[0].model,
        mostConsistent: results.rankings.byConsistency[0].model,
        useCases: {
            criticalProduction: {
                model: results.rankings.bySuccessRate[0].model,
                reason: "Highest success rate ensures reliable completions",
                score: results.rankings.bySuccessRate[0].value
            },
            rapidPrototyping: {
                model: results.rankings.bySpeed[0]?.model || results.rankings.byAverageScore[0].model,
                reason: "Fastest execution for quick iterations",
                score: results.rankings.bySpeed[0]?.value || results.rankings.byAverageScore[0].value
            },
            toolEfficiency: {
                model: results.rankings.byEfficiency[0].model,
                reason: "Maximizes output per tool call",
                score: results.rankings.byEfficiency[0].value
            },
            consistentPerformance: {
                model: results.rankings.byConsistency[0].model,
                reason: "Most predictable and stable results",
                score: results.rankings.byConsistency[0].value
            }
        }
    };

    return results;
}

// Calculate and save statistics
const stats = calculateAllStats(rawData);

// Write to stats.json
const outputPath = path.join(__dirname, 'stats.json');
fs.writeFileSync(outputPath, JSON.stringify(stats, null, 2));

console.log('Statistics calculated and saved to stats.json');
console.log('\n=== QUICK SUMMARY ===');
console.log(`Total Models: ${stats.summary.totalModels}`);
console.log(`Total Runs: ${stats.summary.totalRuns}`);
console.log('\n=== RANKING BY AVERAGE SCORE ===');
stats.rankings.byAverageScore.forEach(r => {
    console.log(`${r.rank}. ${r.model}: ${r.value.toFixed(0)} points`);
});
console.log('\n=== RANKING BY SUCCESS RATE ===');
stats.rankings.bySuccessRate.forEach(r => {
    console.log(`${r.rank}. ${r.model}: ${r.value.toFixed(1)}%`);
});
console.log('\n=== RANKING BY SPEED (Score/Second) ===');
stats.rankings.bySpeed.forEach(r => {
    console.log(`${r.rank}. ${r.model}: ${r.value.toFixed(2)} points/sec`);
});
console.log('\n=== RANKING BY EFFICIENCY (Score/Tool Call) ===');
stats.rankings.byEfficiency.forEach(r => {
    console.log(`${r.rank}. ${r.model}: ${r.value.toFixed(2)} points/call`);
});
console.log('\n=== RECOMMENDATIONS ===');
console.log(`Best Overall: ${stats.recommendations.bestOverall}`);
console.log(`Fastest: ${stats.recommendations.fastest}`);
console.log(`Most Efficient: ${stats.recommendations.mostEfficient}`);
console.log(`Most Reliable: ${stats.recommendations.mostReliable}`);
console.log(`Most Consistent: ${stats.recommendations.mostConsistent}`);
