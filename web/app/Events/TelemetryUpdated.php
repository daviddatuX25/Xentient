<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TelemetryUpdated implements ShouldBroadcast
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly string $nodeBaseId,
        public readonly string $peripheralType,
        public readonly array  $payload,
        public readonly int    $recordedAtMs,
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('telemetry');
    }

    public function broadcastAs(): string
    {
        return 'telemetry.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'node_base_id'    => $this->nodeBaseId,
            'peripheral_type' => $this->peripheralType,
            'payload'         => $this->payload,
            'recorded_at_ms'  => $this->recordedAtMs,
        ];
    }
}