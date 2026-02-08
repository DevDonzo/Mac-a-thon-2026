### Inspiration

The idea for CodeSensei came from a personal frustration I face every time I jump into a large codebase: the massive cognitive load of trying to keep the entire system architecture in my head. Most AI tools today are excellent at autocompleting a single line of code, but they struggle with "whole-repo" intelligence. They treat source code like a flat text document rather than the complex graph of symbols and dependencies that it actually is. I wanted to build a tool that did not just help me write code, but helped me master and visualize the architecture of my projects.

### How I Built It

I built CodeSensei as a bridge between the code editor and a high-level architectural view. The core engine is powered by Google Cloud's Vertex AI, specifically using Gemini 2.0 Flash for its reasoning speed and text-embedding-004 for semantic search. To make the AI truly understand the code, I implemented a custom AST parser using Babel. This allows the system to index code at the symbol level, identifying specific functions, classes, and variables, rather than using arbitrary character counts for chunking.

I integrated Backboard.io to handle persistent memory between the VS Code extension and the web dashboard. This ensures that the context of a conversation travels with the developer, regardless of which interface they are using. The dashboard itself uses force-directed graphs to visualize "Code DNA" and React Flow to create an interactive architecture builder, where users can visually design system changes that the AI then translates into technical refactor plans.

### Challenges I Faced

The most difficult technical challenge was implementing the "Architectural Sync." Translating a manual change on a visual canvas into a concrete, multi-file refactoring plan required the AI to have a near-perfect understanding of the existing dependency graph. I had to iterate extensively on the prompt engineering and the context retrieval logic to ensure the model would not hallucinate relationships that did not exist in the source code.

Another challenge was managing the signal-to-noise ratio in the retrieval-augmented generation (RAG) pipeline. Standard RAG often injects unrelated code snippets that can confuse an LLM. Solving this required building "AST-aware chunking," where the system respects the logical boundaries of the code, ensuring the AI always receives complete, meaningful symbols as context.

### What I Learned

This project taught me that the future of development tools is not about replacing the developer, but about augmenting their ability to reason about complex systems. I learned a massive amount about abstract syntax trees, vector embeddings, and the nuances of grounding LLMs in highly structured data like source code. Building this solo required wearing many hats, from extension development and backend architecture to data visualization, and it reinforced my belief that the most powerful developer tools are those that provide transparency and allow for a high degree of auditability.
