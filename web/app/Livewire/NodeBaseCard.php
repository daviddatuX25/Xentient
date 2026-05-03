<?php

namespace App\Livewire;

use Livewire\Component;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use App\Services\MqttPublisher;

class NodeBaseCard extends Component
{
    public int    $nodeBaseId;
    public string $name          = '';
    public string $mqttClientId  = '';
    public ?string $lastSeenAt   = null;
    public string $currentMode   = 'listen';
    public bool   $isOnline      = false;
    public string $lastSeenAgo   = 'never';

    // Derived from Cache — never stored as component state so it survives
    // re-renders without a sleep() call blocking the worker thread.
    public bool   $pipelineCooldown = false;

    public ?float  $temperature  = null;
    public ?float  $humidity     = null;
    public ?string $lastSnippet  = null;
    public ?string $lastSessionAt = null;

    public function mount(int $nodeBaseId): void
    {
        $this->nodeBaseId = $nodeBaseId;
        $this->refresh();
    }

    // Dynamic channel names require getListeners() rather than static #[On] attributes.
    // This wires up live updates from Reverb so the card reflects reality without polling.
    protected function getListeners(): array
    {
        return [
            // BME280 / PIR coming in — refresh online dot + sensor readings
            'echo:telemetry,telemetry.updated'                              => 'onTelemetry',
            // Mode echo from Core — flip the badge immediately
            "echo:xentient.node.{$this->nodeBaseId},mode.changed"          => 'onModeChanged',
            // Pipeline state — update pipelineCooldown badge during active run
            "echo:xentient.node.{$this->nodeBaseId},pipeline.state"        => 'onPipelineState',
        ];
    }

    public function refresh(): void
    {
        $node = DB::table('node_bases')->find($this->nodeBaseId);
        if (!$node) return;

        $this->name         = $node->name;
        $this->mqttClientId = $node->mqtt_client_id;
        $this->lastSeenAt   = $node->online_last_seen_at;

        $lastSeen       = $node->online_last_seen_at
            ? Carbon::parse($node->online_last_seen_at)
            : null;

        // 90s: covers the 60s MQTT keepalive + a buffer for slow brokers
        $this->isOnline    = $lastSeen && $lastSeen->diffInSeconds(now()) < 90;
        $this->lastSeenAgo = $lastSeen ? $lastSeen->diffForHumans() : 'never';

        // Latest BME280 reading
        $telemetry = DB::table('telemetry_samples')
            ->where('node_base_id', $this->nodeBaseId)
            ->where('peripheral_type', 'bme280')
            ->orderByDesc('recorded_at')
            ->first();

        if ($telemetry) {
            $payload           = json_decode($telemetry->payload_json, true);
            $this->temperature = $payload['temperature'] ?? null;
            $this->humidity    = $payload['humidity']    ?? null;
        }

        // Last confirmed mode from events table
        $modeEvent = DB::table('events')
            ->where('node_base_id', $this->nodeBaseId)
            ->where('kind', 'mode_change')
            ->orderByDesc('occurred_at')
            ->first();

        if ($modeEvent) {
            $this->currentMode = json_decode($modeEvent->payload_json, true)['mode'] ?? 'listen';
        }

        // Last session snippet
        $lastSession = DB::table('xentient_sessions')
            ->where('node_base_id', $this->nodeBaseId)
            ->orderByDesc('started_at')
            ->first();

        if ($lastSession) {
            $this->lastSessionAt = $lastSession->started_at;
            $lastTurn = DB::table('turns')
                ->where('session_id', $lastSession->id)
                ->where('role', 'assistant')
                ->orderByDesc('started_at')
                ->first();
            $this->lastSnippet = $lastTurn ? \Str::limit($lastTurn->text, 80) : null;
        }

        // Read cooldown from cache (never from sleep)
        $this->pipelineCooldown = Cache::has($this->cooldownKey());
    }

    // Called by Reverb when any BME280 or PIR sample arrives.
    // Only re-reads the node if the event is for our node.
    public function onTelemetry(array $event): void
    {
        if (($event['node_base_id'] ?? null) !== $this->mqttClientId) return;
        $this->refresh();
    }

    // Called by Reverb when Core echoes a mode change for this node.
    public function onModeChanged(array $event): void
    {
        // event payload: { mode: 'listen' } from ModeChanged::broadcastWith (default)
        $mode = $event['mode'] ?? null;
        if ($mode && in_array($mode, ['sleep', 'listen', 'active', 'record'])) {
            $this->currentMode = $mode;
        }
    }

    // Called by Reverb on pipeline state transitions — used to clear the
    // cooldown indicator once the pipeline is actually running (idle → running).
    public function onPipelineState(array $event): void
    {
        $state = $event['payload']['state'] ?? $event['state'] ?? null;
        if ($state === 'idle') {
            Cache::forget($this->cooldownKey());
            $this->pipelineCooldown = false;
        }
    }

    public function setMode(string $mode): void
    {
        if (!in_array($mode, ['sleep', 'listen', 'active', 'record'])) return;

        try {
            app(MqttPublisher::class)->modeSet($this->mqttClientId, $mode);
            $this->currentMode = $mode; // optimistic update
        } catch (\Exception $e) {
            // E16: stay in previous state, surface as a toast
            $this->dispatch('toast', message: 'Mode switch failed: ' . $e->getMessage(), type: 'error');
        }
    }

    public function runPipeline(): void
    {
        // E14: 2-second cooldown stored in cache, not via sleep().
        // sleep() would block the entire PHP-FPM worker for 2s, hanging the browser.
        if ($this->pipelineCooldown || !$this->isOnline) return;

        Cache::put($this->cooldownKey(), true, seconds: 2);
        $this->pipelineCooldown = true;

        try {
            app(MqttPublisher::class)->triggerPipeline($this->mqttClientId);
        } catch (\Exception $e) {
            // On failure, release the cooldown immediately
            Cache::forget($this->cooldownKey());
            $this->pipelineCooldown = false;
            $this->dispatch('toast', message: 'Pipeline trigger failed: ' . $e->getMessage(), type: 'error');
        }
    }

    private function cooldownKey(): string
    {
        return "pipeline_cooldown_{$this->nodeBaseId}";
    }

    public function render(): \Illuminate\View\View
    {
        return view('livewire.node-base-card');
    }
}