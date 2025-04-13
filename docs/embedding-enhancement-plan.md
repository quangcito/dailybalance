# Plan: Embedding Enhancement for Historical Context

**Date:** 2025-04-12

**Goal:** Enhance the DailyBalance answer engine by creating and storing embeddings for food, exercise, and interaction logs. This will allow retrieval of relevant historical data to improve personalization and context-awareness in responses. Additionally, populate the `dataSummary` field in the final response object with structured information derived during processing.

**Vector Databases:**
*   **pgvector (Supabase):** For `food_logs` and `exercise_logs`.
*   **Pinecone:** For `interaction_logs`.

**Embedding Model:**
*   OpenAI `text-embedding-3-small`
*   Dimension: **384**

**Proposed Embedding Content:**
*   **Food Logs:** Combine `name`, `meal_type`, and potentially `description`.
*   **Exercise Logs:** Combine `name` and `type`.
*   **Interaction Logs:** Combine `query` and `llmResponse.text`.

---

## Plan Phases

### Phase 1: Agentic Logging, Embedding Generation & Data Summary

*   **Step 1.1: Define Agentic Logging Logic (in `src/lib/llm/reasoning-layer.ts`)**
    *   Modify `generatePersonalizedInsights` (or helpers).
    *   Add logic (LLM call or structured output parsing) to analyze conversation/context and decide if a food/exercise log should be implicitly created.
    *   Define the structure of the log entry based on the analysis.
    *   Logging action (including embedding) will be handled within the reasoning layer or a function it calls.

*   **Step 1.2: Setup pgvector & Modify Supabase Tables**
    *   Ensure `vector` extension is enabled in Supabase (`CREATE EXTENSION IF NOT EXISTS vector;`).
    *   Add `embedding vector(384)` column to `food_logs` and `exercise_logs` tables via Supabase migrations.
    *   Add HNSW or IVFFlat index on the new vector columns for efficient search.

*   **Step 1.3: Setup/Verify Pinecone Index (for `interaction_logs`)**
    *   Verify the existing Pinecone index (`src/lib/vector-db/pinecone.ts`) can store interaction log embeddings with necessary metadata (`userId`, `sessionId`, `timestamp`, `dataSummary`). Adapt or create a new index/namespace if needed.

*   **Step 1.4: Implement Embedding Generation Function**
    *   Create utility function (e.g., `src/lib/utils/embeddings.ts`) using `text-embedding-3-small` via OpenAI client. Handle API keys.

*   **Step 1.5: Implement Saving Logs with Embeddings**
    *   **Supabase:** Modify/create functions in `src/lib/db/supabase.ts` to save `food_logs`/`exercise_logs`. Functions will accept log data, call embedding utility (Step 1.4), and insert data + vector.
    *   **Pinecone:** Modify `logInteraction` function (`src/lib/db/supabase.ts` or `src/lib/vector-db/pinecone.ts`). When logging interactions, generate embedding for (query + response text), call utility (Step 1.4), and upsert vector + metadata (including `dataSummary`) to Pinecone.

*   **Step 1.6: Integrate Saving into Logging Flow**
    *   **Agentic:** Within `reasoning-layer.ts`, when logic decides to log, call updated Supabase save functions (Step 1.5).
    *   **Interaction:** Existing `logInteraction` call in `orchestrator.ts` will now handle Pinecone embedding/saving via modifications in Step 1.5.

*   **Step 1.7: Define `dataSummary` Structure & Population Logic**
    *   Define the structure for `dataSummary` in `src/types/conversation.ts` (e.g., `{ loggedItems: [...], nutritionalTotals: {...}, exerciseSummary: {...} }`).
    *   Modify `generatePersonalizedInsights` in `src/lib/llm/reasoning-layer.ts` to populate and return this `dataSummary` object within its `ReasoningOutput`, based on context, history, and agentic logging actions.

### Phase 2: Embedding Retrieval & Integration

*   **Step 2.1: Implement Vector Search Functions**
    *   **Supabase:** Create functions in `src/lib/db/supabase.ts` for similarity search on `food_logs`/`exercise_logs` vector columns (filter by `userId`, date range).
    *   **Pinecone:** Create function in `src/lib/vector-db/pinecone.ts` for similarity search on interaction log index/namespace (filter by `userId`, `sessionId`, date range).

*   **Step 2.2: Add Retrieval Step to Orchestrator (`src/lib/llm/orchestrator.ts`)**
    *   Add a new node *before* `runReasoningLayer`.
    *   Node will: Generate query embedding (Step 1.4), call vector search functions (Step 2.1), add retrieved historical logs to `AgentState` (new fields: `historicalFoodLogs`, `historicalExerciseLogs`, `historicalInteractionLogs`).

*   **Step 2.3: Update Reasoning Layer to Use Retrieved History**
    *   Modify `runReasoningLayer` node and `generatePersonalizedInsights` signature (`src/lib/llm/reasoning-layer.ts`) to accept historical logs from `AgentState`.
    *   Update logic within `generatePersonalizedInsights` to use historical context (alongside daily context, profile) for insights, suggestions, and populating `dataSummary`.

*   **Step 2.4: Update Conversation Layer & Logging**
    *   Ensure `runConversationLayer` node passes the populated `dataSummary` (from reasoning output) into the final `StructuredAnswer` object.
    *   Ensure `logInteraction` saves the populated `dataSummary` within the `llmResponse` field in the `interaction_logs` table and Pinecone metadata.

---

## Mermaid Diagram

```mermaid
graph TD
    A[Input: User Query] --> B(Identify Target Date);
    B --> C(Fetch Daily Context - Supabase);
    C --> D(Analyze Query for Personalization);
    D -- Needs Personalization --> E(Fetch User Data - Supabase);
    D -- No Personalization --> F(Generate Query Embedding);
    E --> F;
    F --> G(Retrieve Historical Context - Vector Search);
    G -- Food/Exercise Logs --> H(Supabase/pgvector Search);
    G -- Interaction Logs --> I(Pinecone Search);
    H --> J(Add Historical Logs to State);
    I --> J;
    J --> K(Fetch Knowledge - Perplexity);
    K --> L(Run Reasoning Layer);
    L -- Use --> M[Daily Context];
    L -- Use --> N[User Profile];
    L -- Use --> O[Knowledge];
    L -- Use --> P[Retrieved Historical Logs];
    L -- Generates --> DS(Populated dataSummary);
    L -- Potentially Trigger --> Q(Agentic Logging);
    Q --> R(Generate Log Embedding);
    R --> S(Save Log + Embedding - Supabase/pgvector);
    L --> T(Run Conversation Layer);
    T -- Use --> DS;
    T --> U(Log Interaction + Embedding + dataSummary - Pinecone);
    U --> V(Output: Final Response w/ dataSummary);

    subgraph "Orchestrator State Updates"
        direction LR
        J -- Updates --> state1[AgentState: historicalLogs]
        L -- Updates --> state2[AgentState: reasoningOutput]
        S -- Updates --> db1[Supabase DB]
        U -- Updates --> db2[Pinecone DB & interaction_logs Table]
    end

    subgraph "Reasoning Layer Enhancement"
        direction TB
        L --- P
        L --- DS
    end

    style Q fill:#f9f,stroke:#333,stroke-width:2px
    style R fill:#f9f,stroke:#333,stroke-width:2px
    style S fill:#f9f,stroke:#333,stroke-width:2px
    style G fill:#ccf,stroke:#333,stroke-width:2px
    style H fill:#ccf,stroke:#333,stroke-width:2px
    style I fill:#ccf,stroke:#333,stroke-width:2px
    style J fill:#ccf,stroke:#333,stroke-width:2px
    style P fill:#ccf,stroke:#333,stroke-width:2px
    style DS fill:#fcf,stroke:#333,stroke-width:2px
