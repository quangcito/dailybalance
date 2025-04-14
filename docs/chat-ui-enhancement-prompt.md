**Task: Enhance Chat UI using Shadcn and Layout Improvements**

**Goal:** Refactor the main chat interface located in `src/app/page.tsx` to improve its visual appeal, user experience, and layout structure using Shadcn UI components and best practices.

**Context:**
The current chat page (`src/app/page.tsx`) displays a conversation history grouped by date. It uses a basic flex layout, renders user messages as simple paragraphs within styled divs, and system messages using a custom `AnswerCard` component. An onboarding form (`GuestOnboardingForm`) overlays the chat initially for new guest users. The input is handled by a custom `QueryInput` component in the footer. Basic Tailwind CSS is used for styling.

**Requirements:**

1.  **Overall Layout:**
    *   Refine the main page layout (`div` with `flex flex-col h-screen`). Ensure consistent padding and spacing.
    *   Consider making the input footer (`footer` tag with `QueryInput`) sticky or fixed at the bottom for better usability, ensuring the message list scrolls correctly above it.
    *   Improve the structure and spacing within the message list (`main` tag).

2.  **Message Styling:**
    *   Replace the basic `div` wrappers for user and system messages.
    *   **User Messages:** Style using a distinct background color (e.g., primary color from Shadcn theme) and potentially wrap in a simple `Card` or styled `div`. Consider adding an `Avatar` component (using initials or a generic icon) aligned with the message.
    *   **System Messages (`AnswerCard`):** Ensure `AnswerCard` uses Shadcn components internally (like `Card`, `Accordion` for sources if applicable) for consistency. Review its styling to align with the overall theme. Consider adding an `Avatar` for the system/AI.
    *   Ensure message bubbles have appropriate padding, rounded corners, and clear visual separation.

3.  **Loading & Error States:**
    *   Replace the simple "Thinking..." text with a more engaging loading indicator. Consider using Shadcn `Skeleton` components to mimic the structure of an incoming message bubble.
    *   Style the error message display using the Shadcn `Alert` component with `variant="destructive"`.

4.  **Date Separator:**
    *   Improve the visual appearance of the date separator (currently a `span` inside a `div`). Make it less intrusive but still clear (e.g., centered text with lines, or a subtle background).

5.  **Guest Onboarding Form (`GuestOnboardingForm`):**
    *   Refactor the inline form component. Consider moving it into a Shadcn `Dialog` or `Sheet` component triggered automatically if `showOnboarding` is true, making it less disruptive to the main UI flow initially.
    *   Replace the standard HTML form elements (`input`, `select`, `label`, `button`) within the form with their corresponding Shadcn UI components (`Input`, `Select`, `Label`, `Button`, `Checkbox`) for consistent styling and accessibility. Apply appropriate layout (e.g., using grid or flex) within the form content area.

6.  **Responsiveness:**
    *   Verify and ensure the enhanced layout and components are responsive and look good on various screen sizes (mobile, tablet, desktop).

**Files to Modify:**

*   Primary: `src/app/page.tsx`
*   Potentially: `src/components/answer-engine/answer-card.tsx`, `src/components/answer-engine/query-input.tsx` (if styling adjustments are needed for consistency).

**Technology Stack:**

*   Next.js (App Router)
*   React
*   TypeScript
*   Tailwind CSS
*   Shadcn UI

**Deliverable:**
Update the specified files to implement the UI enhancements as described. Ensure the chat functionality (sending messages, displaying history, handling loading/errors) remains intact.
