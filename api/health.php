<?php
// Cek koneksi PHP → MySQL. Buka di browser: http://localhost/dashboard-covid/api/health.php
require __DIR__ . '/lib/bootstrap.php';
allow_methods('GET');

$pdo = db();
$version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
$tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
$missing = array_values(array_diff(['covid_records', 'dataset_metadata', 'etl_load_history'], $tables));
if ($missing) {
    fail(503, 'Database terhubung, tetapi tabel belum lengkap: ' . implode(', ', $missing) . '. Impor database/db_covid_indonesia.sql lewat phpMyAdmin.');
}
$ds = active_dataset($pdo);
ok([
    'php' => PHP_VERSION,
    'mysql' => $version,
    'database' => (string) $pdo->query('SELECT DATABASE()')->fetchColumn(),
    'active_dataset' => $ds ? dataset_to_run($ds) : null,
]);
