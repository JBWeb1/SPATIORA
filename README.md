<p align="center"><img src="client/public/brand/vistora-mark.webp" width="140" alt="VISTORA logo"></p>

# VISTORA

**See the space. Shape the future.**

VISTORA is a full-stack, AI-powered interior design and home renovation platform. Upload a photo of a room, pick a style, and VISTORA redesigns it. From there you can edit the room in 3D, choose finishes, cost the renovation in rand, shop real products, plan the build, size backup power, and share everything with family, clients and contractors.

It is built for South Africa first (rand, 15% VAT, provincial pricing, load-shedding, local trades) and supports international users through multi-currency display.

## Features

| Area | What it does |
| --- | --- |
| **AI Interior Designer** | Upload a room photo (JPG/PNG/WebP) and generate 1–4 redesign variations per run in 10 styles. You can set colours, materials, furniture wishes, lighting, budget, transformation strength and "preserve layout". A before/after slider and a side-by-side compare mode show the results. |
| **AI room analysis** | Estimates the room's dimensions from the photo and lists its features, problems to fix, best-fit styles and low-cost quick wins. One click applies the estimated size to the project. |
| **Room Design Studio** | Covers living rooms, kitchens, bathrooms, bedrooms, offices, outdoor spaces and whole homes. Each project keeps its full concept history, favourites, notes and a cover image. |
| **3D Home Builder** | A real-time 3D room (three.js) plus a 2D floor plan. Set length, width, height, doors and windows, drag catalogue furniture into place, rotate, resize and recolour it, and change the time of day and lamp warmth. The layout auto-saves and you get a warning when the room feels crowded. |
| **Material Editor** | Choose flooring, walls, ceiling, tiles, countertops and cabinetry individually, with a live preview and approximate cost per option. "Apply style kit" picks finishes that suit the chosen style. |
| **AI Design Assistant** | A per-project chat that knows the room size, budget, style and finishes, and can see the room photo. It runs on Claude when an API key is configured and falls back to a built-in rule-based advisor otherwise. |
| **Renovation Calculator** | Works out quantities (with waste), materials, labour, services, contingency and VAT for your exact room. It applies provincial cost factors and budget/standard/premium tiers, tracks the total against your budget, shows a low–high range, displays in 9 currencies and prints to PDF. |
| **Product Marketplace** | Search and filter by category, style, price, eco rating and locally made. Compare up to 3 products and add them to a project's shopping list. |
| **Shopping list** | Groups items by retailer, tracks what you've bought and the remaining spend, warns about long lead times, suggests products for the project's style and exports to CSV. |
| **Professional Workspace** | Client CRM, quotations generated in one click from a project's estimate and shopping list, markup/VAT/margin tracking, a draft → sent → accepted pipeline and printable quotes. |
| **Project Library** | Search and filter projects by status, duplicate and delete them, and see a dashboard of usage, budgets, upcoming tasks and feedback. |

### Features added on top of the original brief

- **Style DNA quiz.** A 6-question quiz that builds your style profile and palette. It personalises the default style, colours and product picks.
- **Load-shedding & solar planner.** Enter your appliances and the longest outage you need to cover. It sizes the inverter, LiFePO₄ battery and solar panels for your province's sun hours, then shows cost, monthly savings, payback, CO₂ avoided and tips. The system can be added to your shopping list in one click, and the planner links to solar installers.
- **Renovation planner.** Generates a timeline from room-specific templates (kitchen, bathroom, general) using working days and splitting your budget across tasks. It has a Gantt view, task status, assignees and budget-vs-actual tracking.
- **Contractor Connect.** A directory of verified trades filtered by province and trade, with quote requests that carry your project details and a list of the requests you've sent.
- **Contractor-ready brief.** Generates a Markdown scope of work covering finishes, electrical and plumbing notes, budget, timeline and questions to ask the contractor. You can copy or download it.
- **Share & collaborate.** A read-only share link (with a WhatsApp share button) where family and clients can react with emoji and comment on each concept. Their feedback appears on your dashboard.
- **Mood board.** Collect colours, materials, products, notes and favourite concepts on one board per project.
- **Plans & usage limits.** Free, Premium and Professional tiers with monthly AI allowances and project limits.
- **Light and dark themes**, a mobile-friendly layout and accessible controls (a keyboard-operable before/after slider, ARIA labels).

## Tech stack

- **Web client:** React 19, React Router, Vite, three.js / @react-three/fiber / drei, plain CSS design tokens
- **API:** Node.js 22+, Express 5, TypeScript, Zod validation, JWT auth, bcrypt, Multer uploads
- **Database:** SQLite through Node's built-in `node:sqlite` (no native build step)
- **AI:** Claude via the official `@anthropic-ai/sdk` for the assistant, room analysis and briefs. Image generation is pluggable: Replicate, any HTTP endpoint, or the built-in Studio Preview renderer.

```
client/   React web app (pages/, project/ tabs, components/)
server/   Express API (src/routes, src/services, src/data/catalog.ts, src/db.ts)
```

## Getting started

Requires **Node.js 22.5+**.

```bash
npm install
cp .env.example .env      # then edit values
npm run dev               # API on :4000, web app on http://localhost:5173
```

Production build:

```bash
npm run build
NODE_ENV=production JWT_SECRET=<long-random-secret> npm start   # serves API + web app on :4000
```

Or use Docker:

```bash
docker build -t vistora .
docker run -p 4000:4000 -e JWT_SECRET=<long-random-secret> -v vistora-data:/data vistora
```

Run the API tests with `npm test`, and typecheck everything with `npm run typecheck`.

## Configuration

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs login tokens. **Required in production** (24+ characters). |
| `DATA_DIR` | Location of the SQLite database and uploaded images (default `./data`). |
| `ANTHROPIC_API_KEY` | Turns on Claude for the assistant, photo analysis and briefs. `CLAUDE_MODEL` defaults to `claude-opus-5-5`. |
| `REPLICATE_API_TOKEN` + `REPLICATE_MODEL_VERSION` | Photorealistic redesigns through any Replicate image-to-image interior model that accepts `image`, `prompt` and `negative_prompt`. |
| `IMAGE_PROVIDER_URL` (+ `IMAGE_PROVIDER_KEY`) | Or your own endpoint. It receives `{ image, prompt, negativePrompt, style, roomType, preserveLayout }` and must return `{ image }` as a data URL or https URL. |

With no AI keys, VISTORA runs fully offline. Redesigns come from the built-in **Studio Preview** renderer, which recolours your photo into the style's palette and adds design callouts and swatches. The assistant uses its rule-based advisor. If an external provider fails, VISTORA falls back to these automatically.

## Notes for production

- **Placeholder data.** Products, retailers and contractors in `server/src/data/catalog.ts` are sample listings. Replace them with partner feeds. Prices are indicative ZAR planning figures, and exchange rates are static.
- **Billing is a demo.** Plan switching takes effect instantly with no payment. Wire `POST /api/auth/me/plan` to a payment provider's webhook (PayFast, Paystack or Stripe) before charging customers.
- **Upload security.** Uploads are checked by their file signature (magic bytes). Generated SVGs are served under a strict Content-Security-Policy.
