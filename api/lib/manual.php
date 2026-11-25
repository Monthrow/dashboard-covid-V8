<?php
// Penyimpanan baris dari modal "Tambah Data" (satu atau banyak baris, semua-atau-tidak-sama-sekali).
declare(strict_types=1);

/** Validate rows against the active dataset; returns [rows, errors, dataset]. Duplicates (in batch or DB) are errors. */
function check_manual_rows(PDO $pdo, array $input, array $ds): array
{
    $res = validate_rows($input, columns_for_dataset($pdo, (int) $ds['id']));
    $rows = $res['rows'];
    $errors = $res['errors'];
    if ($rows) {
        $keys = [];
        foreach ($rows as $no => $r) {
            $keys[$no] = row_key($r);
        }
        $found = existing_row_keys($pdo, (int) $ds['id'], array_values($keys));
        foreach ($keys as $no => $k) {
            if (isset($found[$k])) {
                $errors[] = ['row' => $no, 'field' => 'record_date', 'header' => 'Date', 'message' => 'data dengan tanggal, lokasi, dan kota yang sama sudah ada di database', 'hint' => 'Data lama tidak ditimpa — ubah tanggal/lokasi/kota atau hapus baris ini'];
            }
        }
    }
    usort($errors, fn($a, $b) => $a['row'] <=> $b['row']);
    return [$rows, $errors];
}

function save_manual_rows(PDO $pdo, array $input): array
{
    if (count($input) === 0 || count($input) > 1000) {
        throw new ApiException(422, 'Kirim 1–1000 baris.');
    }
    $pdo->beginTransaction();
    try {
        $ds = require_active_dataset($pdo, true);
        [$rows, $errors] = check_manual_rows($pdo, $input, $ds);
        if ($errors) {
            throw new ApiException(422, 'Validasi backend gagal: ' . errors_summary($errors), ['errors' => $errors]);
        }
        $pdo->prepare("INSERT INTO etl_load_history (dataset_id, source, file_name, status, rows_read, rows_valid, column_count) VALUES (?, 'manual', 'Tambah Data (input manual)', 'loading', ?, ?, ?)")
            ->execute([$ds['id'], count($input), count($rows), count(covid_fields())]);
        $loadId = (int) $pdo->lastInsertId();
        $c = insert_rows($pdo, (int) $ds['id'], $loadId, $rows, false);
        if ($c['inserted'] !== count($input)) {
            throw new ApiException(500, 'Jumlah baris tersimpan tidak sesuai. Penyimpanan dibatalkan.');
        }
        $msg = $c['inserted'] . ' baris ditambahkan lewat Tambah Data.';
        $dates = array_column($rows, 'record_date');
        $pdo->prepare("UPDATE etl_load_history SET status = 'success', rows_loaded = ?, period_start = ?, period_end = ?, message = ?, finished_at = NOW() WHERE id = ?")
            ->execute([$c['inserted'], min($dates), max($dates), $msg, $loadId]);
        refresh_dataset_stats($pdo, (int) $ds['id']);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($e instanceof PDOException && ($e->errorInfo[1] ?? 0) === 1062) {
            throw new ApiException(409, 'Ada data duplikat — penyimpanan dibatalkan, tidak ada data yang tersimpan.');
        }
        throw $e;
    }
    $ds = active_dataset($pdo);
    return ['inserted' => $c['inserted'], 'message' => $msg, 'dataset' => $ds ? dataset_to_run($ds) : null];
}
