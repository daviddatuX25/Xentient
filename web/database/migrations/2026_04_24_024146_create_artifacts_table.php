<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('artifacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained()->cascadeOnDelete();
            $table->enum('kind', [
                'audio_user',
                'audio_asst',
                'transcript',
                'meta_json',
                'camera_snapshot',
            ]);
            $table->string('path');          // relative to $XENTIENT_ARTIFACTS_PATH
            $table->unsignedBigInteger('bytes')->default(0);
            $table->string('sha256')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('artifacts');
    }
};