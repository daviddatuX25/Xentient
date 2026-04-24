<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use App\Services\MqttPublisher;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Bind the MqttPublisher as a singleton
        $this->app->singleton(MqttPublisher::class, function ($app) {
            return new MqttPublisher();
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}