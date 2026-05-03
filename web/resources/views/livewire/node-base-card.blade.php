<div class="bg-white rounded-2xl shadow p-6 space-y-4">

    {{-- Header: name + online dot --}}
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            <span class="text-lg font-semibold text-gray-800">{{ $name }}</span>
            <span class="text-xs text-gray-400 font-mono">{{ $mqttClientId }}</span>
        </div>
        <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full {{ $isOnline ? 'bg-green-400' : 'bg-gray-300' }}"></span>
            <span class="text-xs text-gray-500">
                @if($isOnline)
                    Online
                @elseif($lastSeenAt)
                    Last seen {{ $lastSeenAgo }}
                @else
                    Never seen
                @endif
            </span>
        </div>
    </div>

    {{-- BME280 reading --}}
    <div class="flex gap-4 text-sm text-gray-600">
        <span>🌡
            {{ $temperature !== null ? number_format($temperature, 1) . '°C' : '—' }}
        </span>
        <span>💧
            {{ $humidity !== null ? number_format($humidity, 1) . '%' : '—' }}
        </span>
    </div>

    {{-- Mode badge --}}
    <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">Mode:</span>
        <span @class([
            'px-2 py-0.5 rounded-full text-xs font-medium',
            'bg-blue-100 text-blue-700'   => $currentMode === 'listen',
            'bg-green-100 text-green-700' => $currentMode === 'active',
            'bg-yellow-100 text-yellow-700' => $currentMode === 'record',
            'bg-gray-100 text-gray-500'   => $currentMode === 'sleep',
        ])>
            {{ ucfirst($currentMode) }}
        </span>
    </div>

    {{-- Mode switch buttons --}}
    <div class="flex gap-2 flex-wrap">
        @foreach(['sleep', 'listen', 'active', 'record'] as $mode)
            <button
                wire:click="setMode('{{ $mode }}')"
                wire:loading.attr="disabled"
                wire:target="setMode('{{ $mode }}')"
                @disabled(!$isOnline)
                title="{{ !$isOnline ? 'Node offline' : ucfirst($mode) }}"
                class="px-3 py-1 text-xs rounded-lg border
                    {{ $currentMode === $mode
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400' }}
                    disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {{ ucfirst($mode) }}
            </button>
        @endforeach
    </div>

    {{-- Run pipeline button --}}
    <button
        wire:click="runPipeline"
        wire:loading.attr="disabled"
        wire:target="runPipeline"
        @disabled(!$isOnline || $pipelineCooldown)
        title="{{ !$isOnline ? 'Node offline' : '' }}"
        class="w-full py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium
               hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
    >
        <span wire:loading.remove wire:target="runPipeline">▶ Run pipeline now</span>
        <span wire:loading wire:target="runPipeline">Starting…</span>
    </button>

    {{-- Last interaction snippet --}}
    @if($lastSnippet)
        <div class="text-xs text-gray-400 border-t pt-3 space-y-0.5">
            <div class="font-medium text-gray-500">Last interaction
                {{ $lastSessionAt ? \Carbon\Carbon::parse($lastSessionAt)->diffForHumans() : '' }}
            </div>
            <div class="italic">"{{ $lastSnippet }}"</div>
        </div>
    @else
        <div class="text-xs text-gray-400 border-t pt-3 italic">
            No sessions yet — press <strong>Run pipeline now</strong> to record one.
        </div>
    @endif

</div>