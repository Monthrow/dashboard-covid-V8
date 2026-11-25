<?php
// Koneksi MySQL XAMPP. Ubah nilai di bawah jika MySQL Anda memakai password.
// File ini hanya dibaca di server — password tidak pernah dikirim ke browser.
return [
    'host'     => getenv('DB_HOST') ?: 'localhost',
    'port'     => (int) (getenv('DB_PORT') ?: 3306),
    'database' => getenv('DB_NAME') ?: 'db_covid_indonesia',
    'username' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASS') !== false ? getenv('DB_PASS') : '',
    'socket'   => getenv('DB_SOCKET') ?: null,
];
