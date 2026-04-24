<div @class([
    'bg-white rounded-2xl shadow p-5 space-y-3 border-l-4',
    'border-green-400'  => $session['status'] === 'done',
    'border-amber-400'  => $session['status'] === 'error',
    'border-blue-400'   => $session['status'] === 'running',
])>

    {{-- Header --}}
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            {{-- Mode badge --}}
            <span @class([
                'px-2 py-0.5 rounded-full text-xs font-medium',
                'bg-blue-100 text-blue-700'     => $session['mode_during'] === 'listen',
                'bg-green-100 text-green-700'   => $session['mode_during'] === 'active',
                'bg-yellow-100 text-yellow-700' => $session['mode_during'] === 'record',
                'bg-gray-100 text-gray-500'     => $session['mode_during'] === 'sleep',
            ])>
                {{ ucfirst($session['mode_during']) }}
            </span>

            {{-- Status badge --}}
            @if($session['status'] === 'error')
                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    Error
                </span>
            @endif

            <span class="text-xs text-gray-400">{{ $session['node_name'] ?? '' }}</span>
        </div>

        {{-- Timestamp --}}
        <div class="text-right">
            <span class="text-xs text-gray-500" title="{{ $startedAt->toDateTimeString() }}">
                {{ $startedAt->diffForHumans() }}
            </span>
        </div>
    </div>

    {{-- Turns --}}
    @forelse($session['turns'] as $turn)
        <div @class([
            'text-sm rounded-xl px-4 py-2',
            'bg-gray-100 text-gray-700'   => $turn['role'] === 'user',
            'bg-indigo-50 text-indigo-800' => $turn['role'] === 'assistant',
        ])>
            <span class="text-xs font-semibold uppercase tracking-wide opacity-50 mr-1">
                {{ $turn['role'] }}
            </span>
            {{-- E6: safe UTF-8 output --}}
            <span>{{ \Str::limit($turn['text'], 200) }}</span>
        </div>
    @empty
        <div class="text-xs text-gray-400 italic">No transcript available.</div>
    @endforelse

    {{-- Audio player --}}
    @if($audioUrl)
        <div class="pt-1">
            <p class="text-xs text-gray-400 mb-1">Assistant audio</p>
            <audio
                controls
                preload="none"
                class="w-full h-8"
                onerror="this.parentElement.innerHTML='<p class=\'text-xs text-amber-500\'>⚠ Audio missing or not yet ready.</p>'"
            >
                <source src="{{ $audioUrl }}" type="audio/wav">
            </audio>
        </div>
    @else
        <div class="text-xs text-gray-400 italic">No audio available.</div>
    @endif

    {{-- Error session reset button --}}
    @if($session['status'] === 'error')
        <div class="pt-1 border-t">
            <p class="text-xs text-amber-600 mb-2">
                ⚠ Session ended with an error.
            </p>
        </div>
    @endif

</div>