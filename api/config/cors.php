<?php
// Alamat frontend yang boleh memanggil API ini.
return [
    'allowed_origins' => [
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        // Pratinjau Lovable (browser di komputer Anda memanggil XAMPP lokal)
        'https://id-preview--2fba197a-a34d-4847-b82a-67bc647a64d6.lovable.app',
        'https://project--2fba197a-a34d-4847-b82a-67bc647a64d6-dev.lovable.app',
    ],
];
