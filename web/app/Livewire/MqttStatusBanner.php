<?php

namespace App\Livewire;

use App\Services\MqttPublisher;
use Livewire\Component;
use Livewire\Attributes\On;

class MqttStatusBanner extends Component
{
    public bool $brokerDown    = false;
    public bool $reverbDown    = false;
    public int  $heartbeatAgoS = 0;

    public function mount(): void
    {
        $this->checkBroker();
        $this->checkHeartbeat();
    }

    // Called by wire:poll.10s in the blade
    public function refresh(): void
    {
        $this->checkBroker();
        $this->checkHeartbeat();
    }

    // Any Reverb event arriving proves the WS channel is alive (E2).
    // 'telemetry' is a fixed channel — no node ID needed.
    // 'xentient.sessions' carries both session.completed and session.errored.
    // The per-node 'xentient.node.X' channels are intentionally excluded here
    // because we don't know which node IDs exist at component mount time.
    #[On('echo:telemetry,telemetry.updated')]
    #[On('echo:xentient.sessions,session.completed')]
    #[On('echo:xentient.sessions,session.errored')]
    public function onReverbEvent(): void
    {
        $this->reverbDown = false;
    }

    private function checkBroker(): void
    {
        try {
            $this->brokerDown = ! app(MqttPublisher::class)->isConnected();
        } catch (\Throwable) {
            $this->brokerDown = true;
        }
    }

    private function checkHeartbeat(): void
    {
        // E3: bridge writes a 'bridge_heartbeat' event every 30s.
        // If the last one is >60s ago we treat live updates as suspect.
        $last = \DB::table('events')
            ->where('kind', 'bridge_heartbeat')
            ->orderByDesc('occurred_at')
            ->value('occurred_at');

        $this->heartbeatAgoS = $last
            ? (int) now()->diffInSeconds(\Carbon\Carbon::parse($last))
            : 9999;

        if ($this->heartbeatAgoS > 60) {
            $this->reverbDown = true;
        }
    }

    public function render(): \Illuminate\View\View
    {
        return view('livewire.mqtt-status-banner');
    }
}