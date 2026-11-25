<?php
// Akses data: dataset aktif, simpan baris, riwayat Load.
declare(strict_types=1);

const CATEGORY_FIELDS_FROM_DB = ['location', 'province', 'country', 'continent', 'island', 'time_zone', 'special_status'];

function active_dataset(PDO $pdo, bool $forUpdate = false): ?array
{
    $sql = "SELECT * FROM dataset_metadata WHERE status = 'active' ORDER BY updated_at DESC, id DESC LIMIT 1" . ($forUpdate ? ' FOR UPDATE' : '');
    $row = $pdo->query($sql)->fetch();
    return $row ?: null;
}

function require_active_dataset(PDO $pdo, bool $forUpdate = false): array
{
    $ds = active_dataset($pdo, $forUpdate);
    if (!$ds) {
        throw new ApiException(409, 'Belum ada dataset aktif. Muat file Excel lewat halaman ETL terlebih dahulu.');
    }
    return $ds;
}

/** Column definitions with category values extended by values already stored in the dataset. */
function columns_for_dataset(PDO $pdo, ?int $datasetId): array
{
    $defs = covid_columns();
    if ($datasetId === null) {
        return $defs;
    }
    foreach ($defs as &$d) {
        if (!in_array($d['field'], CATEGORY_FIELDS_FROM_DB, true) && $d['field'] !== 'city_or_regency') {
            continue;
        }
        $col = $d['field']; // whitelisted column name from columns.json
        $st = $pdo->prepare("SELECT DISTINCT `$col` AS v FROM covid_records WHERE dataset_id = ? AND `$col` IS NOT NULL ORDER BY v");
        $st->execute([$datasetId]);
        $vals = array_merge($d['values'] ?? [], array_map('strval', $st->fetchAll(PDO::FETCH_COLUMN)));
        $uniq = [];
        foreach ($vals as $v) {
            $uniq[mb_strtolower($v)] ??= $v;
        }
        $d['values'] = array_values($uniq);
    }
    return $defs;
}

/** ETL rows come from a whole file: keep type/required/range checks, accept the file's own category values. */
function columns_for_etl(): array
{
    return array_map(function (array $d) {
        if ($d['kind'] === 'category' && $d['field'] !== 'location_level') {
            $d['kind'] = 'text';
        }
        unset($d['titleCase']);
        return $d;
    }, covid_columns());
}

/** Identity keys (row_key) among $keys that already exist in the dataset. */
function existing_row_keys(PDO $pdo, int $datasetId, array $keys): array
{
    $found = [];
    foreach (array_chunk(array_values(array_unique($keys)), 500) as $chunk) {
        $in = implode(',', array_fill(0, count($chunk), '?'));
        $st = $pdo->prepare("SELECT row_key FROM covid_records WHERE dataset_id = ? AND row_key IN ($in)");
        $st->execute(array_merge([$datasetId], $chunk));
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $k) {
            $found[$k] = true;
        }
    }
    return $found;
}

function insert_statement(PDO $pdo, bool $skipExisting): PDOStatement
{
    $fields = covid_fields();
    $cols = implode(', ', array_map(fn($f) => "`$f`", array_merge(['dataset_id', 'load_id', 'row_key'], $fields)));
    $ph = implode(', ', array_fill(0, count($fields) + 3, '?'));
    $sql = "INSERT INTO covid_records ($cols) VALUES ($ph)";
    if ($skipExisting) {
        $sql .= ' ON DUPLICATE KEY UPDATE id = id';
    }
    return $pdo->prepare($sql);
}

/**
 * Insert validated rows. With $skipExisting, rows already in the dataset are skipped (not overwritten).
 * @return array{inserted: int, existing: int}
 */
function insert_rows(PDO $pdo, int $datasetId, ?int $loadId, array $rows, bool $skipExisting): array
{
    $st = insert_statement($pdo, $skipExisting);
    $fields = covid_fields();
    $inserted = 0;
    $existing = 0;
    foreach ($rows as $r) {
        $params = [$datasetId, $loadId, row_key($r)];
        foreach ($fields as $f) {
            $params[] = $r[$f] ?? null;
        }
        $st->execute($params);
        $st->rowCount() === 1 ? $inserted++ : $existing++;
    }
    return ['inserted' => $inserted, 'existing' => $existing];
}

function refresh_dataset_stats(PDO $pdo, int $datasetId): void
{
    $st = $pdo->prepare('UPDATE dataset_metadata d
        JOIN (SELECT COUNT(*) c, MIN(record_date) mn, MAX(record_date) mx FROM covid_records WHERE dataset_id = ?) s
        SET d.row_count = s.c, d.period_start = s.mn, d.period_end = s.mx, d.updated_at = NOW()
        WHERE d.id = ?');
    $st->execute([$datasetId, $datasetId]);
}

/** Shape used by the frontend (EtlRun). */
function history_to_run(array $h): array
{
    return [
        'id' => (string) $h['id'],
        'dataset_id' => $h['dataset_id'] !== null ? (int) $h['dataset_id'] : null,
        'source' => $h['source'],
        'file_name' => $h['file_name'],
        'file_hash' => $h['file_hash'] ?? '',
        'file_size' => (int) ($h['file_size'] ?? 0),
        'status' => $h['status'],
        'rows_read' => (int) $h['rows_read'],
        'rows_valid' => (int) $h['rows_valid'],
        'rows_invalid' => (int) $h['rows_invalid'],
        'duplicates_removed' => (int) $h['duplicates_removed'],
        'rows_existing' => (int) $h['rows_existing'],
        'rows_loaded' => (int) $h['rows_loaded'],
        'column_count' => (int) $h['column_count'],
        'period_start' => $h['period_start'],
        'period_end' => $h['period_end'],
        'summary' => null,
        'message' => $h['message'],
        'is_active' => false,
        'created_at' => str_replace(' ', 'T', (string) $h['created_at']),
        'finished_at' => $h['finished_at'] ? str_replace(' ', 'T', (string) $h['finished_at']) : null,
    ];
}

/** The active dataset presented as the run the dashboard reads from. */
function dataset_to_run(array $d): array
{
    return [
        'id' => 'dataset-' . $d['id'],
        'dataset_id' => (int) $d['id'],
        'dataset_name' => $d['dataset_name'],
        'source' => 'dataset',
        'file_name' => $d['source_file'],
        'file_hash' => $d['file_hash'] ?? '',
        'file_size' => (int) ($d['file_size'] ?? 0),
        'status' => 'success',
        'rows_read' => (int) $d['row_count'],
        'rows_valid' => (int) $d['row_count'],
        'rows_invalid' => 0,
        'duplicates_removed' => 0,
        'rows_existing' => 0,
        'rows_loaded' => (int) $d['row_count'],
        'column_count' => (int) $d['column_count'],
        'period_start' => $d['period_start'],
        'period_end' => $d['period_end'],
        'summary' => null,
        'message' => null,
        'is_active' => true,
        'created_at' => str_replace(' ', 'T', (string) $d['uploaded_at']),
        'finished_at' => str_replace(' ', 'T', (string) $d['updated_at']),
    ];
}

function errors_summary(array $errors, int $max = 5): string
{
    $parts = array_map(fn($e) => "baris {$e['row']} kolom {$e['header']}: {$e['message']}", array_slice($errors, 0, $max));
    return implode('; ', $parts) . (count($errors) > $max ? ' …' : '');
}
