<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ArtifactController;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/artifacts/{session}/{kind}', [ArtifactController::class, 'serve'])
    ->name('artifacts.serve');

Route::get('/sessions', function () {
    return view('sessions');
});

Route::get('/telemetry', function () {
    return view('telemetry');
});