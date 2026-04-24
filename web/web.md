# Xentient Web Console

## Startup (run each in its own terminal)

```bash
# 1 — MQTT broker
mosquitto -v

# 2 — Reverb WebSocket server
php artisan reverb:start

# 3 — MQTT bridge (subscribes to all xentient/* topics)
php artisan mqtt:listen

# 4 — Node Base simulator (fake ESP32)
bun run sim:node --broker=127.0.0.1:1883 --client=node-01 --profile=chatty

# 5 — Laravel dev server
php artisan serve
```

Open **http://localhost:8000** — the dashboard should show a green dot and live BME280 readings within 5 seconds.

## Tunnel (for LTE testing / demo)

```bash
# Install once: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/
cloudflared tunnel --url http://localhost:8000
```

Copy the `*.trycloudflare.com` URL. For a **stable** URL across restarts (Xentient-776 / E11):

```bash
cloudflared tunnel create xentient-demo
cloudflared tunnel route dns xentient-demo xentient-demo.yourdomain.com
cloudflared tunnel run xentient-demo
```

> **Reverb + tunnel:** Reverb runs on port 8080 by default. Either:
> - Run a second tunnel: `cloudflared tunnel --url http://localhost:8080`
> - Or set `REVERB_HOST` in `.env` to the tunnel host and `REVERB_SCHEME=https` so the client connects over WSS.

## Environment variables (`.env`)

| Key | Example |
|---|---|
| `XENTIENT_MQTT_HOST` | `127.0.0.1` |
| `XENTIENT_MQTT_PORT` | `1883` |
| `XENTIENT_ARTIFACTS_PATH` | `D:/Projects/Xentient/var/artifacts` |
| `BROADCAST_CONNECTION` | `reverb` |
| `REVERB_HOST` | `localhost` (or tunnel host for demo) |
| `REVERB_SCHEME` | `http` (or `https` for tunnel) |

## Edge cases covered

See `TRACK-A-WEB.md` §5 for the full list. All 20 cases are handled or noted as accepted risk.
