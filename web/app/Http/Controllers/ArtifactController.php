<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ArtifactController extends Controller
{
    private array $allowedKinds = [
        'audio_user',
        'audio_asst',
        'transcript',
        'meta_json',
        'camera_snapshot',
    ];

    public function serve(Request $request, int $sessionId, string $kind): StreamedResponse|\Illuminate\Http\Response
    {
        // Validate kind
        if (!in_array($kind, $this->allowedKinds)) {
            abort(404, 'Invalid artifact kind');
        }

        // Find artifact row
        $artifact = DB::table('artifacts')
            ->where('session_id', $sessionId)
            ->where('kind', $kind)
            ->first();

        if (!$artifact) {
            abort(404, 'Artifact not found');
        }

        // Resolve absolute path (E18: never store absolute paths)
        $basePath = rtrim(config('xentient.artifacts_path'), DIRECTORY_SEPARATOR);
        $fullPath = $basePath . DIRECTORY_SEPARATOR . ltrim($artifact->path, '/\\');

        // E5: check file exists
        if (!file_exists($fullPath)) {
            abort(404, 'Artifact file missing');
        }

        $mimeMap = [
            'audio_user'      => 'audio/wav',
            'audio_asst'      => 'audio/wav',
            'transcript'      => 'text/plain',
            'meta_json'       => 'application/json',
            'camera_snapshot' => 'image/jpeg',
        ];

        $mime     = $mimeMap[$kind];
        $fileSize = filesize($fullPath);

        // E19: Range requests for iOS Safari
        $start = 0;
        $end   = $fileSize - 1;

        if ($request->hasHeader('Range')) {
            preg_match('/bytes=(\d+)-(\d*)/', $request->header('Range'), $matches);
            $start = (int) $matches[1];
            $end   = !empty($matches[2]) ? (int) $matches[2] : $fileSize - 1;

            return response()->stream(function () use ($fullPath, $start, $end) {
                $fp = fopen($fullPath, 'rb');
                fseek($fp, $start);
                $remaining = $end - $start + 1;
                while ($remaining > 0 && !feof($fp)) {
                    $chunk      = fread($fp, min(8192, $remaining));
                    $remaining -= strlen($chunk);
                    echo $chunk;
                }
                fclose($fp);
            }, 206, [
                'Content-Type'   => $mime,
                'Content-Range'  => "bytes {$start}-{$end}/{$fileSize}",
                'Content-Length' => $end - $start + 1,
                'Accept-Ranges'  => 'bytes',
            ]);
        }

        return response()->stream(function () use ($fullPath) {
            readfile($fullPath);
        }, 200, [
            'Content-Type'   => $mime,
            'Content-Length' => $fileSize,
            'Accept-Ranges'  => 'bytes',
        ]);
    }
}