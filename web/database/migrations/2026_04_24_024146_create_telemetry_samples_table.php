<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('telemetry_samples', function (Blueprint $table) {
            $table->id();
            $table->foreignId('node_base_id')->constrained()->cascadeOnDelete();
            $table->string('peripheral_type');   // e.g. bme280, pir
            $table->json('payload_json');
            $table->timestamp('recorded_at');    // clamped: min(payload.timestamp, now)
            // no updated_at — write-only ring buffer
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('telemetry_samples');
    }
};