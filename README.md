# DailyBalance: Your AI-Powered Nutrition & Exercise Partner

DailyBalance is an intelligent answer engine designed to help users maintain nutritional and exercise balance. It utilizes a Retrieval-Augmented Generation (RAG) approach, grounding its real-time, personalized recommendations in the user's daily food intake and exercise activities logged within the system, combined with their health profile and goals.

## Key Features

*   **RAG-Based Personalization:** Recommendations are grounded in your logged food and exercise data.
*   **Smart Time Context:** Recommendations adapt based on the time of day (morning, midday, evening).
*   **Intelligent Caloric Balance:** Dynamically calculates and visualizes your caloric intake versus expenditure.
*   **Personalized Next Steps:** Suggests relevant next meals or exercises based on identified nutritional gaps or energy levels.
*   **Contextual Memory:** Learns your frequent inputs and tracks patterns/preferences over time.
*   **Manual Logging:** Allows users to manually log food intake and exercise activities.
*   **Data Visualization:** Provides insights into trends and progress via a dedicated Stats page.

## Technology Stack & Dependencies

This project leverages a modern web stack and several third-party services:

*   **Frontend:** [Next.js](https://nextjs.org/) (App Router) with TypeScript, [Tailwind CSS](https://tailwindcss.com/), and [Shadcn/ui](https://ui.shadcn.com/). State management with [Zustand](https://github.com/pmndrs/zustand) is planned/in progress. **Note:** Currently uses local storage to manage a guest user ID; full authentication is not yet implemented.
*   **Backend:** Next.js API Routes.
*   **LLM Orchestration:** [LangChain.js](https://js.langchain.com/) with [LangGraph](https://js.langchain.com/docs/langgraph) implementing a multi-layer approach:
    *   **Knowledge Layer:** [Perplexity AI API](https://docs.perplexity.ai/) (Sonar model for factual retrieval).
    *   **Reasoning Layer:** [OpenAI API](https://openai.com/api/) (GPT-4o-mini for personalization, informed by RAG).
    *   **Conversation Layer:** OpenAI API (GPT-4o-mini for natural language interaction and context).
*   **Databases & Storage:**
    *   **[Supabase](https://supabase.com/):** PostgreSQL database (using `pgvector` for embeddings) for user data, food/exercise logs (used in RAG), and interaction history.
    *   **[Pinecone](https://www.pinecone.io/):** Vector database for conversation memory.
    *   **[Upstash Redis](https://upstash.com/):** (Planned) Caching layer.
*   **Deployment:** Hosted on [Vercel](https://vercel.com/).

## Usage

1.  **Setup:** Follow the instructions in the "Running Locally" section below to set up environment variables (API keys for Supabase, OpenAI, Perplexity, Pinecone are required) and the local Supabase database.
2.  **Interact:** Use the main chat interface to ask questions and receive personalized recommendations based on your logged data.
3.  **Log Data:** Navigate to the "Food Logs" and "Exercise Logs" pages to manually input your daily activities. This data is crucial for the RAG system.
4.  **View Progress:** Check the "Profile" page to manage your health details and goals, and the "Stats" page for insights into your progress.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Running Locally

To run this application locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or yarn install or pnpm install
    ```

3.  **Set up Environment Variables:**
    *   Copy the example environment file (if one exists, e.g., `.env.example`) to `.env.local`:
        ```bash
        cp .env.example .env.local
        ```
    *   If no example file exists, create a new file named `.env.local` in the root directory.
    *   Fill in the required environment variables in `.env.local`. You will need credentials/URLs for:
        *   **Supabase:** Project URL and Anon Key (obtain from your Supabase project dashboard).
        *   **OpenAI:** API Key (obtain from OpenAI).
        *   **Perplexity AI:** API Key (obtain from Perplexity).
        *   **Pinecone:** API Key and Environment (obtain from Pinecone).
        *   *(Note: Upstash Redis is planned but not yet implemented, so no keys are needed for it at this time.)*

    Example `.env.local` structure:
    ```plaintext
    # Supabase
    NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
    SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY # If needed for backend operations

    # OpenAI
    OPENAI_API_KEY=YOUR_OPENAI_API_KEY

    # Perplexity
    PERPLEXITY_API_KEY=YOUR_PERPLEXITY_API_KEY

    # Pinecone
    PINECONE_API_KEY=YOUR_PINECONE_API_KEY
    PINECONE_ENVIRONMENT=YOUR_PINECONE_ENVIRONMENT
    PINECONE_INDEX_NAME=your-pinecone-index-name # Or make this configurable

    ```

4.  **Set up Local Supabase Database (using Supabase CLI):**
    *   Ensure you have the [Supabase CLI](https://supabase.com/docs/guides/cli) installed.
    *   Log in to the CLI: `supabase login`
    *   Link your local project to your Supabase project (replace `<project-ref>` with your actual project reference ID from the Supabase dashboard):
        ```bash
        supabase link --project-ref <project-ref>
        # Follow prompts, potentially needing a database password
        ```
    *   Start the local Supabase services:
        ```bash
        supabase start
        ```
        *(Note: This spins up local Docker containers for Postgres, GoTrue, etc. Make sure Docker is running.)*
    *   Apply migrations to your local database:
        ```bash
        supabase db reset
        ```
        *(This command drops the local DB and reapplies all migrations from `supabase/migrations/`. Remember to commit your migration files to Git!)*

5.  **Run the development server:**
    ```bash
    npm run dev
    # or yarn dev or pnpm dev
    ```

6.  Open [http://localhost:3000](http://localhost:3000) (or the specified port) in your browser to view the application.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
