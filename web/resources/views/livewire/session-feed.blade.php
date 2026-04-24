<div>
    {{-- Empty state --}}
    @if(count($sessions) === 0)
        <div class="text-center py-20 text-gray-400 italic">
            No sessions yet — press <strong class="text-gray-600">Run pipeline now</strong> to record one.
        </div>
    @else
        <div class="space-y-4">
            @foreach($sessions as $session)
                <livewire:session-card :session="$session" :key="$session['id']" />
            @endforeach
        </div>

        {{-- Load more --}}
        @if($hasMore)
            <div class="text-center pt-6">
                <button
                    wire:click="loadMore"
                    wire:loading.text="Loading..."
                    class="px-6 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:border-indigo-400"
                >
                    Load more
                </button>
            </div>
        @endif
    @endif
</div>