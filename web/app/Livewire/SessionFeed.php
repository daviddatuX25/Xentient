<?php

namespace App\Livewire;

use Livewire\Component;           // was missing — fatal error on boot without this
use Livewire\Attributes\On;
use Illuminate\Support\Facades\DB;

class SessionFeed extends Component
{
    public int   $page    = 1;
    public int   $perPage = 20;
    public bool  $hasMore = false;
    public array $sessions = [];

    public function mount(): void
    {
        $this->loadSessions();
    }

    public function loadSessions(): void
    {
        $rows = DB::table('xentient_sessions as s')
            ->join('node_bases as n', 'n.id', '=', 's.node_base_id')
            ->orderByDesc('s.started_at')
            ->limit($this->perPage + 1)
            ->offset(($this->page - 1) * $this->perPage)
            ->select('s.*', 'n.name as node_name')
            ->get();

        $this->hasMore  = $rows->count() > $this->perPage;
        $this->sessions = $rows->take($this->perPage)
            ->map(fn($s) => $this->formatSession($s))
            ->toArray();
    }

    public function loadMore(): void
    {
        $this->page++;

        $rows = DB::table('xentient_sessions as s')
            ->join('node_bases as n', 'n.id', '=', 's.node_base_id')
            ->orderByDesc('s.started_at')
            ->limit($this->perPage + 1)
            ->offset(($this->page - 1) * $this->perPage)
            ->select('s.*', 'n.name as node_name')
            ->get();

        $this->hasMore  = $rows->count() > $this->perPage;
        $more = $rows->take($this->perPage)->map(fn($s) => $this->formatSession($s))->toArray();
        $this->sessions = array_merge($this->sessions, $more);
    }

    // SessionCompleted broadcasts on 'xentient.sessions' — this matches.
    #[On('echo:xentient.sessions,session.completed')]
    public function prependLatest(): void
    {
        $latest = DB::table('xentient_sessions as s')
            ->join('node_bases as n', 'n.id', '=', 's.node_base_id')
            ->orderByDesc('s.started_at')
            ->limit(1)
            ->select('s.*', 'n.name as node_name')
            ->first();

        if (!$latest) return;

        $formatted = $this->formatSession($latest);
        $ids = array_column($this->sessions, 'id');
        if (!in_array($formatted['id'], $ids)) {
            array_unshift($this->sessions, $formatted);
        }
    }

    private function formatSession(object $s): array
    {
        $turns = DB::table('turns')
            ->where('session_id', $s->id)
            ->orderBy('started_at')
            ->get()
            ->toArray();

        $artifacts = DB::table('artifacts')
            ->where('session_id', $s->id)
            ->get()
            ->keyBy('kind')
            ->toArray();

        return [
            'id'          => $s->id,
            'node_name'   => $s->node_name,
            'space_id'    => $s->space_id,
            'mode_during' => $s->mode_during,
            'status'      => $s->status,
            'started_at'  => $s->started_at,
            'ended_at'    => $s->ended_at,
            'turns'       => array_map(fn($t) => (array) $t, $turns),
            'artifacts'   => array_map(fn($a) => (array) $a, $artifacts),
        ];
    }

    public function render(): \Illuminate\View\View
    {
        return view('livewire.session-feed');
    }
}