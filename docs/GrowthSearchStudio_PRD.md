# Product Requirements Document: Growth Search & Landing Studio

**Version:** 1.0
**Status:** Draft
**Author:** Head of Product Design

## 1. Executive Summary
The Growth Search & Landing Studio is a unified workspace within Vult Intel designed to bridge the gap between market intelligence and execution. It consolidates keyword research, competitor analysis, SEO auditing, and high-conversion landing page creation into a single, flow-based interface. By leveraging the Project Context Pack, it eliminates the "blank page" problem and ensures all outputs are strategically aligned with the business niche and goals.

## 2. User Stories
*   **As a Growth Marketer**, I want to discover high-opportunity keywords based on my specific niche so that I can target low-difficulty, high-intent traffic.
*   **As a SEO Specialist**, I want to audit a client's site and immediately generate a prioritized backlog of fixes so that I can demonstrate quick wins.
*   **As a Copywriter**, I want to generate landing page copy that is already optimized for the target audience and objective so that I can launch campaigns faster.
*   **As a Project Manager**, I want to save research findings and tasks to a persistent workbench so that nothing gets lost between sessions.

## 3. Functional Requirements

### 3.1 Shared Framework
**Global Header**
*   **Project Selector:** Dropdown displaying current Business Name and Niche.
*   **Localization:** Selector for Target Country and Language (defaults to Project settings).
*   **Data Freshness:** Visual indicator showing "Last Scan: [Date]" or "Live Data".
*   **Mode Toggle:** Switch between "Simple" (guided) and "Advanced" (full data density).
*   **Primary Actions:**
    *   Save Project State
    *   Export Report (PDF/DOCX)
    *   Add to Tasks (Global Backlog)
    *   Add to Campaign (Link to Campaign Manager)

**Persistent Workbench (Right Panel)**
*   **Dock Items:**
    *   Keywords (Count)
    *   Competitors (Count)
    *   SEO Issues (Count)
    *   Offer Notes
    *   Landing Sections
    *   Copy Blocks
*   **Actions:**
    *   Copy All to Clipboard
    *   Save as Bundle
    *   Add Bundle to Campaign
    *   Export Bundle (CSV/JSON)

### 3.2 Tab 1: Keyword & Competitor Research
**Inputs**
*   Seed Keyword Field (supports CSV upload).
*   Niche Selector (pre-filled from Context).
*   Search Intent Dropdown: Informational, Commercial, Transactional, Navigational.
*   Competitor Mode Toggle: Auto-Discover (SERP) vs. Manual Input.
*   Advanced Filters: Difficulty, Volume, SERP Features.

**Outputs**
*   **A) SERP Competitor Discovery:**
    *   List of top ranking domains.
    *   Relevance Score (0-100).
    *   Grouping: Direct Competitors vs. Media/Publishers.
*   **B) Keyword Opportunity Table:**
    *   Sortable columns: Keyword, Intent, Volume, KD%, CPC, SERP Features.
    *   "Opportunity Note": AI-generated context specific to the Project.
    *   Row Actions: Save, Add to Blog Backlog, Send to Content Gen.
*   **C) Competitor Content Snapshot:**
    *   Card view per competitor.
    *   Top Pages list.
    *   "Gap Analysis": What they cover that we don't.

### 3.3 Tab 2: SEO Audit & Action Plan
**Inputs**
*   Canonical URL (read-only, from Project).
*   Focus Pages Selector (Multi-select: Home, Pricing, etc.).
*   Goal Selector: Traffic, Ranking, Conversion, Local.

**Outputs**
*   **A) SEO Health Scorecard:**
    *   Overall Score (0-100).
    *   Radial breakdown: Technical, On-Page, Links, Content, Schema, Performance.
*   **B) Prioritized Checklist:**
    *   List items sorted by Impact/Effort ratio.
    *   Fields: Issue, Importance, Fix, Impact (H/M/L), Effort (L/M/H).
    *   Actions: Add to Backlog, Mark Done, Ignore.
*   **C) On-Page Recommendations:**
    *   Specific fixes for Titles, Metas, H1s.
    *   Schema JSON-LD generator.
*   **D) Backlog Board:**
    *   Kanban view: To Do, In Progress, Review, Done.
    *   Export to CSV/Jira.
*   **E) 30-Day Plan:**
    *   Timeline view of sequenced tasks.
    *   "Quick Wins" section (First 7 days).

### 3.4 Tab 3: Offer & Landing Page Builder
**Inputs**
*   Objective Selector: Lead Capture, Sale, Webinar, etc.
*   Traffic Source: Organic, Ads (Meta/Google/LinkedIn), Email.
*   Audience Persona Editor.
*   Offer Component Editor: Headline, Benefit, Proof, Guarantee, Price, CTA, Objections.

**Outputs**
*   **A) Offer Audit:**
    *   Scores: Clarity, CTA Strength, Trust, Alignment.
    *   AI Recommendations for improvement.
*   **B) Landing Page Blueprint:**
    *   Visual wireframe representation (Block level).
    *   Sequence: Hero -> Problem -> Solution -> Benefits -> Proof -> Offer -> FAQ -> CTA.
*   **C) Copy Generation:**
    *   Text blocks for each section.
    *   Tone Variants: Conservative, Direct Response, Premium.
    *   Actions: Copy, Save to Library, Edit.
*   **D) A/B Test Lab:**
    *   Generated hypotheses for split testing.
    *   Success metrics definition.

## 4. Data Model
*   **Project:** id, name, niche, country, language.
*   **KeywordList:** id, project_id, items (array of KeywordItem).
*   **CompetitorDomain:** id, project_id, domain, relevance_score.
*   **SeoAuditRun:** id, project_id, timestamp, overall_score, issues (array of SeoIssue).
*   **SeoBacklogItem:** id, project_id, issue_id, status, priority.
*   **OfferDraft:** id, project_id, components (json), audit_scores (json).
*   **LandingBlueprint:** id, project_id, sections (array of LandingSection).
*   **CopyBlock:** id, section_id, content, variant_type.

## 5. UX Requirements
*   **Density:** High data density but low visual noise. Use whitespace to group related metrics.
*   **Progressive Disclosure:** Hide advanced filters and raw data tables behind "View Details" or "Advanced Mode".
*   **Empty States:** "No keywords found. Try a broader seed term." instead of blank tables.
*   **Feedback:** Toast notifications for all "Save" and "Add to" actions.
*   **Navigation:** Keyboard shortcuts for switching tabs (Cmd+1, Cmd+2, Cmd+3) and saving (Cmd+S).

---

# Art Direction Report

## 1. Visual Philosophy
**"Calm Precision"**
The interface should feel like a high-end cockpit. Dark mode by default to reduce eye strain during long research sessions. Use subtle gradients and glassmorphism only to establish hierarchy, never for decoration.

*   **Background:** Deep charcoal (#0A0A0A) to soft black (#000000).
*   **Surface:** Matte dark grey (#161616) with 1px subtle borders (#FFFFFF0D).
*   **Accent:** Electric Blue (#3B82F6) for primary actions, Emerald (#10B981) for positive metrics, Rose (#F43F5E) for critical issues.
*   **Typography:** Inter (Sans) for UI, JetBrains Mono for data/code.

## 2. Component Specifications

### Tab System
*   **Style:** Pill-shaped segmented control.
*   **State:** Active tab has a subtle background glow (5% opacity) and white text. Inactive tabs are text-only (40% opacity).
*   **Spacing:** 32px padding between header and content area.

### Tables (Keyword/Competitor)
*   **Headers:** Sticky, uppercase, 11px, tracking-wide, 40% opacity.
*   **Rows:** 48px height, hover effect (lighten 2%).
*   **Cells:** Monospace numbers, aligned right. Text aligned left.
*   **Borders:** Horizontal only, 1px solid #FFFFFF0D.

### Scorecards (SEO/Offer Audit)
*   **Shape:** Circular radial progress or clean metric cards.
*   **Visual:** Large number (32px), small label (12px).
*   **Color:** Dynamic based on score (Red < 50, Yellow < 80, Green > 80).

### Blueprint Cards
*   **Container:** Dashed border (1px #FFFFFF33) representing a "slot" or "wireframe".
*   **Content:** Minimal representation of the section (e.g., "Hero Section" label with a generic icon).

### Copy Blocks
*   **Background:** Slightly lighter than page (#1C1C1C).
*   **Typography:** Serif font (e.g., Merriweather or similar) for the actual copy to distinguish it from UI.
*   **Actions:** Hover-reveal toolbar (Copy, Edit, Save) in the top right corner.

## 3. Motion
*   **Transitions:** 200ms ease-out for tab switching.
*   **Hover:** 150ms ease-in-out for buttons and table rows.
*   **Loading:** Skeleton screens with a shimmering gradient (no spinners unless blocking).

---

# QA Checklist

## General
*   [ ] Project Context loads correctly in the header.
*   [ ] Country/Language selector updates all downstream data.
*   [ ] Workbench panel expands/collapses smoothly.
*   [ ] "Save Project" persists all current state to local storage/DB.

## Tab 1: Research
*   [ ] Seed keyword input accepts CSV upload.
*   [ ] Competitor Auto-Discover returns valid domains.
*   [ ] Keyword Table sorts correctly by all numeric columns.
*   [ ] "Add to Blog Backlog" creates a task in the global system.
*   [ ] Export to CSV produces a correctly formatted file.

## Tab 2: SEO Audit
*   [ ] Health Score calculation is accurate based on sub-scores.
*   [ ] Checklist items can be moved to "Done" and persist state.
*   [ ] "Quick Wins" filter correctly isolates high-impact/low-effort items.
*   [ ] Export Backlog includes all current board items.

## Tab 3: Landing Studio
*   [ ] Objective selector changes the Blueprint structure.
*   [ ] Offer Audit updates in real-time as inputs change.
*   [ ] Copy Generation respects the selected Brand Voice.
*   [ ] "Save to Library" adds the copy block to the Workbench.
