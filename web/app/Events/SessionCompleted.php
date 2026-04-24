<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Queue\SerializesModels;

class SessionCompleted implements ShouldBroadcast
{
    use SerializesModels;

    public function __construct(
        public int   $nodeBaseId,
        public int   $sessionId,
        public array $payload,
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('xentient.sessions');
    }

    public function broadcastAs(): string
    {
        return 'session.completed';
    }
}