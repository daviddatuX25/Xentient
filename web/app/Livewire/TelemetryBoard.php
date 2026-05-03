<?php

namespace App\Livewire;

use App\Models\TelemetrySample;
use App\Models\Event;
use App\Models\NodeBase;
use Livewire\Component;
use Livewire\Attributes\On;
use Carbon\Carbon;

class TelemetryBoard extends Component
{
    public array $rmsSparkline = [];
    public array $tempSparkline = [];
    public array $humiditySparkline = [];
    public array $pirEvents = [];
    public ?string $nodeBaseId = null;
    public ?string $lastUpdated = null;
    public bool $liveConnected = true;

    public function mount(): void
    {
        $this->nodeBaseId = config('spaces.spaces.living-room.node_id', 'node-01');
        $this->loadTelemetry();
        $this->loadPirEvents();
    }

    public function loadTelemetry(): void
    {
        $node = NodeBase::where('mqtt_client_id', $this->nodeBaseId)->first();
        if (! $node) {
            return;
        }

        // RMS samples (peripheral_type = 'microphone' or contains rms in payload)
        $rmsSamples = TelemetrySample::where('node_base_id', $node->id)
            ->where('peripheral_type', 'microphone')
            ->where('recorded_at', '>=', now()->subHours(1))
            ->orderBy('recorded_at')
            ->get(['payload_json', 'recorded_at'])
            ->map(fn ($s) => [
                'x' => Carbon::parse($s->recorded_at)->timestamp * 1000,
                'y' => data_get(json_decode($s->payload_json, true), 'rms', 0),
            ])
            ->values()
            ->toArray();

        // BME280 env samples
        $envSamples = TelemetrySample::where('node_base_id', $node->id)
            ->where('peripheral_type', 'bme280')
            ->where('recorded_at', '>=', now()->subHours(1))
            ->orderBy('recorded_at')
            ->get(['payload_json', 'recorded_at']);

        $tempSamples = $envSamples->map(fn ($s) => [
            'x' => Carbon::parse($s->recorded_at)->timestamp * 1000,
            'y' => data_get(json_decode($s->payload_json, true), 'temperature', null),
        ])->filter(fn ($p) => $p['y'] !== null)->values()->toArray();

        $humiditySamples = $envSamples->map(fn ($s) => [
            'x' => Carbon::parse($s->recorded_at)->timestamp * 1000,
            'y' => data_get(json_decode($s->payload_json, true), 'humidity', null),
        ])->filter(fn ($p) => $p['y'] !== null)->values()->toArray();

        $this->rmsSparkline    = $rmsSamples;
        $this->tempSparkline   = $tempSamples;
        $this->humiditySparkline = $humiditySamples;
        $this->lastUpdated     = now()->toISOString();
    }

    public function loadPirEvents(): void
    {
        $node = NodeBase::where('mqtt_client_id', $this->nodeBaseId)->first();
        if (! $node) {
            return;
        }

        $this->pirEvents = Event::where('node_base_id', $node->id)
            ->where('kind', 'motion')
            ->where('occurred_at', '>=', now()->subHours(6))
            ->orderByDesc('occurred_at')
            ->limit(50)
            ->get(['payload_json', 'occurred_at'])
            ->map(fn ($e) => [
                'occurred_at' => $e->occurred_at,
                'relative'    => Carbon::parse($e->occurred_at)->diffForHumans(),
                'payload'     => json_decode($e->payload_json, true),
            ])
            ->toArray();
    }

    // Called by Reverb broadcast event TelemetryUpdated
    #[On('echo:telemetry,telemetry.updated')]
    public function onTelemetryUpdated(array $event): void
    {
        $this->loadTelemetry();

        if (($event['peripheral_type'] ?? '') === 'pir') {
            $this->loadPirEvents();
        }

        $this->dispatch('sparklines-refresh', [
            'rms'      => $this->rmsSparkline,
            'temp'     => $this->tempSparkline,
            'humidity' => $this->humiditySparkline,
        ]);
    }

    public function render(): \Illuminate\View\View
    {
        return view('livewire.telemetry-board');
    }
}