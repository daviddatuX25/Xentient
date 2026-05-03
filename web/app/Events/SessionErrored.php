<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Queue\SerializesModels;

class SessionErrored implements ShouldBroadcast
{
    use SerializesModels;

    public function __construct(
        public int    $nodeBaseId,
        public string $nodeMqttClientId, // added so the card can call modeSet without a DB lookup
        public array  $payload,
    ) {}

    // Broadcast on the same channel as SessionCompleted so SessionErrorCard
    // can subscribe with a fixed channel name, not a per-node dynamic one.
    public function broadcastOn(): Channel
    {
        return new Channel('xentient.sessions');
    }

    public function broadcastAs(): string
    {
        return 'session.errored';
    }

    public function broadcastWith(): array
    {
        return [
            'node_base_id'        => $this->nodeBaseId,
            'node_mqtt_client_id' => $this->nodeMqttClientId,
            'session_id'          => $this->payload['sessionId']  ?? null,
            'message'             => $this->payload['message']    ?? 'Unknown error',
            'severity'            => $this->payload['recoverable'] ?? true ? 'recoverable' : 'fatal',
        ];
    }
}