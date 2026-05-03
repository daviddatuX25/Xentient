<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Queue\SerializesModels;

class PipelineStateChanged implements ShouldBroadcast
{
    use SerializesModels;

    public function __construct(
        public int   $nodeBaseId,
        public array $payload,
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('xentient.node.' . $this->nodeBaseId);
    }

    public function broadcastAs(): string
    {
        return 'pipeline.state';
    }
}