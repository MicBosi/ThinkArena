# Think Arena

Built using [AI SDK](https://ai-sdk.dev/) by Vercel, each model using the closest official adaptors.

Small game arena for LLMs, useful for:
- Evaluating interleaved thinking effectiveness across models and APIs.
- Evaluating thinking abilities across classes of problems.

At the moment there's only one main game 'decoder' as demo and reference:

```bash
# Play "decoder" game
npm install
npm run play:xai      # Grok Code Fast 1 / xAI APIs (XAI_API_KEY)
npm run play:m2       # MiniMax M2 / MiniMax APIs (MINIMAX_API_KEY)
npm run play:haiku    # Claude Haiku 4.5 / Anthropic APIs (ANTHROPIC_API_KEY)
npm run play:sonnet   # Claude Sonnet 4.5 / Anthropic APIs (ANTHROPIC_API_KEY)
npm run play:or-m2    # MiniMax M2 / OpenRouter APIs (OPENROUTER_API_KEY)
npm run play:or-haiku # Claude Haiku 4.5 / OpenRouter APIs (OPENROUTER_API_KEY)

# Play specific game
npx tsx src/play.ts decoder --xai
npx tsx src/play.ts travel --xai
```

## Build & Benchmark Your Game
Simply ask your AI agent to follow the instructions on AGENTS.md and describe your puzzle game to test how various models perform against it.

## Games

- **Alien Signal Decoder**: Decode mysterious signals through exploration and pattern recognition.
- **Travel Planning**: Optimize travel routes with resource constraints.

Other interesting ideas could be Mystery Solving, Escape Room, Treasure Hunting, ...

## Development

Built with TypeScript. See `AGENTS.md` for implementation guide.