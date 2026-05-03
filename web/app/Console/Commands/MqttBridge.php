<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use PhpMqtt\Client\MqttClient;
use PhpMqtt\Client\ConnectionSettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class MqttBridge extends Command
{
    protected $signature   = 'mqtt:listen';
    protected $description = 'Long-running MQTT bridge — subscribes to all Xentient topics';

    public function handle(): void
    {
        $host = config('xentient.mqtt_host');
        $port = (int) config('xentient.mqtt_port');

        $this->info("Connecting to MQTT broker {$host}:{$port}...");

        $settings = (new ConnectionSettings())
            ->setKeepAliveInterval(60)
            ->setReconnectAutomatically(true)
            ->setConnectTimeout(10);

        $client = new MqttClient($host, $port, 'xentient-web-bridge');
        $client->connect($settings);

        $this->info('Connected. Subscribing to topics...');

        $client->subscribe('xentient/sensors/env', function (string $topic, string $message) {
            $this->handleSensorEnv($message);
        }, MqttClient::QOS_AT_LEAST_ONCE);

        $client->subscribe('xentient/sensors/motion', function (string $topic, string $message) {
            $this->handleSensorMotion($message);
        }, MqttClient::QOS_AT_LEAST_ONCE);

        $client->subscribe('xentient/pipeline/state', function (string $topic, string $message) {
            $this->handlePipelineState($message);
        }, MqttClient::QOS_AT_LEAST_ONCE);

        $client->subscribe('xentient/status/mode', function (string $topic, string $message) {
            $this->handleStatusMode($message);
        }, MqttClient::QOS_AT_LEAST_ONCE);

        $client->subscribe('xentient/session/complete', function (string $topic, string $message) {
            $this->handleSessionComplete($message);
        }, MqttClient::QOS_AT_LEAST_ONCE);

        $client->subscribe('xentient/session/error', function (string $topic, string $message) {
            $this->handleSessionError($message);
        }, MqttClient::QOS_AT_LEAST_ONCE);

        $this->info('Bridge running. Waiting for messages...');

        // E3: heartbeat row every 30s so the dashboard banner can detect a dead bridge
        $client->registerLoopEventHandler(function (MqttClient $client, float $elapsed) {
            static $lastHeartbeat = 0;
            if ($elapsed - $lastHeartbeat >= 30) {
                $lastHeartbeat = $elapsed;
                $node = DB::table('node_bases')->first();
                if ($node) {
                    DB::table('events')->insert([
                        'node_base_id' => $node->id,
                        'kind'         => 'bridge_heartbeat',
                        'payload_json' => json_encode(['ts' => now()->toISOString()]),
                        'occurred_at'  => now(),
                        'created_at'   => now(),
                    ]);
                }
            }
        });

        $client->loop(true);
    }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    private function handleSensorEnv(string $raw): void
    {
        $data = $this->validate($raw);
        if (!$data) return;

        $node = $this->resolveNode($data['nodeBaseId'] ?? 'node-01');

        // E8 + E13: resolve epoch-ms, clamp to now to guard against clock skew
        $recordedAtMs = min($this->resolveTimestampMs($data), (int) now()->valueOf());
        $recordedAt   = Carbon::createFromTimestampMs($recordedAtMs);

        DB::table('telemetry_samples')->insert([
            'node_base_id'    => $node->id,
            'peripheral_type' => 'bme280',
            'payload_json'    => json_encode($data['payload'] ?? $data),
            'recorded_at'     => $recordedAt,
            'created_at'      => now(),
        ]);

        DB::table('node_bases')->where('id', $node->id)
            ->update(['online_last_seen_at' => now()]);

        event(new \App\Events\TelemetryUpdated(
            nodeBaseId:     $node->mqtt_client_id,
            peripheralType: 'bme280',
            payload:        $data['payload'] ?? $data,
            recordedAtMs:   $recordedAtMs,
        ));

        Log::channel('mqtt')->debug('sensor/env stored', ['node' => $node->id]);
    }

    private function handleSensorMotion(string $raw): void
    {
        $data = $this->validate($raw);
        if (!$data) return;

        $node         = $this->resolveNode($data['nodeBaseId'] ?? 'node-01');
        $recordedAtMs = $this->resolveTimestampMs($data);

        DB::table('events')->insert([
            'node_base_id' => $node->id,
            'kind'         => 'motion',
            'payload_json' => json_encode($data),
            'occurred_at'  => Carbon::createFromTimestampMs($recordedAtMs),
            'created_at'   => now(),
        ]);

        DB::table('node_bases')->where('id', $node->id)
            ->update(['online_last_seen_at' => now()]);

        event(new \App\Events\TelemetryUpdated(
            nodeBaseId:     $node->mqtt_client_id,
            peripheralType: 'pir',
            payload:        $data,
            recordedAtMs:   $recordedAtMs,
        ));
    }

    private function handlePipelineState(string $raw): void
    {
        $data = $this->validate($raw);
        if (!$data) return;

        $node      = $this->resolveNode($data['nodeBaseId'] ?? 'node-01');
        $mqttSid   = $data['sessionId'] ?? null;

        // E15: create a stub session row on the first 'listening' state so that a
        // fatal session_error arriving before session_complete still has a row to
        // attach a banner to. Use mqtt_session_id for the lookup — NOT json_extract
        // on a column that doesn't exist in the schema.
        if ($mqttSid && ($data['state'] ?? '') === 'listening') {
            $exists = DB::table('xentient_sessions')
                ->where('mqtt_session_id', $mqttSid)
                ->exists();

            if (!$exists) {
                DB::table('xentient_sessions')->insert([
                    'mqtt_session_id' => $mqttSid,
                    'node_base_id'    => $node->id,
                    'space_id'        => $data['spaceId'] ?? 'living-room',
                    'started_at'      => now(),
                    'ended_at'        => null,
                    'mode_during'     => $data['mode'] ?? 'listen',
                    'status'          => 'running',
                    'created_at'      => now(),
                    'updated_at'      => now(),
                ]);
            }
        }

        event(new \App\Events\PipelineStateChanged($node->id, $data));
    }

    private function handleStatusMode(string $raw): void
    {
        $data = $this->validate($raw);
        if (!$data) return;

        $node = $this->resolveNode($data['nodeBaseId'] ?? 'node-01');

        DB::table('events')->insert([
            'node_base_id' => $node->id,
            'kind'         => 'mode_change',
            'payload_json' => json_encode($data),
            'occurred_at'  => now(),
            'created_at'   => now(),
        ]);

        event(new \App\Events\ModeChanged($node->id, $data['mode'] ?? 'listen'));
    }

    private function handleSessionComplete(string $raw): void
    {
        $data    = $this->validate($raw);
        if (!$data) return;

        $node    = $this->resolveNode($data['nodeBaseId'] ?? 'node-01');
        $mqttSid = $data['sessionId'] ?? null;

        // Look for the stub row created by handlePipelineState.
        // If it exists, update it in place instead of inserting a duplicate.
        $stub = $mqttSid
            ? DB::table('xentient_sessions')->where('mqtt_session_id', $mqttSid)->first()
            : null;

        $sessionData = [
            'node_base_id' => $node->id,
            'space_id'     => $data['spaceId']  ?? 'living-room',
            'started_at'   => Carbon::createFromTimestampMs($data['startedAt']),
            'ended_at'     => Carbon::createFromTimestampMs($data['endedAt']),
            'mode_during'  => $data['mode']     ?? 'listen',
            'status'       => $data['status']   ?? 'done',
            'updated_at'   => now(),
        ];

        if ($stub) {
            DB::table('xentient_sessions')
                ->where('id', $stub->id)
                ->update($sessionData);
            $sessionId = $stub->id;
        } else {
            $sessionId = DB::table('xentient_sessions')->insertGetId(
                array_merge($sessionData, [
                    'mqtt_session_id' => $mqttSid,
                    'created_at'      => now(),
                ])
            );
        }

        // Turns — apply resolveTimestampMs and C6 null-byte sanitization
        foreach ($data['turns'] ?? [] as $turn) {
            // C6: sanitize null bytes from STT output; drop turn if nothing remains
            $text = $this->sanitizeText($turn['text'] ?? '');
            if ($text === '') {
                Log::channel('mqtt')->warning('Dropped turn with empty/null-byte text', [
                    'sessionId' => $mqttSid,
                    'role'      => $turn['role'] ?? '?',
                ]);
                continue;
            }

            DB::table('turns')->insert([
                'session_id'  => $sessionId,
                'role'        => $turn['role'],
                'text'        => $text,
                'audio_path'  => null,
                // E8: guard against firmware sending seconds instead of ms
                'started_at'  => Carbon::createFromTimestampMs($this->resolveTimestampMs($turn)),
                'duration_ms' => $turn['durationMs'] ?? 0,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        }

        // Artifacts — paths are always relative per §3.3 contract
        $kindMap = [
            'userAudio'  => 'audio_user',
            'asstAudio'  => 'audio_asst',
            'transcript' => 'transcript',
            'meta'       => 'meta_json',
            'camera'     => 'camera_snapshot',
        ];

        foreach ($kindMap as $key => $kind) {
            if (!empty($data['artifacts'][$key])) {
                // E18: reject absolute paths (drive letter or leading slash)
                $path = $data['artifacts'][$key];
                if (preg_match('/^[A-Za-z]:[\\\\\/]/', $path) || str_starts_with($path, '/')) {
                    Log::channel('mqtt')->error('Rejected absolute artifact path', [
                        'path' => $path,
                        'kind' => $kind,
                    ]);
                    file_put_contents(
                        storage_path('logs/contract-drift.log'),
                        now()->toISOString() . " ABSOLUTE_PATH kind={$kind} path={$path}" . PHP_EOL,
                        FILE_APPEND
                    );
                    continue;
                }

                DB::table('artifacts')->insert([
                    'session_id' => $sessionId,
                    'kind'       => $kind,
                    'path'       => $path,
                    'bytes'      => 0,
                    'sha256'     => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        event(new \App\Events\SessionCompleted($node->id, $sessionId, $data));

        Log::channel('mqtt')->info('session/complete stored', ['sessionId' => $sessionId]);
    }

    private function handleSessionError(string $raw): void
    {
        $data = $this->validate($raw);
        if (!$data) return;

        $node = $this->resolveNode($data['nodeBaseId'] ?? 'node-01');

        DB::table('events')->insert([
            'node_base_id' => $node->id,
            'kind'         => 'session_error',
            'payload_json' => json_encode($data),
            'occurred_at'  => now(),
            'created_at'   => now(),
        ]);

        // SessionErrored now takes nodeMqttClientId so the Livewire card
        // can call modeSet() without a DB lookup.
        event(new \App\Events\SessionErrored($node->id, $node->mqtt_client_id, $data));
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * E8: MQTT payloads carry epoch-millis uint32, NOT seconds.
     * Values below 10_000_000_000 are almost certainly seconds
     * (that threshold is the year ~2286 in milliseconds).
     */
    private function resolveTimestampMs(array $payload): int
    {
        $raw = $payload['timestamp'] ?? $payload['startedAt'] ?? null;
        if ($raw === null) {
            return (int) now()->valueOf();
        }
        return $raw < 10_000_000_000 ? (int) ($raw * 1000) : (int) $raw;
    }

    /**
     * C6: Remove null bytes that STT occasionally injects.
     * Returns empty string if nothing remains after sanitization.
     */
    private function sanitizeText(string $text): string
    {
        return str_replace("\0", '', $text);
    }

    private function validate(string $raw): ?array
    {
        $data = json_decode($raw, true);

        if (!$data || !isset($data['v']) || $data['v'] !== 1 || !isset($data['type'])) {
            Log::channel('mqtt')->warning('Contract drift detected', ['raw' => $raw]);
            file_put_contents(
                storage_path('logs/contract-drift.log'),
                now()->toISOString() . ' ' . $raw . PHP_EOL,
                FILE_APPEND
            );
            return null;
        }

        return $data;
    }

    private function resolveNode(string $mqttClientId): object
    {
        $node = DB::table('node_bases')
            ->where('mqtt_client_id', $mqttClientId)
            ->first();

        if (!$node) {
            $id   = DB::table('node_bases')->insertGetId([
                'mqtt_client_id'      => $mqttClientId,
                'name'                => $mqttClientId,
                'online_last_seen_at' => now(),
                'created_at'          => now(),
                'updated_at'          => now(),
            ]);
            $node = DB::table('node_bases')->find($id);
        }

        return $node;
    }
}