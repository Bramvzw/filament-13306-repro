<?php

namespace App\Filament\Resources\Documents\RelationManagers;

use Filament\Actions\CreateAction;
use Filament\Forms\Components\FileUpload;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class AttachmentsRelationManager extends RelationManager
{
    protected static string $relationship = 'attachments';

    public function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                FileUpload::make('files')
                    ->multiple()
                    ->disk('public')
                    ->directory('attachments')
                    ->maxSize(200000),
            ]);
    }

    public function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('id'),
                TextColumn::make('created_at'),
            ])
            ->headerActions([
                CreateAction::make(),
            ]);
    }
}
