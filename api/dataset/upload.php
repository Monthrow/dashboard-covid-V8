<?php
// Load hasil ETL ke MySQL, dikirim bertahap:
//   action=begin  → siapkan dataset aktif + catat riwayat
//   action=chunk  → validasi ulang & simpan sebagian baris (transaksi per bagian)
//   action=finish → cek jumlah baris; jika gagal, semua baris proses ini dihapus (rollback)
require __DIR__ . '/../lib/bootstrap.php';
allow_methods('POST');

$in = read_json();
$pdo = db();
$action = (string) ($in['action'] ?? '');

function load_history(PDO $pdo, int $loadId): array
{
    $st = $pdo->prepare('SELECT * FROM etl_load_history WHERE id = ? FOR UPDATE');
    $st->execute([$loadId]);
    $h = $st->fetch();
    if (!$h || $h['source'] !== 'etl') {
        throw new ApiException(404, 'Proses Load tidak ditemukan.');
    }
    return $h;
}

function rollback_load(PDO $pdo, array $h, string $message): void
{
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM covid_records WHERE load_id = ?')->execute([$h['id']]);
    $pdo->prepare("UPDATE etl_load_history SET status = 'failed', rows_loaded = 0, message = ?, finished_at = NOW() WHERE id = ?")
        ->execute([mb_substr($message, 0, 2000), $h['id']]);
    if ($h['dataset_id'] !== null) {
        refresh_dataset_stats($pdo, (int) $h['dataset_id']);
        // A dataset created by this failed load (still empty) is removed again.
        $pdo->prepare('DELETE FROM dataset_metadata WHERE id = ? AND row_count = 0')->execute([$h['dataset_id']]);
    }
    $pdo->commit();
}

if ($action === 'begin') {
    $name = trim((string) ($in['file_name'] ?? ''));
    $hash = (string) ($in['file_hash'] ?? '');
    if ($name === '' || mb_strlen($name) > 255) {
        throw new ApiException(422, 'Nama file tidak valid.');
    }
    if (!preg_match('/^[a-f0-9]{64}$/', $hash)) {
        throw new ApiException(422, 'Hash file tidak valid.');
    }
    $num = fn(string $k) => max(0, (int) ($in[$k] ?? 0));
    $date = fn(string $k) => (isset($in[$k]) && normalize_date($in[$k])) ? normalize_date($in[$k]) : null;
    $summary = isset($in['summary']) ? json_encode($in['summary'], JSON_UNESCAPED_UNICODE) : null;

    $pdo->beginTransaction();
    $ds = active_dataset($pdo, true);
    $insertHistory = $pdo->prepare('INSERT INTO etl_load_history
        (dataset_id, source, file_name, file_hash, file_size, status, rows_read, rows_valid, rows_invalid, duplicates_removed, column_count, period_start, period_end, summary, message, finished_at)
        VALUES (?, \'etl\', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

    if ($ds && $ds['file_hash'] === $hash) {
        $msg = 'Dataset yang sama sudah aktif — tidak dimuat ulang agar tidak terjadi duplikasi.';
        $insertHistory->execute([$ds['id'], $name, $hash, $num('file_size'), 'skipped', $num('rows_read'), $num('rows_valid'), $num('rows_invalid'), $num('duplicates_removed'), $num('column_count'), $date('period_start'), $date('period_end'), $summary, $msg, date('Y-m-d H:i:s')]);
        $id = (int) $pdo->lastInsertId();
        $pdo->commit();
        $h = $pdo->query('SELECT * FROM etl_load_history WHERE id = ' . $id)->fetch();
        ok(['status' => 'skipped', 'run' => history_to_run($h), 'message' => 'Dataset ini sudah dimuat dan sedang dipakai dashboard. Tidak ada data yang diduplikasi.']);
    }

    if (!$ds) {
        // Belum ada dataset aktif → buat satu. Jika sudah ada, baris baru digabung ke dataset aktif.
        $pdo->prepare("INSERT INTO dataset_metadata (dataset_name, source_file, file_hash, file_size, column_count, status) VALUES (?, ?, ?, ?, ?, 'active')")
            ->execute(['COVID-19 Indonesia', $name, $hash, $num('file_size'), count(covid_fields())]);
        $datasetId = (int) $pdo->lastInsertId();
    } else {
        $datasetId = (int) $ds['id'];
    }
    $insertHistory->execute([$datasetId, $name, $hash, $num('file_size'), 'loading', $num('rows_read'), $num('rows_valid'), $num('rows_invalid'), $num('duplicates_removed'), $num('column_count'), $date('period_start'), $date('period_end'), $summary, null, null]);
    $loadId = (int) $pdo->lastInsertId();
    $pdo->commit();
    ok(['status' => 'loading', 'load_id' => $loadId, 'dataset_id' => $datasetId, 'merged' => (bool) $ds]);
}

if ($action === 'chunk') {
    $loadId = (int) ($in['load_id'] ?? 0);
    $rows = $in['rows'] ?? null;
    if (!is_array($rows) || count($rows) === 0 || count($rows) > 5000) {
        throw new ApiException(422, 'Kirim 1–5000 baris per bagian.');
    }
    $offset = max(0, (int) ($in['offset'] ?? 0));
    $res = validate_rows($rows, columns_for_etl());
    if ($res['errors']) {
        foreach ($res['errors'] as &$e) {
            $e['row'] += $offset;
        }
        throw new ApiException(422, 'Validasi backend gagal: ' . errors_summary($res['errors']), ['errors' => array_slice($res['errors'], 0, 50)]);
    }
    $pdo->beginTransaction();
    try {
        $h = load_history($pdo, $loadId);
        if ($h['status'] !== 'loading') {
            throw new ApiException(409, 'Proses Load ini sudah selesai.');
        }
        $c = insert_rows($pdo, (int) $h['dataset_id'], $loadId, $res['rows'], true);
        $pdo->prepare('UPDATE etl_load_history SET rows_loaded = rows_loaded + ?, rows_existing = rows_existing + ? WHERE id = ?')
            ->execute([$c['inserted'], $c['existing'], $loadId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    ok($c);
}

if ($action === 'finish') {
    $loadId = (int) ($in['load_id'] ?? 0);
    $success = ($in['success'] ?? false) === true;
    $expected = (int) ($in['expected_rows'] ?? -1);
    $pdo->beginTransaction();
    $h = load_history($pdo, $loadId);
    $pdo->commit();
    if ($h['status'] !== 'loading') {
        throw new ApiException(409, 'Proses Load ini sudah selesai.');
    }
    if (!$success) {
        rollback_load($pdo, $h, (string) ($in['message'] ?? 'Load dibatalkan.'));
        ok(['status' => 'failed', 'message' => 'Load dibatalkan — tidak ada data yang tersimpan sebagian.']);
    }
    $st = $pdo->prepare('SELECT COUNT(*) FROM covid_records WHERE load_id = ?');
    $st->execute([$loadId]);
    $stored = (int) $st->fetchColumn();
    $accounted = (int) $h['rows_loaded'] + (int) $h['rows_existing'];
    if ($stored !== (int) $h['rows_loaded'] || ($expected >= 0 && $accounted !== $expected)) {
        $msg = "Jumlah data tidak sesuai (tersimpan $stored, diharapkan $expected). Load dibatalkan.";
        rollback_load($pdo, $h, $msg);
        throw new ApiException(500, $msg);
    }
    $pdo->beginTransaction();
    $status = $stored > 0 ? 'success' : 'skipped';
    $existing = (int) $h['rows_existing'];
    $msg = $stored > 0
        ? number_format($stored, 0, ',', '.') . ' baris baru disimpan ke MySQL' . ($existing ? ' · ' . number_format($existing, 0, ',', '.') . ' baris sudah ada (dilewati, tidak ditimpa)' : '') . '.'
        : 'Semua baris sudah ada di dataset aktif — tidak ada data yang diduplikasi.';
    $pdo->prepare('UPDATE etl_load_history SET status = ?, message = ?, finished_at = NOW() WHERE id = ?')->execute([$status, $msg, $loadId]);
    if ($stored > 0) {
        $pdo->prepare('UPDATE dataset_metadata SET source_file = ?, file_hash = ?, file_size = ? WHERE id = ?')
            ->execute([$h['file_name'], $h['file_hash'], $h['file_size'], $h['dataset_id']]);
    }
    refresh_dataset_stats($pdo, (int) $h['dataset_id']);
    $pdo->commit();
    $h = $pdo->query('SELECT * FROM etl_load_history WHERE id = ' . $loadId)->fetch();
    $ds = active_dataset($pdo);
    ok(['status' => $status, 'run' => $ds ? dataset_to_run($ds) : history_to_run($h), 'history' => history_to_run($h), 'message' => $msg]);
}

throw new ApiException(400, 'Parameter action harus begin, chunk, atau finish.');
