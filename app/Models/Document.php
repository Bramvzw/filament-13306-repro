<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Document extends Model
{
    protected $fillable = ['name', 'attachments'];

    protected function casts(): array
    {
        return ['attachments' => 'array'];
    }

    public function attachments()
    {
        return $this->hasMany(Attachment::class);
    }
}
