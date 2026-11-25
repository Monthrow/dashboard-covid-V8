<?php
// Dipanggil di awal setiap endpoint: CORS, respons JSON, penanganan error, koneksi PDO.
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);
mb_internal_encoding('UTF-8');

function send_cors(): void
{
    $cfg = require __DIR__ . '/../config/cors.php';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && in_array($origin, $cfg['allowed_origins'], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 600');
        // Chrome: izin halaman publik memanggil server lokal (Private/Local Network Access).
        if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_PRIVATE_NETWORK'])) {
            header('Access-Control-Allow-Private-Network: true');
        }
    }
}

function json_out(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function ok(array $data = [], int $status = 200): void
{
    json_out($status, ['ok' => true, 'data' => $data]);
}

function fail(int $status, string $message, array $extra = []): void
{
    json_out($status, ['ok' => false, 'error' => $message] + $extra);
}

final class ApiException extends RuntimeException
{
    public function __construct(public int $status, string $message, public array $extra = [])
    {
        parent::__construct($message);
    }
}

set_exception_handler(function (Throwable $e): void {
    if ($e instanceof ApiException) {
        fail($e->status, $e->getMessage(), $e->extra);
    }
    error_log('[covid-api] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if ($e instanceof PDOException) {
        fail(500, 'Gagal menyimpan/membaca database. Perubahan dibatalkan.');
    }
    fail(500, 'Terjadi kesalahan pada server.');
});

/** Allowed HTTP methods for the endpoint; answers CORS preflight. */
function allow_methods(string ...$methods): string
{
    send_cors();
    $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($m === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if (!in_array($m, $methods, true)) {
        fail(405, 'Metode tidak diizinkan.');
    }
    return $m;
}

function read_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        throw new ApiException(400, 'Body permintaan kosong.');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new ApiException(400, 'Body permintaan harus JSON yang valid.');
    }
    return $data;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $c = require __DIR__ . '/../config/database.php';
    $dsn = $c['socket']
        ? "mysql:unix_socket={$c['socket']};dbname={$c['database']};charset=utf8mb4"
        : "mysql:host={$c['host']};port={$c['port']};dbname={$c['database']};charset=utf8mb4";
    try {
        $pdo = new PDO($dsn, $c['username'], $c['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
    } catch (PDOException $e) {
        error_log('[covid-api] koneksi gagal: ' . $e->getMessage());
        throw new ApiException(503, 'Tidak dapat terhubung ke MySQL. Pastikan MySQL di XAMPP aktif dan database db_covid_indonesia sudah diimpor.');
    }
    return $pdo;
}

require_once __DIR__ . '/columns.php';
require_once __DIR__ . '/validator.php';
require_once __DIR__ . '/records.php';
