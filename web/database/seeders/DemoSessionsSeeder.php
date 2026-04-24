<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class DemoSessionsSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Seed the node base
        $nodeBaseId = DB::table('node_bases')->insertGetId([
            'mqtt_client_id'      => 'node-01',
            'name'                => 'Living Room Node',
            'online_last_seen_at' => Carbon::now()->subMinutes(2),
            'created_at'          => Carbon::now(),
            'updated_at'          => Carbon::now(),
        ]);

        // 2. Load fixtures from harness
        $fixturesPath = base_path('../harness/fixtures/sessions');

        // Fallback: if harness not yet available, use inline stubs
        $fixtures = $this->loadFixtures($fixturesPath);

        // 3. Seed up to 20 sessions
        foreach (array_slice($fixtures, 0, 20) as $fixture) {
$sessionId = DB::table('xentient_sessions')->insertGetId([
                'node_base_id' => $nodeBaseId,
                'space_id'     => $fixture['spaceId']    ?? 'living-room',
                'started_at'   => Carbon::createFromTimestampMs($fixture['startedAt'] ?? now()->valueOf()),
                'ended_at'     => isset($fixture['endedAt'])
                                    ? Carbon::createFromTimestampMs($fixture['endedAt'])
                                    : null,
                'mode_during'  => $fixture['mode']       ?? 'listen',
                'status'       => $fixture['status']     ?? 'done',
                'created_at'   => Carbon::now(),
                'updated_at'   => Carbon::now(),
            ]);

            // 4. Seed turns
            foreach ($fixture['turns'] ?? [] as $turn) {
                DB::table('turns')->insert([
                    'session_id'  => $sessionId,
                    'role'        => $turn['role'],
                    'text'        => $turn['text'],
                    'audio_path'  => null,
                    'started_at'  => Carbon::createFromTimestampMs($turn['startedAt'] ?? now()->valueOf()),
                    'duration_ms' => $turn['durationMs'] ?? 0,
                    'created_at'  => Carbon::now(),
                    'updated_at'  => Carbon::now(),
                ]);
            }

            // 5. Seed artifacts
            $artifacts = $fixture['artifacts'] ?? [];
            $kindMap = [
                'userAudio'  => 'audio_user',
                'asstAudio'  => 'audio_asst',
                'transcript' => 'transcript',
                'meta'       => 'meta_json',
                'camera'     => 'camera_snapshot',
            ];

            foreach ($kindMap as $key => $kind) {
                if (!empty($artifacts[$key])) {
                    DB::table('artifacts')->insert([
                        'session_id' => $sessionId,
                        'kind'       => $kind,
                        'path'       => $artifacts[$key],  // relative path
                        'bytes'      => 0,
                        'sha256'     => null,
                        'created_at' => Carbon::now(),
                        'updated_at' => Carbon::now(),
                    ]);
                }
            }
        }
    }

    private function loadFixtures(string $path): array
    {
        // If harness fixtures exist, load them
        if (is_dir($path)) {
            $files = glob($path . '/*.json');
            return array_map(
                fn($f) => json_decode(file_get_contents($f), true),
                $files
            );
        }

        // Fallback stubs so seeder works even without harness yet
        return array_map(fn($i) => [
            'spaceId'   => 'living-room',
            'startedAt' => now()->subMinutes($i * 3)->valueOf(),
            'endedAt'   => now()->subMinutes(($i * 3) - 1)->valueOf(),
            'mode'      => 'listen',
            'status'    => 'done',
            'turns'     => [
                ['role' => 'user',      'text' => 'Demo user turn '      . $i, 'startedAt' => now()->subMinutes($i * 3)->valueOf(),       'durationMs' => 2100],
                ['role' => 'assistant', 'text' => 'Demo assistant turn ' . $i, 'startedAt' => now()->subMinutes($i * 3 - 1)->valueOf(),   'durationMs' => 1400],
            ],
            'artifacts' => [],
        ], range(1, 10));
    }
}