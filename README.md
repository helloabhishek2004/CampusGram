# Smart Campus — Monorepo & AI Multi-Agent Platform

A modern, modular campus information and grievance intelligence system built for rapid, parallel hackathon development.

---

## 🏛️ Architecture Overview

```text
smart-campus/
├── apps/
│   └── web/                               # Next.js App Router, Frontend & Server Handlers
├── modules/
│   └── complaint-intelligence/            # Module 2: AI Grievance Classification & Triage
├── packages/
│   ├── contracts/                         # Shared TypeScript types & Zod validation schemas
│   ├── ui/                                # Reusable UI components (Tailwind + Lucide)
│   ├── config/                            # Shared TypeScript & ESLint configs
│   └── utils/                             # Shared utility functions (cn, error helpers)
├── supabase/
│   ├── migrations/                        # PostgreSQL DDL migrations & RLS
│   ├── seed/                              # Test seed data
│   └── config.toml                        # Local Supabase configuration
├── docs/                                  # Project documentation & ADRs
├── AGENTS.md                              # AI pair-programming manual
├── PROJECT_CONTEXT.md                     # Domain context & requirements
├── ARCHITECTURE.md                        # Complete technical architecture
└── INTEGRATION_CONTRACT.md                # Inter-module contract specifications
```

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js** v20+ or v24+
- **pnpm** v9+ or v12+

### 2. Setup

```bash
# Clone the repository and install all workspace dependencies
pnpm install

# Setup local environment
cp .env.example .env.local

# Run the development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the portal and test the live integration between `apps/web` and `modules/complaint-intelligence`.

---

## 🧪 Testing & Verification

```bash
# Run tests across workspaces
pnpm test

# Typecheck all TypeScript packages
pnpm typecheck

# Build the complete project
pnpm build
```

---

## 🛡️ AI Modes

Module 2 supports two operational modes:

- **Mock Mode (`AI_PROVIDER=mock`)**: Zero-configuration deterministic evaluation. Allows UI and module developers to work offline without a Google Gemini API key.
- **Gemini Mode (`AI_PROVIDER=gemini`)**: Live AI analysis using Google Gemini (`gemini-2.5-flash`) via the official `@google/genai` SDK. Requires setting `GEMINI_API_KEY` in `.env.local`.

---

## 🎭 Portfolio Demo Mode & Open-Source Showcase

CampusGram includes an explicit **Portfolio Demo Mode** designed for public open-source showcases (e.g. hosted on Vercel).

### What is Demo Mode?
When `CAMPUSGRAM_DEMO_MODE=true` is set:
- **Zero Live Database Operations:** All API handlers route directly to realistic in-memory stores and seed catalogs.
- **Service Isolation:** Bypasses live Supabase tables, remote Gemini calls, Python FastAPI microservices, and `pg-boss` queues.
- **In-Memory File Attachments:** Simulated in-memory token uploads replace local disk filesystem writes (`node:fs`), allowing serverless deployments without `ENOENT` / `EROFS` crashes.
- **Life-Safety Simulation:** Emergency SOS reports, drills, and broadcasts remain strictly simulated and never trigger external SMS/Push alerts.
- **Fictional Personas:** Visitors can log in using pre-seeded test roll numbers (e.g., `STU2026001`, `FAC2026001`) with dummy OTP `123456`.
- **Persistent Notice:** Displays an accessible, discreet disclaimer badge with a direct link back to the verified GitHub repository: [https://github.com/helloabhishek2004/campus-hackthon](https://github.com/helloabhishek2004/campus-hackthon).

### Enabling Demo Mode Locally
Add to your `.env.local`:
```bash
CAMPUSGRAM_DEMO_MODE=true
NEXT_PUBLIC_CAMPUSGRAM_DEMO_MODE=true
AI_PROVIDER=mock
OTP_PROVIDER=mock
AUTH_MODE=mock
```

---

## ☁️ Public Vercel Demo Deployment Guide

To deploy this repository as a 100% free public interactive showcase on Vercel:

1. **Import Repository:** Connect [https://github.com/helloabhishek2004/campus-hackthon](https://github.com/helloabhishek2004/campus-hackthon) in your Vercel Dashboard.
2. **Configure Monorepo Settings:**
   - **Root Directory:** `apps/web`
   - **Framework Preset:** `Next.js`
   - **Build Command:** `pnpm build` (or left default)
3. **Set Environment Variables on Vercel:**
   | Variable | Value | Public / Secret |
   | :--- | :--- | :--- |
   | `CAMPUSGRAM_DEMO_MODE` | `true` | Server Configuration |
   | `NEXT_PUBLIC_CAMPUSGRAM_DEMO_MODE` | `true` | Public Safe Boolean |
   | `AI_PROVIDER` | `mock` | Server Configuration |
   | `OTP_PROVIDER` | `mock` | Server Configuration |
   | `AUTH_MODE` | `mock` | Server Configuration |
   | `NEXT_PUBLIC_AUTH_MODE` | `mock` | Public Safe Boolean |
   | `AUTH_SESSION_SECRET` | *32+ random hex characters* | Server Secret |
   | `COMPLAINT_ATTACHMENT_TOKEN_SECRET` | *32+ random hex characters* | Server Secret |
   | `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Public App URL |
4. **Deploy:** Click **Deploy**. Vercel will prerender all static and dynamic pages with zero backend dependencies.

---

## 📜 Licensing Notice

- **Repository Status:** Open-source showcase.
- **License File:** A formal `LICENSE` file (such as MIT or Apache 2.0) has not yet been selected by the repository owner. Please consult with the author before commercial distribution or proprietary relicensing.

---

## 📖 Key Documentation

- [AGENTS.md](./AGENTS.md): Essential reading for AI agents and human contributors.
- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md): Domain scope and hackathon goals.
- [ARCHITECTURE.md](./ARCHITECTURE.md): System design and security boundaries.
- [INTEGRATION_CONTRACT.md](./INTEGRATION_CONTRACT.md): The inter-module data contract.
- [CONTRIBUTING.md](./CONTRIBUTING.md): Git branching and coding standards.
