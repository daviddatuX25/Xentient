# Xentient Non-Goals

> What Xentient explicitly does NOT do. This list prevents scope creep.

---

## v1 Demo Non-Goals (through Apr 24)

These do NOT ship before the Apr 24 demo. The demo runs current harness as-is.

- No Hermes/Mem0/OpenClaw/Archon integration code ships before demo
- No Pack system, no Space Manager, no Mode Manager
- No Communication Bridge code
- No Provider SDK npm publish (post-demo)
- No Visual Builder / web UI

The demo ships: voice pipeline (STT → LLM → TTS), MQTT hardware bridge, basic memory, LCD display. Nothing more.

---

## Platform Non-Goals (v1 scope)

These are explicit architectural boundaries for the v1 Platform Track (P1-P9). They are not limitations — they are design decisions that reduce complexity and shipping risk.

- **No custom DSL** — markdown prompts + JSON tools cover 95% of use cases. A mini scripting language is a 6-month tarpit.
- **No sandboxing / VM isolation** — handlers are enum-gated, no eval, no dynamic require. Safe by design, no sandbox needed.
- **No versioned pack migrations for v1** — manifest version mismatch = load fails with clear error. Migrations arrive when first breaking change ships, not before.
- **No pack dependencies** — packs are flat, self-contained. No imports from other packs. Shared patterns live in the harness itself.
- **No remote pack fetch at boot** — local folders only. Download-to-disk is an explicit user action, not a startup behavior.
- **No multi-pack active state** — one pack at a time. If the user wants blended behavior, they author a third pack that blends.
- **No Archon full coding agent** — P9 in Platform Track provides basic YAML DAG workflow support only. Archon is not the core loop; it is a specialized tool for dev-mode spaces. Hermes is the general brain.

---

## Out of Scope (future consideration, not v1 or Platform Track P1-P9)

These are ideas that have been discussed but are explicitly deferred beyond v1 and the P1-P9 Platform Track. They may appear in future phases.

- **Visual builder / web UI (Xentient-a8u retarget)** — pack editor web UI is a future phase, not v1
- **Pack marketplace / gallery** — post-v1 community sharing, no server or registry in v1
- **Remote pack fetch** — v1 non-goal (local folders only)
- **Multi-pack active state** — v1 non-goal (one pack per space)
- **Custom DSL for behavior scripting** — markdown + JSON covers 95% of use cases
- **Universal slot architecture** — v2 hardware target. v1 uses typed slots only
- **On-device speech-to-text** — STT offloaded to harness/cloud for v1 accuracy