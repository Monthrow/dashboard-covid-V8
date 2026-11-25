<?php
// Struktur kolom dataset — dibaca dari config/columns.json (dipakai juga oleh frontend).
declare(strict_types=1);

function covid_columns(): array
{
    static $cols = null;
    if ($cols === null) {
        $cols = json_decode((string) file_get_contents(__DIR__ . '/../config/columns.json'), true);
        if (!is_array($cols)) {
            throw new RuntimeException('config/columns.json tidak valid');
        }
    }
    return $cols;
}

function covid_fields(): array
{
    return array_column(covid_columns(), 'field');
}
