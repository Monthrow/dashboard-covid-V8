<?php
// Metadata dataset aktif, struktur kolom (untuk modal Tambah Data) dan riwayat Load.
require __DIR__ . '/../lib/bootstrap.php';
allow_methods('GET');

$pdo = db();
$ds = active_dataset($pdo);
$limit = min(100, max(1, (int) ($_GET['history'] ?? 15)));
$history = $pdo->query("SELECT * FROM etl_load_history ORDER BY created_at DESC, id DESC LIMIT $limit")->fetchAll();
$activeId = $ds ? (int) $ds['id'] : null;
ok([
    'dataset' => $ds ? dataset_to_run($ds) : null,
    'metadata' => $ds,
    'columns' => columns_for_dataset($pdo, $activeId),
    'history' => array_map('history_to_run', $history),
]);
