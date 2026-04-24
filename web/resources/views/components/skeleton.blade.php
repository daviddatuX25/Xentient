{{--
    Skeleton loader component
    Usage:
      <x-skeleton lines="3" />                    — text lines
      <x-skeleton type="card" />                  — full card
      <x-skeleton type="sparkline" />             — chart area
      <x-skeleton type="pir-row" count="5" />     — list rows
--}}

@props([
    'type'  => 'lines',
    'lines' => 3,
    'count' => 4,
])

<div class="sk-wrap" aria-busy="true" aria-label="Loading…">

    @if($type === 'card')
        <div class="sk-card">
            <div class="sk-block sk-block--title"></div>
            <div class="sk-block sk-block--subtitle"></div>
            <div class="sk-row">
                <div class="sk-block sk-block--pill"></div>
                <div class="sk-block sk-block--pill"></div>
                <div class="sk-block sk-block--pill"></div>
                <div class="sk-block sk-block--pill"></div>
            </div>
            <div class="sk-block sk-block--btn"></div>
        </div>

    @elseif($type === 'sparkline')
        <div class="sk-sparkline">
            <div class="sk-block sk-block--label"></div>
            <div class="sk-block sk-block--chart"></div>
        </div>

    @elseif($type === 'pir-row')
        @for($i = 0; $i < $count; $i++)
        <div class="sk-pir-row">
            <div class="sk-block sk-block--dot"></div>
            <div class="sk-block sk-block--pir-time"></div>
            <div class="sk-block sk-block--pir-detail"></div>
        </div>
        @endfor

    @else
        {{-- default: text lines --}}
        @for($i = 0; $i < $lines; $i++)
        <div class="sk-block sk-block--line" style="width: {{ 100 - ($i * 8) }}%"></div>
        @endfor
    @endif

</div>

<style>
@keyframes sk-shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
}
.sk-wrap { width: 100%; }
.sk-block {
    border-radius: var(--border-radius-md);
    background: linear-gradient(
        90deg,
        var(--color-background-secondary) 25%,
        var(--color-background-tertiary) 50%,
        var(--color-background-secondary) 75%
    );
    background-size: 800px 100%;
    animation: sk-shimmer 1.4s ease-in-out infinite;
}
.sk-block--title    { height: 22px; width: 55%; margin-bottom: 10px; }
.sk-block--subtitle { height: 14px; width: 35%; margin-bottom: 18px; }
.sk-block--line     { height: 14px; margin-bottom: 10px; }
.sk-block--btn      { height: 40px; width: 100%; border-radius: var(--border-radius-lg); }
.sk-block--pill     { height: 30px; width: 72px; border-radius: 999px; }
.sk-block--label    { height: 12px; width: 80px; margin-bottom: 8px; }
.sk-block--chart    { height: 72px; width: 100%; border-radius: var(--border-radius-md); }
.sk-block--dot      { height: 8px; width: 8px; border-radius: 50%; flex-shrink: 0; }
.sk-block--pir-time { height: 12px; width: 110px; }
.sk-block--pir-detail { height: 12px; width: 160px; }

.sk-card   { display: flex; flex-direction: column; gap: 10px; }
.sk-row    { display: flex; gap: 8px; margin: 4px 0; }
.sk-sparkline { display: flex; flex-direction: column; }
.sk-pir-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--color-border-tertiary);
}
.sk-pir-row:last-child { border-bottom: none; }
</style>