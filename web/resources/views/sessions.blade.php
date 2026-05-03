<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Xentient — Sessions</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
</head>
<body class="bg-gray-100 min-h-screen p-8">

    <div class="max-w-3xl mx-auto space-y-6">

        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold text-gray-800">Sessions</h1>
            <a href="/" class="text-sm text-indigo-600 hover:underline">← Dashboard</a>
        </div>

        <livewire:session-feed />

    </div>

    @livewireScripts
</body>
</html>