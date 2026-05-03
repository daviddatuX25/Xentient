<?php

namespace App\Livewire;

use App\Services\MqttPublisher;
use Livewire\Component;
use Livewire\Attributes\On;

class SessionErrorCard extends Component
{
    public bool   $visible             = false;
    public string $errorMessage        = '';
    public string $severity            = 'recoverable'; // 'recoverable' | 'fatal'
    public string $sessionId           = '';
    public string $nodeMqttClientId    = 'node-01';     // set from event, used by reset()
    public bool   $resetting           = false;

    // SessionErrored now broadcasts on 'xentient.sessions' (not a per-node channel)
    // so we can subscribe here without knowing the integer node ID in advance.
    #[On('echo:xentient.sessions,session.errored')]
    public function onSessionError(array $event): void
    {
        $this->visible           = true;
        $this->sessionId         = $event['session_id']          ?? '';
        $this->errorMessage      = $event['message']             ?? 'Unknown error';
        $this->severity          = $event['severity']            ?? 'recoverable';
        $this->nodeMqttClientId  = $event['node_mqtt_client_id'] ?? 'node-01';
        $this->resetting         = false;
    }

    // Publishes sleep → listen to clear the stuck state (E16 safe path).
    // Uses nodeMqttClientId captured from the event — never hardcoded.
    public function reset(): void
    {
        if ($this->resetting) return;
        $this->resetting = true;

        try {
            $publisher = app(MqttPublisher::class);
            $publisher->modeSet($this->nodeMqttClientId, 'sleep');
            usleep(300_000); // 300 ms — lets firmware state machine settle
            $publisher->modeSet($this->nodeMqttClientId, 'listen');
        } catch (\Throwable $e) {
            \Log::channel('mqtt')->error('SessionErrorCard reset failed', [
                'node' => $this->nodeMqttClientId,
                'err'  => $e->getMessage(),
            ]);
        }

        $this->visible   = false;
        $this->resetting = false;
    }

    public function dismiss(): void
    {
        $this->visible = false;
    }

    public function render(): \Illuminate\View\View
    {
        return view('livewire.session-error-card');
    }
}