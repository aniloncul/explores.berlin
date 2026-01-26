# Explores.Berlin – AI-Augmented Event Discovery Platform

**Explores.Berlin** is a curated, interactive map application for discovering underground events, exhibitions, and techno culture in Berlin. Built with a "Techno-Rave Brutalist" aesthetic, it serves as a high-performance, real-time interface for the city's vibrant scene.

This project demonstrates the power of **Agentic AI Workflow**, **Model Context Protocol (MCP)**, and modern **Full-Stack Engineering**.

---

## 🛠️ Technology Stack

### Core Architecture
- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, Server Components)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (Custom "Berlin-Techno" Design System)
- **State Management**: Zustand (Global accessible store for map/filter synchronization)

### Geospatial & Visualization
- **Map Engine**: Google Maps Platform via `@vis.gl/react-google-maps`
- **Logic**: Custom viewport clustering, dynamic bounding-box filtering, and zoom-dependent SVG marker rendering.

### Backend & Data
- **Database**: Supabase (PostgreSQL)
- **Authentication/Storage**: Supabase Auth & Storage
- **Data Pipeline**: Node.js scripts for CSV parsing, data normalization, and timezone adjustments.

---

## 🤖 AI & Automation Architecture

This project was built using an advanced **Agentic Workflow**, leveraging LLMs not just as code completors but as autonomous development partners.

### 1. Model Context Protocol (MCP) Integration
The development environment utilized **MCP Servers** to bridge the gap between the LLM and the local development context.
- **Context Awareness**: The AI agent had direct access to the live file system, git status, and terminal outputs via MCP, allowing for "Loop-in-the-Loop" error correction.
- **Tool Use**: The agent autonomously executed terminal commands, managed git branches (`design` vs `main`), and performed file manipulations without manual copy-pasting.

### 2. Autonomous Refactoring & Debugging
- **Self-Healing Code**: When errors occurred (e.g., build failures or linting issues), the agent analyzed the terminal output via MCP, hypothesized the cause, and applied fixes iteratively.
- **Semantic Understanding**: The agent understood high-level design requests (e.g., "Make it look like a techno rave") and translated them into specific CSS variables (sharp borders, uppercase pixel fonts, high-contrast monochrome palettes).

### 3. AI-Native Data Pipeline (ETL & Classification)
To populate the application with high-quality, structured data from the chaotic Berlin event scene, I engineered an autonomous **AI-Driven Data Pipeline**.

- **Agentic Web Scraping**:
  Instead of fragile, static selectors, I utilized **LLM-guided scraping workflows**. The Agent perceives the DOM of event websites, semantically identifies key fields (Date, Location, "Vibe"), and writes resilient extraction scripts that adapt to layout changes.

- **LLM-Based Semantic Classification**:
  Raw event titles and descriptions are often unstructured (e.g., "Techno Rave at KitKat"). I integrated an **LLM Classification Layer** that:
  1.  **Ingests** raw strings.
  2.  **Analyzes** semantic context (e.g., inferring "Hard Techno" vs "House" or "Queer-Friendly" availability).
  3.  **Tags** the entity with normalized metadata (`main_category`, `tags`).
  4.  **Enriches** the database (Supabase) automatically.

This "Unstructured-to-Structured" pipeline demonstrates how Large Language Models can serve as the core intelligence in modern ETL (Extract, Transform, Load) processes, reducing manual data stewardship to zero.

### 4. Autonomous Refactoring & Debugging

The UI breaks away from standard "Clean SaaS" design, adopting a style that reflects Berlin's club culture.

- **Typography**: `Press Start 2P` (Pixel Art) headers paired with uppercase monospace fonts.
- **Visuals**:
  - **Sharp Edges**: `rounded-none`, `border-2`, and hard shadows replacing soft drop-shadows.
  - **Golden Highlights**: Special events feature a `border-yellow-400` highlight and floating "RECOMMENDED" badges.
  - **Pixel Snake Ticker**: A custom CSS animation referencing retro scrolling marquees.
  - **Dark Mode**: Forced high-contrast dark mode integration for the Map component.

---

## 🚀 Key Features

1.  **Viewport-Consistent Filtering**:
    - The event list automatically filters to show only the locations currently visible on the map.
    - Implemented using Google Maps `idle` events and geometric bounds checking.

2.  **Adaptive Map Markers**:
    - Markers transform from simple dots to full Flag icons based on zoom level.
    - Hover states invoke Tooltip bubbles and size scaling for better UX.

3.  **Real-Time Data Filtering**:
    - Multi-dimensional filtering by **Date**, **Category**, and **Search Query**.
    - Optimized using `useMemo` to prevent unnecessary re-renders during high-frequency map interactions.

4.  **Loading Architectures**:
    - Custom Skeleton UI ensures a smooth perceived performance during data fetching.

---

## 🔮 Future Roadmap (Agentic Implementation)

- **Vector Search integration**: Using Supabase `pgvector` to allow semantic searching (e.g., "Find me a dark techno club with cheap drinks").
- **Automated Scraping Agents**: Deploying python-based MCP agents to periodically scrape event sites and update the database autonomously.
