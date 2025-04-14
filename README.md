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
