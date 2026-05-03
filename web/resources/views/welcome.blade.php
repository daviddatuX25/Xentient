<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Xentient — Dashboard</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
</head>
<body class="bg-gray-100 min-h-screen p-8">

    <div class="max-w-4xl mx-auto space-y-6">

        <h1 class="text-2xl font-bold text-gray-800">Xentient Dashboard</h1>

        {{-- One card per node base --}}
        @foreach(DB::table('node_bases')->get() as $node)
            <livewire:node-base-card :nodeBaseId="$node->id" :key="$node->id" />
        @endforeach

    </div>

    @livewireScripts
</body>
</html>