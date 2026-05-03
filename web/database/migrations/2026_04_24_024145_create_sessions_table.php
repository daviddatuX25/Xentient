<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('xentient_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('mqtt_session_id', 26)->nullable()->unique();
            $table->foreignId('node_base_id')->constrained()->cascadeOnDelete();
            $table->string('space_id');
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->string('mode_during');
            $table->enum('status', ['running', 'done', 'error'])->default('running');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('xentient_sessions');
    }
};