{{-- livewire/mqtt-status-banner.blade.php --}}
<div wire:poll.10s="refresh">

    @if($brokerDown)
    <div class="xb-banner xb-banner--warn" role="alert">
        <span class="xb-banner-icon">⚠</span>
        <span class="xb-banner-text">
            Broker disconnected — retrying.
            Live controls are unavailable until the connection is restored.
        </span>
    </div>
    @endif

    @if($reverbDown && !$brokerDown)
    <div class="xb-banner xb-banner--info" role="alert">
        <span class="xb-banner-icon">↻</span>
        <span class="xb-banner-text">
            Live updates offline
            @if($heartbeatAgoS < 9999)
                — last bridge heartbeat {{ $heartbeatAgoS }}s ago.
            @else
                — bridge may not be running (<code>php artisan mqtt:listen</code>).
            @endif
            Page is polling every 10s as fallback.
        </span>
    </div>
    @endif

</div>

<style>
.xb-banner {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 1.25rem;
    font-size: 0.8rem;
    font-weight: 500;
    border-bottom: 1px solid transparent;
}
.xb-banner--warn {
    background: var(--color-background-warning);
    border-color: var(--color-border-warning);
    color: var(--color-text-warning);
}
.xb-banner--info {
    background: var(--color-background-info);
    border-color: var(--color-border-info);
    color: var(--color-text-info);
}
.xb-banner-icon {
    flex-shrink: 0;
    font-size: 0.9rem;
}
.xb-banner-text code {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    opacity: 0.85;
}
</style>