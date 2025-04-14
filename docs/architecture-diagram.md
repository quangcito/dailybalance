# DailyBalance Architecture Diagram

This diagram illustrates the high-level architecture of the DailyBalance application, including the frontend, backend API, LLM orchestration layers, databases, caching, and external services.

```mermaid
graph TD
    subgraph "User's Device"
        Browser["User's Browser (Next.js Frontend)<br/>[React, Zustand, Shadcn/ui, Tailwind]"]
    end

    subgraph "Cloud Infrastructure (Vercel, Supabase, Pinecone, Upstash, External APIs)"
        subgraph "Vercel Platform"
            BackendAPI["Next.js Backend API (/api/conversation)"]
            subgraph "LLM Orchestrator (LangGraph)"
                direction LR
                Start["Request In"] --> FetchUser["Fetch User Profile/Goals (Supabase)"]
                FetchUser --> KnowledgeLayer["Knowledge Layer (Perplexity API)"]
                KnowledgeLayer -- "Factual Info" --> ReasoningLayer["Reasoning Layer (GPT-o1-mini + User Context)"]
                FetchUser -- "User Context" --> ReasoningLayer
                ReasoningLayer -- "Personalized Insights" --> ConversationLayer["Conversation Layer (GPT-4o-mini + History)"]
                FetchHistory["Fetch Conv. History (Pinecone)"] --> ConversationLayer
                ConversationLayer -- "Formatted Answer" --> LogInteraction["Log Interaction (Supabase)"]
                ConversationLayer -- "Update Memory" --> UpdateHistory["Update Conv. History (Pinecone)"]
                LogInteraction --> ResponseOut["Response Out"]
                UpdateHistory --> ResponseOut
                %% Optional Caching Step (could be added around layers)
                %% CacheCheck["Check/Update Cache (Redis)"]
            end
        end

        subgraph "Supabase Cloud"
            SupabaseDB["Supabase (PostgreSQL + pgvector)<br/>[User Profiles, Goals, Food/Exercise Logs, Interaction Logs, Embeddings]"]
        end

        subgraph "Pinecone Cloud"
            PineconeDB["Pinecone<br/>[Conversation History Vectors]"]
        end

        subgraph "Upstash Cloud"
            RedisCache["Upstash Redis<br/>[Caching Layer]"]
        end

        subgraph "External APIs"
            PerplexityAPI["Perplexity API"]
            OpenAI_API["OpenAI API (GPT-o1-mini, GPT-4o-mini)"]
        end
    end

    %% Connections
    Browser -- "HTTPS Request" --> BackendAPI
    BackendAPI -- "Orchestrates" --> KnowledgeLayer
    BackendAPI -- "Orchestrates" --> ReasoningLayer
    BackendAPI -- "Orchestrates" --> ConversationLayer
    BackendAPI -- "DB Calls" --> SupabaseDB
    BackendAPI -- "Vector DB Calls" --> PineconeDB
    BackendAPI -- "Cache Calls" --> RedisCache
    KnowledgeLayer -- "API Call" --> PerplexityAPI
    ReasoningLayer -- "API Call" --> OpenAI_API
    ConversationLayer -- "API Call" --> OpenAI_API

    %% Styling
    classDef frontend fill:#f9f,stroke:#333,stroke-width:2px,color:#000;
    classDef backend fill:#ccf,stroke:#333,stroke-width:2px,color:#000;
    classDef orchestrator fill:#dde,stroke:#555,stroke-width:1px,color:#000; %% This style is defined but not explicitly used on a single node now
    classDef database fill:#cfc,stroke:#333,stroke-width:2px,color:#000;
    classDef cache fill:#ffc,stroke:#333,stroke-width:2px,color:#000;
    classDef external fill:#fcc,stroke:#333,stroke-width:2px,color:#000;
    classDef llm_layer fill:#eef,stroke:#777,stroke-width:1px,color:#000;


    class Browser frontend;
    class BackendAPI backend;
    class KnowledgeLayer,ReasoningLayer,ConversationLayer llm_layer;
    class SupabaseDB,PineconeDB database;
    class RedisCache cache;
    class PerplexityAPI,OpenAI_API external;
