<?php

namespace App\Livewire;

use Livewire\Component;
use Carbon\Carbon;

class SessionCard extends Component
{
    public array $session;

    public bool  $audioError   = false;
    public bool  $audioMissing = false;

    public function mount(array $session): void
    {
        $this->session = $session;
    }

    public function getAudioUrl(): ?string
    {
        if (empty($this->session['artifacts']['audio_asst'])) {
            return null;
        }
        return route('artifacts.serve', [
            'session' => $this->session['id'],
            'kind'    => 'audio_asst',
        ]);
    }

    public function render()
    {
        return view('livewire.session-card', [
            'audioUrl'   => $this->getAudioUrl(),
            'startedAt'  => Carbon::parse($this->session['started_at']),
        ]);
    }
}