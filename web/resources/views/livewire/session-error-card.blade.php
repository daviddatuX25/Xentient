{{-- livewire/session-error-card.blade.php --}}
@if($visible)
<div class="sec-card sec-card--{{ $severity }}" role="alert">

    <div class="sec-header">
        <div class="sec-title">
            <span class="sec-icon">{{ $severity === 'fatal' ? '✕' : '!' }}</span>
            <span>
                Session {{ $severity === 'fatal' ? 'failed' : 'error' }}
                @if($severity === 'recoverable')
                    <span class="sec-badge sec-badge--recoverable">Recoverable</span>
                @else
                    <span class="sec-badge sec-badge--fatal">Fatal</span>
                @endif
            </span>
        </div>
        <button class="sec-dismiss" wire:click="dismiss" aria-label="Dismiss">×</button>
    </div>

    <p class="sec-message">{{ $errorMessage }}</p>

    @if($severity === 'recoverable')
    <div class="sec-actions">
        <button
            class="sec-reset-btn"
            wire:click="reset"
            wire:loading.attr="disabled"
            wire:target="reset"
        >
            <span wire:loading.remove wire:target="reset">↺ Reset conversation</span>
            <span wire:loading wire:target="reset">Resetting…</span>
        </button>
        <span class="sec-hint">Sets node to Sleep → Listen</span>
    </div>
    @endif

</div>
@endif

<style>
.sec-card {
    border-radius: var(--border-radius-lg);
    border: 1px solid;
    padding: 1rem 1.1rem;
    margin-bottom: 1rem;
}
.sec-card--recoverable {
    background: var(--color-background-warning);
    border-color: var(--color-border-warning);
}
.sec-card--fatal {
    background: var(--color-background-danger);
    border-color: var(--color-border-danger);
}
.sec-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 0.4rem;
}
.sec-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
}
.sec-icon {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 700;
    flex-shrink: 0;
}
.sec-card--recoverable .sec-icon {
    background: var(--color-background-warning);
    color: var(--color-text-warning);
    border: 1.5px solid var(--color-border-warning);
}
.sec-card--fatal .sec-icon {
    background: var(--color-background-danger);
    color: var(--color-text-danger);
    border: 1.5px solid var(--color-border-danger);
}
.sec-badge {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
}
.sec-badge--recoverable {
    background: var(--color-background-warning);
    color: var(--color-text-warning);
    border: 1px solid var(--color-border-warning);
}
.sec-badge--fatal {
    background: var(--color-background-danger);
    color: var(--color-text-danger);
    border: 1px solid var(--color-border-danger);
}
.sec-dismiss {
    background: none;
    border: none;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    color: var(--color-text-tertiary);
    padding: 0 0 0 0.5rem;
}
.sec-dismiss:hover { color: var(--color-text-primary); }
.sec-message {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    margin: 0 0 0.75rem;
}
.sec-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.sec-reset-btn {
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.35rem 0.9rem;
    border-radius: var(--border-radius-md);
    border: 1.5px solid var(--color-border-warning);
    background: var(--color-background-primary);
    color: var(--color-text-warning);
    cursor: pointer;
    transition: opacity 0.15s;
}
.sec-reset-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sec-reset-btn:hover:not(:disabled) { opacity: 0.8; }
.sec-hint {
    font-size: 0.7rem;
    color: var(--color-text-tertiary);
}
</style>