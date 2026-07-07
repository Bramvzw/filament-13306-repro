<?php

namespace App\Filament\Resources\Documents\Schemas;

use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class DocumentForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name'),
                FileUpload::make('attachments')
                    ->multiple()
                    ->disk('public')
                    ->directory('attachments')
                    ->maxSize(200000),
            ]);
    }
}
