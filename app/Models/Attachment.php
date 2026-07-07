<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Attachment extends Model
{
    protected $fillable = ['document_id', 'files'];

    protected function casts(): array
    {
        return ['files' => 'array'];
    }

    public function document()
    {
        return $this->belongsTo(Document::class);
    }
    //
}
