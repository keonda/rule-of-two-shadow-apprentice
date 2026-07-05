# Rule of Two: Shadow Apprentice

A dark sci-fi top-down 2D action survival game built with **Next.js**, **TypeScript**, **Tailwind CSS**, and **HTML5 Canvas**. The game is inspired by themes of shadow discipline, apprentice trials, and the Rule of Two. It features procedural audio synthesis, a wave survival arena, boss trials, upgrade progression, and dynamic Groq LLM-generated commentary.

---

## Gameplay & Controls

You control a hooded shadow apprentice inside a dark temple arena, surviving waves of training drones and rival acolytes. Every 3 waves, you face a **Master Trial** boss. Surrounding it awards a selection of dark upgrades.

### Player Abilities
1.  **Shadow Lightning** (Left Click / Auto): Ranged electric chains that target the nearest threat. Low energy cost, high damage.
2.  **Void Push** (Right Click / E): Releases a shockwave cone that knocks back enemies, deals damage, and deflects hostile projectiles. Cooldown-based.
3.  **Leap** (Spacebar): A fast dash in your movement direction, granting brief invulnerability. Useful for dodging attacks or crossing crowds.

### Input Controls
*   **Move**: `W`, `A`, `S`, `D` or **Arrow Keys**
*   **Aim**: Mouse Cursor
*   **Lightning**: Hold **Left Mouse Button**
*   **Void Push**: **Right Mouse Button** or `E`
*   **Leap**: **Spacebar**
*   **Pause**: `Escape` or `P`
*   **Mobile controls**: Virtual touch joystick (movement) + three action buttons (Abilities).

---

## Local Development Setup

To run the application locally, you will need Node.js (v20+) and a PostgreSQL instance.

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://shadow_apprentice:shadow_password@localhost:5432/shadow_db?schema=public"
GROQ_API_KEY="your_groq_api_key_here" # Optional. If omitted, uses pre-authored commentary fallbacks.
NEXT_PUBLIC_APP_NAME="Rule of Two: Shadow Apprentice"
```

### 3. Generate Prisma Client & Run Seeding
Generate the typescript definitions for Prisma 7 and seed initial leaderboard figures:
```bash
npx prisma generate
# (Optional) If you have a live DB running, run migrations and seeds:
# npx prisma db push
# npx prisma db seed
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Docker Setup

To orchestrate the app and a local database together via Docker Compose:

1.  Start the database and web services:
    ```bash
    docker compose up --build
    ```
2.  Run migrations inside the running container to initialize schema:
    ```bash
    docker compose exec web npx prisma db push
    ```

The web client will be available at [http://localhost:3000](http://localhost:3000).

---

## Coolify Deployment Steps (sith.uk)

To deploy **Rule of Two: Shadow Apprentice** on your Coolify dashboard:

1.  **Create GitHub Repository**: Push the project code to a private or public GitHub repository.
2.  **Launch PostgreSQL Service**: In Coolify, create a new PostgreSQL database service. Copy the connection string.
3.  **Create New Application**:
    *   Add a new application in Coolify.
    *   Select **GitHub Repository** as the source.
    *   Choose **Dockerfile** as the build pack (Coolify will detect the multi-stage `Dockerfile` in the root).
4.  **Configure Environment Variables**:
    *   Set `DATABASE_URL` to the connection string of the PostgreSQL service you launched.
    *   Set `GROQ_API_KEY` (using model: `openai/gpt-oss-120b`).
    *   Set `NEXT_PUBLIC_APP_NAME="Rule of Two: Shadow Apprentice"`.
5.  **Pre-deployment Command**:
    *   Under the build settings of the Coolify application, configure a post-deployment script or add a step to run Prisma migrations:
        `npx prisma db push` (or `npx prisma migrate deploy`).
6.  **Deploy**: Hit Deploy. Coolify will build the Docker container, run health checks (on `/api/health`), and bind to port `3000` under your domain `sith.uk`.

---

## Future Feature Ideas

*   **Ability Branches**: Add deep branching skill trees (e.g. chaining lightning to more targets vs. slowing enemies hit).
*   **Enemies Variety**: Include stealth-assassin acolytes that blink behind the player.
*   **Arena Gaps**: Render physical pits/gaps in the dark temple that require Leaping to cross.
*   **Dynamic Soundtracks**: Implement procedurally generated dark synth ambient backing tracks.
