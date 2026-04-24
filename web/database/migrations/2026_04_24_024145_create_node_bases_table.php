<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('node_bases', function (Blueprint $table) {
            $table->id();
            $table->string('mqtt_client_id')->unique();
            $table->string('name');
            $table->timestamp('online_last_seen_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('node_bases');
    }
};