<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SlowDownLivewireUploads
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->is('livewire/upload-file')) {
            $contentLength = (int) $request->header('Content-Length', 0);
            $seconds = $contentLength > 1_000_000 ? 12 : 3;
            sleep($seconds);
        }

        return $next($request);
    }
}
