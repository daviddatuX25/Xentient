<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('node_base_id')->constrained()->cascadeOnDelete();
            $table->string('kind');          // e.g. pir, mode_change, bridge_heartbeat, error
            $table->json('payload_json');
            $table->timestamp('occurred_at');
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('events');
    }
};