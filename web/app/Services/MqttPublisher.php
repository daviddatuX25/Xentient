<?php

namespace App\Services;

use PhpMqtt\Client\MqttClient;
use PhpMqtt\Client\ConnectionSettings;
use Illuminate\Support\Facades\Log;

class MqttPublisher
{
    private ?MqttClient $client = null;

    private function connect(): void
    {
        if ($this->client && $this->client->isConnected()) {
            return;
        }

        $host = config('xentient.mqtt_host');
        $port = (int) config('xentient.mqtt_port');

        $settings = (new ConnectionSettings())
            ->setKeepAliveInterval(60)
            ->setConnectTimeout(5)
            ->setReconnectAutomatically(true);

        $this->client = new MqttClient($host, $port, 'xentient-web-publisher');
        $this->client->connect($settings);

        Log::channel('mqtt')->info('MqttPublisher connected', [
            'host' => $host,
            'port' => $port,
        ]);
    }

    public function isConnected(): bool
    {
        return $this->client && $this->client->isConnected();
    }

    public function modeSet(string $nodeBaseId, string $mode): void
    {
        $allowed = ['sleep', 'listen', 'active', 'record'];

        if (!in_array($mode, $allowed)) {
            throw new \InvalidArgumentException("Invalid mode: {$mode}");
        }

        $payload = [
            'v'          => 1,
            'type'       => 'mode_set',
            'nodeBaseId' => $nodeBaseId,
            'mode'       => $mode,
        ];

        $this->publish('xentient/control/mode', $payload);
    }

    public function triggerPipeline(string $nodeBaseId): void
    {
        $payload = [
            'v'          => 1,
            'type'       => 'trigger_pipeline',
            'nodeBaseId' => $nodeBaseId,
            'source'     => 'web',
        ];

        $this->publish('xentient/control/trigger', $payload);
    }

    private function publish(string $topic, array $payload): void
    {
        $json = json_encode($payload);

        // E7: 3KB MQTT cap
        if (strlen($json) > 3072) {
            throw new \OverflowException("Payload exceeds 3KB MQTT cap on topic {$topic}");
        }

        try {
            $this->connect();
            $this->client->publish($topic, $json, MqttClient::QOS_AT_LEAST_ONCE);

            Log::channel('mqtt')->info('Published', [
                'topic'   => $topic,
                'payload' => $payload,
            ]);
        } catch (\Exception $e) {
            Log::channel('mqtt')->error('Publish failed', [
                'topic' => $topic,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}