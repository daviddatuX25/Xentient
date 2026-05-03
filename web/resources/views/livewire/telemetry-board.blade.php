{{-- TelemetryBoard — Xentient-z98 --}}
<div
    wire:poll.30s="loadTelemetry"
    x-data="telemetryBoard(@js($rmsSparkline), @js($tempSparkline), @js($humiditySparkline))"
    x-init="init()"
    @sparklines-refresh.window="refresh($event.detail)"
    class="telemetry-board"
>

    {{-- Header --}}
    <div class="tb-header">
        <div class="tb-title">
            <span class="tb-title-label">Telemetry</span>
            <span class="tb-node-badge">{{ $nodeBaseId }}</span>
        </div>
        <div class="tb-meta">
            @if($lastUpdated)
                <span class="tb-updated">
                    Updated <span x-text="relativeTime('{{ $lastUpdated }}')"></span>
                </span>
            @endif
            <span class="tb-live-dot {{ $liveConnected ? 'tb-live-dot--on' : 'tb-live-dot--off' }}"></span>
        </div>
    </div>

    {{-- Sparklines grid --}}
    <div class="tb-charts">

        {{-- RMS sparkline --}}
        <div class="tb-chart-card">
            <div class="tb-chart-header">
                <span class="tb-chart-label">Mic RMS</span>
                <span class="tb-chart-unit">amplitude</span>
            </div>
            <div class="tb-chart-area">
                <canvas id="chart-rms" height="72"></canvas>
                <div class="tb-chart-empty" x-show="!hasData.rms">No microphone data yet</div>
            </div>
        </div>

        {{-- Temperature sparkline --}}
        <div class="tb-chart-card">
            <div class="tb-chart-header">
                <span class="tb-chart-label">Temperature</span>
                <span class="tb-chart-unit">°C · BME280</span>
            </div>
            <div class="tb-chart-area">
                <canvas id="chart-temp" height="72"></canvas>
                <div class="tb-chart-empty" x-show="!hasData.temp">No temperature data yet</div>
            </div>
            <div class="tb-chart-stat" x-show="hasData.temp">
                <span x-text="latestVal.temp !== null ? latestVal.temp.toFixed(1) + ' °C' : '—'"></span>
            </div>
        </div>

        {{-- Humidity sparkline --}}
        <div class="tb-chart-card">
            <div class="tb-chart-header">
                <span class="tb-chart-label">Humidity</span>
                <span class="tb-chart-unit">% RH · BME280</span>
            </div>
            <div class="tb-chart-area">
                <canvas id="chart-humidity" height="72"></canvas>
                <div class="tb-chart-empty" x-show="!hasData.humidity">No humidity data yet</div>
            </div>
            <div class="tb-chart-stat" x-show="hasData.humidity">
                <span x-text="latestVal.humidity !== null ? latestVal.humidity.toFixed(1) + ' %' : '—'"></span>
            </div>
        </div>

    </div>

    {{-- PIR ticker --}}
    <div class="tb-pir">
        <div class="tb-pir-header">
            <span class="tb-chart-label">Motion events</span>
            <span class="tb-chart-unit">last 6 h</span>
        </div>

        @if(count($pirEvents) === 0)
            <div class="tb-pir-empty">
                No motion events detected in the last 6 hours.
            </div>
        @else
            <div class="tb-pir-list">
                @foreach($pirEvents as $evt)
                    <div class="tb-pir-row">
                        <span class="tb-pir-dot"></span>
                        <span class="tb-pir-time" title="{{ $evt['occurred_at'] }}">
                            {{ \Carbon\Carbon::parse($evt['occurred_at'])->diffForHumans() }}
                        </span>
                        <span class="tb-pir-detail">
                            @if(!empty($evt['payload']['confidence']))
                                confidence {{ $evt['payload']['confidence'] }}%
                            @else
                                motion detected
                            @endif
                        </span>
                    </div>
                @endforeach
            </div>
        @endif
    </div>

</div>

<style>
.telemetry-board {
    padding: 0 0 2rem;
}
.tb-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
}
.tb-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.tb-title-label {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
}
.tb-node-badge {
    font-size: 0.7rem;
    font-weight: 500;
    font-family: var(--font-mono);
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border-tertiary);
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
    color: var(--color-text-secondary);
    letter-spacing: 0.04em;
}
.tb-meta {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}
.tb-updated {
    font-size: 0.72rem;
    color: var(--color-text-tertiary);
}
.tb-live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}
.tb-live-dot--on {
    background: var(--color-background-success);
    animation: tb-pulse 2s ease-in-out infinite;
}
.tb-live-dot--off {
    background: var(--color-border-tertiary);
}
@keyframes tb-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.45; }
}

/* Chart grid */
.tb-charts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
    margin-bottom: 1.25rem;
}
.tb-chart-card {
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border-tertiary);
    border-radius: var(--border-radius-lg);
    padding: 1rem 1.1rem 0.85rem;
    position: relative;
}
.tb-chart-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 0.6rem;
}
.tb-chart-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-primary);
    letter-spacing: 0.02em;
    text-transform: uppercase;
}
.tb-chart-unit {
    font-size: 0.68rem;
    color: var(--color-text-tertiary);
    font-family: var(--font-mono);
}
.tb-chart-area {
    position: relative;
    height: 72px;
}
.tb-chart-area canvas {
    width: 100% !important;
    height: 72px !important;
}
.tb-chart-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.72rem;
    color: var(--color-text-tertiary);
}
.tb-chart-stat {
    margin-top: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
}

/* PIR ticker */
.tb-pir {
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border-tertiary);
    border-radius: var(--border-radius-lg);
    padding: 1rem 1.1rem;
}
.tb-pir-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 0.75rem;
}
.tb-pir-empty {
    font-size: 0.78rem;
    color: var(--color-text-tertiary);
    padding: 0.5rem 0;
}
.tb-pir-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 220px;
    overflow-y: auto;
}
.tb-pir-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.78rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--color-border-tertiary);
}
.tb-pir-row:last-child {
    border-bottom: none;
}
.tb-pir-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-warning);
    flex-shrink: 0;
}
.tb-pir-time {
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
    min-width: 110px;
    flex-shrink: 0;
}
.tb-pir-detail {
    color: var(--color-text-tertiary);
}
</style>

<script>
function telemetryBoard(rmsData, tempData, humidityData) {
    return {
        hasData: {
            rms:      rmsData.length > 0,
            temp:     tempData.length > 0,
            humidity: humidityData.length > 0,
        },
        latestVal: {
            temp:     tempData.length > 0 ? tempData.at(-1).y : null,
            humidity: humidityData.length > 0 ? humidityData.at(-1).y : null,
        },
        charts: {},

        relativeTime(isoString) {
            if (!isoString) return '';
            const diff = Math.round((Date.now() - new Date(isoString)) / 1000);
            if (diff < 10)  return 'just now';
            if (diff < 60)  return diff + 's ago';
            if (diff < 3600) return Math.floor(diff/60) + 'm ago';
            return Math.floor(diff/3600) + 'h ago';
        },

        init() {
            // Wait for Chart.js to load
            const check = setInterval(() => {
                if (typeof Chart !== 'undefined') {
                    clearInterval(check);
                    this.buildCharts(rmsData, tempData, humidityData);
                }
            }, 50);
        },

        buildCharts(rms, temp, humidity) {
            const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const gridColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
            const textColor = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';

            const baseOpts = (color) => ({
                type: 'line',
                options: {
                    responsive: false,
                    animation: { duration: 300 },
                    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                    scales: {
                        x: {
                            type: 'time',
                            time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } },
                            grid: { color: gridColor },
                            ticks: { color: textColor, font: { size: 10 }, maxTicksLimit: 5 },
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: { color: textColor, font: { size: 10 }, maxTicksLimit: 4 },
                        },
                    },
                },
            });

            const makeDataset = (data, color, fill) => ({
                data,
                borderColor: color,
                backgroundColor: fill,
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.35,
                fill: true,
            });

            // RMS — blue
            const rmsCtx = document.getElementById('chart-rms');
            if (rmsCtx) {
                const cfg = { ...baseOpts('#378ADD') };
                cfg.data = { datasets: [makeDataset(rms, '#378ADD', 'rgba(55,138,221,0.12)')] };
                this.charts.rms = new Chart(rmsCtx, cfg);
            }

            // Temp — coral
            const tempCtx = document.getElementById('chart-temp');
            if (tempCtx) {
                const cfg = { ...baseOpts('#D85A30') };
                cfg.data = { datasets: [makeDataset(temp, '#D85A30', 'rgba(216,90,48,0.1)')] };
                this.charts.temp = new Chart(tempCtx, cfg);
            }

            // Humidity — teal
            const humCtx = document.getElementById('chart-humidity');
            if (humCtx) {
                const cfg = { ...baseOpts('#1D9E75') };
                cfg.data = { datasets: [makeDataset(humidity, '#1D9E75', 'rgba(29,158,117,0.1)')] };
                this.charts.humidity = new Chart(humCtx, cfg);
            }
        },

        refresh(payload) {
            const { rms, temp, humidity } = payload;

            this.hasData.rms      = rms.length > 0;
            this.hasData.temp     = temp.length > 0;
            this.hasData.humidity = humidity.length > 0;
            this.latestVal.temp     = temp.length > 0 ? temp.at(-1).y : null;
            this.latestVal.humidity = humidity.length > 0 ? humidity.at(-1).y : null;

            const upd = (chart, data) => {
                if (!chart) return;
                chart.data.datasets[0].data = data;
                chart.update('none');
            };
            upd(this.charts.rms,      rms);
            upd(this.charts.temp,     temp);
            upd(this.charts.humidity, humidity);
        },
    };
}
</script>