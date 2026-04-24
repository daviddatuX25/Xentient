<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Queue\SerializesModels;

class ModeChanged implements ShouldBroadcast
{
    use SerializesModels;

    public function __construct(
        public int    $nodeBaseId,
        public string $mode,
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('xentient.node.' . $this->nodeBaseId);
    }

    public function broadcastAs(): string
    {
        return 'mode.changed';
    }
}