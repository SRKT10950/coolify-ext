# Coolify Port & Domain Pilot 🚀

A modern, containerized web application designed to automatically configure custom domains and internal collision-free free ports for applications deployed in [Coolify](https://coolify.io), while strictly enforcing a **zero exposed host ports** security model.

---

## 🌟 Key Features

- **Custom Domain Input per App**: Easily assign or update custom domains (`fqdn`) for any deployed application with automatic `https://` protocol normalization.
- **Dynamic Free Port Allocation**: Automatically scans existing Coolify applications, system-reserved ports, and persistent allocation registries to find and assign collision-free internal ports within a configurable range (e.g., 3100–9999).
- **Strict Zero-Expose Enforcement (Crucial Security Rule)**:
  - Coolify uses Traefik as a reverse proxy on the internal Docker network.
  - Applications only need `ports_exposes` (internal container port).
  - This tool strictly ensures that `ports_mappings` (which exposes ports directly on `0.0.0.0` of the host server) is **cleared/empty**.
  - No host ports are exposed to the public internet or vulnerable to port scanners.
- **One-Click Host Port Sealing**: Detects any existing applications with exposed host ports and seals them instantly with one click.
- **Port Allocation Matrix**: Visual overview of all allocated, system-reserved, and available port slots.
- **Automatic Redeployment**: Option to trigger immediate Coolify redeployment (`POST /api/v1/deploy`) so proxy routing takes effect instantly.
- **Containerized & Ready for Production**: Comes with a lean Alpine `Dockerfile` and `docker-compose.yml`, ready to be run standalone or deployed directly inside Coolify.
- **Built-in Simulation/Demo Mode**: Runs out-of-the-box in demo mode when no API token is configured, allowing instant UI exploration.

---

## 📋 Security Architecture: How Ports Work in Coolify

```
[ Internet ]
     │  (Port 80 / 443 only)
     ▼
[ Coolify Reverse Proxy (Traefik) ]
     │  (Internal Docker Network: 'coolify')
     ├──────────────────────┬──────────────────────┐
     ▼                      ▼                      ▼
[ App 1: Container ]   [ App 2: Container ]   [ App 3: Container ]
  ports_exposes: 3100    ports_exposes: 3101    ports_exposes: 3102
  Host Port: NONE (❌)   Host Port: NONE (❌)   Host Port: NONE (❌)
```

1. **`ports_exposes`**: Tells Traefik which port the app is listening on *inside* the private Docker network.
2. **`ports_mappings`**: Binds a port directly to the host (`0.0.0.0:PORT -> PORT`). **This is disabled by this tool** to guarantee zero external attack surface.

---

## 🚀 Quick Start

### Option 1: Run with Docker Compose (Recommended)

1. Clone or copy this repository to your server:
   ```bash
   git clone <repo-url> coolify-port-pilot
   cd coolify-port-pilot
   ```

2. Copy `.env.example` to `.env` and fill in your Coolify details:
   ```bash
   cp .env.example .env
   ```

3. Configure your `.env`:
   ```ini
   # If running on the same server as Coolify, use http://coolify:8000:
   COOLIFY_API_URL=http://coolify:8000
   COOLIFY_API_TOKEN=your_coolify_api_token_here

   PORT_RANGE_START=3100
   PORT_RANGE_END=9999
   AUTO_REDEPLOY=false
   AUTO_SET_PORT_ENV=true
   ```

4. Start the container:
   ```bash
   docker compose up -d
   ```

5. Open `http://<your-server-ip>:4000` in your browser.

---

### Option 2: Deploy Directly Inside Coolify

You can deploy this application right inside your Coolify instance as a Docker Compose resource:

1. In your Coolify dashboard, navigate to **Projects** &rarr; **New Resource** &rarr; **Docker Compose**.
2. Point it to this repository or paste the contents of `docker-compose.yml`.
3. Under **Environment Variables**, add:
   - `COOLIFY_API_URL`: `http://coolify:8000` (resolves internally on the shared `coolify` network)
   - `COOLIFY_API_TOKEN`: Your API token generated under **Keys & Tokens** &rarr; **API tokens**.
4. Set the domain for this configurator (e.g. `https://port-pilot.yourdomain.com`).
5. Click **Deploy**.

---

### Option 3: Run with Node.js Locally

```bash
# Install dependencies
npm install

# Run the app
npm start
```
Open `http://localhost:4000`.

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `COOLIFY_API_URL` | `http://localhost:8000` | URL of your Coolify instance |
| `COOLIFY_API_TOKEN` | *(empty)* | Coolify API Bearer Token (Keys & Tokens) |
| `PORT_RANGE_START` | `3100` | Lower bound of dynamic free port allocation |
| `PORT_RANGE_END` | `9999` | Upper bound of dynamic free port allocation |
| `AUTO_REDEPLOY` | `false` | Whether to automatically trigger redeployment on save |
| `AUTO_SET_PORT_ENV` | `true` | Automatically inject `PORT=<assigned_port>` into the app |
| `PORT` | `4000` | Web server listening port for this application |

---

## 🛡️ REST API Reference

- `GET /api/status`: Connection status and mode (live vs simulation).
- `GET /api/config`: Current configuration settings.
- `POST /api/config`: Update Coolify credentials and port range.
- `GET /api/apps`: List all applications with port analysis and exposure audit.
- `POST /api/apps/:uuid/allocate-port`: Compute next available free port for an app.
- `POST /api/apps/:uuid/configure`: Save custom domain & free port, clearing host exposure.
- `POST /api/apps/batch-configure`: Batch configure domains and allocate ports for all apps.
- `POST /api/apps/unexpose-all`: Remove all host port exposures across all deployed apps.
- `GET /api/ports/overview`: Matrix breakdown of allocated, reserved, and available slots.

---

## 🧪 Testing

Run automated unit tests:
```bash
npm test
```
Runs 6 unit test suites verifying port parsing, collision prevention, zero-exposure enforcement, and bulk allocations.
