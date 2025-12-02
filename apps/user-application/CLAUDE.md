# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment Variables

This project uses **two separate environment files** with different purposes:

### `.env` - Public Client-Side Variables (Vite)
- **Purpose**: Public values exposed to the client-side browser code
- **Prefix**: All variables MUST start with `VITE_`
- **Security**: Safe to commit and expose publicly (like API keys for client-side SDKs)
- **Examples**:
  - `VITE_SENTRY_DSN` - Sentry public DSN
  - `VITE_POSTHOG_API_KEY` - PostHog project API key
  - `VITE_GA4_MEASUREMENT_ID` - Google Analytics measurement ID
- **Usage**: Accessed via `import.meta.env.VITE_*` in client code
- **Deployment**: Used in production builds (Cloudflare Pages)

### `.dev.vars` - Secret Server-Side Variables (Cloudflare Workers)
- **Purpose**: Private secrets for server-side/backend code only
- **Prefix**: No special prefix required
- **Security**: NEVER commit or expose these (contains API secrets, OAuth secrets, etc.)
- **Examples**:
  - `BETTER_AUTH_SECRET` - Authentication encryption key
  - `GOOGLE_CLIENT_SECRET` - OAuth secret
  - `R2_SECRET_ACCESS_KEY` - Cloudflare R2 storage secret
  - `RESEND_API_KEY` - Email service API key
- **Usage**: Accessed via `env.*` in server functions (Cloudflare Workers runtime)
- **Deployment**: Set in Cloudflare Dashboard as environment variables

### Critical Rules
- ✅ **PUBLIC keys (client-side SDKs)** → `.env` with `VITE_` prefix
- ❌ **SECRET keys (server-side APIs)** → `.dev.vars` (NO `VITE_` prefix)
- **NEVER confuse the two** - putting secrets in `.env` exposes them to the client bundle
- **NEVER add `VITE_` prefix to secrets** - this makes them public

## Commands

### Development
- `pnpm dev` - Start development server on port 3000
- `pnpm build` - Build for production
- `pnpm serve` - Preview production build
- `pnpm test` - Run tests with Vitest

### Shadcn Components
- `pnpx shadcn@latest add <component>` - Add new Shadcn components (use latest version)

## Architecture

This is a TanStack Start application - a type-safe, client-first, full-stack React framework built on top of:

### Core Stack
- **TanStack Router**: File-based routing with type-safe navigation
- **TanStack Query**: Server state management with SSR integration
- **React 19**: Latest React with concurrent features and React Compiler enabled
- **Vite**: Build tool and dev server
- **TypeScript**: Strict type checking enabled
- **Tailwind CSS v4**: Utility-first styling with CSS variables

### React 19 Compiler Best Practices
This project uses the **React 19 Compiler** which automatically optimizes components for performance. Follow these guidelines:

1. **DO NOT use manual memoization hooks** - The compiler handles optimization automatically:
   - ❌ **NEVER use `useMemo`** - The compiler memoizes expensive computations
   - ❌ **NEVER use `useCallback`** - The compiler memoizes functions automatically
   - ❌ **NEVER use `React.memo`** - The compiler prevents unnecessary re-renders

2. **Write simple, readable code** - Let the compiler do the optimization work:
   ```tsx
   // ✅ Good - Simple and clean, let compiler optimize
   function MyComponent({ data }) {
     const result = expensiveOperation(data);
     return <div>{result}</div>;
   }

   // ❌ Bad - Manual memoization is unnecessary and adds clutter
   function MyComponent({ data }) {
     const result = useMemo(() => expensiveOperation(data), [data]);
     return <div>{result}</div>;
   }
   ```

3. **When to use React hooks** - Only use hooks for their intended semantic purposes:
   - ✅ `useState` - For component state
   - ✅ `useEffect` - For side effects and synchronization
   - ✅ `useContext` - For consuming context
   - ✅ `useRef` - For refs and mutable values
   - ✅ `useReducer` - For complex state logic
   - ❌ `useMemo` / `useCallback` - Not needed with React Compiler

4. **Trust the compiler** - It will:
   - Automatically memoize expensive computations
   - Prevent unnecessary re-renders
   - Optimize function references
   - Handle dependencies correctly

### Project Structure
- `src/routes/` - File-based routes (auto-generates `routeTree.gen.ts`)
- `src/components/` - Reusable React components  
- `src/integrations/tanstack-query/` - Query client setup and providers
- `src/lib/utils.ts` - Utility functions (includes clsx/tailwind-merge)
- `src/utils/seo.ts` - SEO helper functions
- Path aliases: `@/*` maps to `src/*`

### Key Architecture Patterns

**Router Setup**: The router is created via `getRouter()` in `src/router.tsx` which integrates TanStack Query context and SSR. Routes are auto-generated from the file system.

**Query Integration**: TanStack Query is pre-configured with SSR support through `setupRouterSsrQueryIntegration`. The query client is accessible in route contexts.

**Root Layout**: `src/routes/__root.tsx` defines the HTML document structure, includes devtools, and provides navigation links. It uses `createRootRouteWithContext` for type-safe context passing.

**Styling**: Uses Tailwind CSS v4 with the Vite plugin. Shadcn components are configured with "new-york" style, Zinc base color, and CSS variables enabled.

**TypeScript**: Strict mode with additional linting rules (`noUnusedLocals`, `noUnusedParameters`, etc.). Uses modern ESNext module resolution.

### TypeScript Best Practices
- **NEVER use `as any` casts** - Always find the proper type-safe solution
- Use strict typing throughout the codebase
- Avoid type assertions unless absolutely necessary
- When working with TanStack Router hooks like `useSearch()`, use proper route context or make components route-agnostic rather than casting to `any`

### Code Comments
- **Minimize comments** - Write self-documenting code with clear function and variable names
- **NEVER add obvious comments** - Don't explain what the code does if it's clear from reading it
- **Only comment when necessary** - Add comments only for:
  - Complex algorithms that need explanation
  - Non-obvious business logic or edge cases
  - Workarounds for bugs or limitations
  - Public API documentation (function/type JSDoc)
- **No implementation comments** - Avoid comments like "// Loop through items", "// Call function", etc.
- **Trust the code** - If you need a comment to explain what code does, refactor the code to be clearer instead

### Styling Consistency Guidelines

**Button and Interactive Element Styling**: All button-like interactive elements (navigation buttons, pagination buttons, action buttons) must use consistent styling to maintain visual cohesion.

**Core Button Styles** - Use these exact classes for all button-like elements:
```tsx
style={{ backgroundColor: "var(--background)" }}
className={cn(
  "inline-flex items-center justify-center rounded-md",
  "font-bold text-sm h-8.5 px-3 border border-solid",
  "border-input hover:border-muted-foreground/30 hover:bg-background/60",
  "text-muted-foreground hover:text-foreground",
  "transition-colors duration-200 cursor-pointer",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
  // Add active state when applicable:
  isActive && "border-muted-foreground/30 text-foreground"
)}
```

**Key Styling Rules**:
1. **Background Color**: Always use `style={{ backgroundColor: "var(--background)" }}` inline style, never Tailwind's `bg-background` class, to ensure exact color matching
2. **Border States**:
   - Default: `border-input`
   - Hover: `hover:border-muted-foreground/30` (subtle, not too thick)
   - Active: `border-muted-foreground/30` (same as hover, subtle)
   - Open (for dropdowns): `border-muted-foreground/30` (keep hover state when open)
3. **Text States**:
   - Default: `text-muted-foreground`
   - Hover: `hover:text-foreground`
   - Active: `text-foreground`
4. **Background States**:
   - Default: `var(--background)` (via inline style)
   - Hover: `hover:bg-background/60`
5. **Avoid Button Component Variants**: Don't use Shadcn Button component with variants (like `variant="outline"`) for navigation/pagination elements as they add inconsistent styles. Use raw `<button>` or `<Link>` with explicit classes instead.
6. **Interactive State Persistence**: For dropdown/popover triggers, maintain the hover state when the dropdown is open by checking the open state and applying the hover classes conditionally.
7. **Keyboard Focus Styles**: Always include `outline-none focus-visible:ring-2 focus-visible:ring-ring/70` for accessibility. This provides a clearly visible 2px ring at 70% opacity when navigating with keyboard.

**Components Using Consistent Styles**:
- `NavigationSelect.tsx` - Navigation dropdown trigger button
- `collections-pagination.tsx` - Pagination number buttons
- Any new button-like navigation or action elements should follow this pattern

**Spacing Consistency**:
- Navigation container: `px-5 lg:px-14 py-3`
- Pagination container: `px-5 lg:px-14 py-3 mt-8` (or mt-16 for larger gap)
- Collection grid: `px-5 lg:px-14`
- Maintain symmetrical spacing between sections

**Menu/Dropdown/Popover Styles** - Use these exact classes for consistent menu styling:

**Popover/Dropdown Content Container**:
```tsx
className={cn(
  "disable-animation-on-theme-change",
  "bg-background/80 backdrop-blur-sm border border-solid border-input rounded-md p-1.5",
  "w-56" // or w-[var(--radix-popover-trigger-width)] to match trigger width
)}
sideOffset={9}
```

**Menu Items**:
```tsx
className={cn(
  "cursor-pointer relative h-9 min-h-[2.25rem]",
  "text-muted-foreground hover:text-foreground",
  "transition-colors duration-200",
  "hover:bg-[var(--background)] focus:bg-[var(--background)] focus:text-foreground",
  "px-3 font-medium text-sm"
)}
```

**Key Menu Styling Rules**:
1. **Content Background**: Use `bg-background/80 backdrop-blur-sm` for translucent, blurred background
2. **Border**: Use `border border-solid border-input` for consistent border color matching input fields
3. **Spacing**: Use `sideOffset={9}` for consistent positioning relative to trigger
4. **Item Height**: Use `h-9 min-h-[2.25rem]` for consistent item heights
5. **Item Colors**:
   - Default: `text-muted-foreground`
   - Hover/Focus: `text-foreground`
   - Background hover: `hover:bg-[var(--background)]`
6. **Separators**: Use `bg-border/40` for subtle separators
7. **Theme Toggle Animation**: Always add `disable-animation-on-theme-change` class to prevent color transitions when theme changes
8. **Keyboard Navigation**:
   - For Popover components with Command menus, use `modal={true}` to enable focus trapping and keyboard navigation
   - DropdownMenu components handle keyboard navigation automatically

**Components Using Consistent Menu Styles**:
- `NavigationSelect.tsx` - Navigation popover menu
- `AppHeader.tsx` - Profile dropdown menu
- Any new dropdown/popover menus should follow this pattern

### Development Notes
- Demo files (prefixed with `demo`) can be safely deleted
- The project uses pnpm as the package manager
- Devtools are included for both Router and Query in development
- Routes support loaders, error boundaries, and not-found components
- File-based routing automatically generates type-safe route definitions

### Testing and Build Guidelines
- **DO NOT run `pnpm build` to test changes** unless the user explicitly asks
- The user will test changes themselves when ready
- Focus on code implementation and TypeScript correctness
- Only run builds when specifically requested for verification

### Git Commit Guidelines
- **NEVER commit code automatically** - Only create commits when the user explicitly asks
- Wait for user confirmation before running git commit commands
- The user will decide when changes are ready to be committed
- Exception: Only commit without asking if the user explicitly says "commit this" or "commit these changes"
- **NEVER add "Generated with Claude Code" or similar attribution** to commit messages
- **NEVER add Co-Authored-By lines** to commit messages
- Keep commit messages clean and focused on the change itself