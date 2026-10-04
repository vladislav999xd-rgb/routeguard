<?php
declare(strict_types=1);

// Скопируйте файл как config.php и задайте два длинных случайных токена.
// До установки реквизиты БД можно оставить пустыми: установщик заполнит их после проверки.
return [
    'app_name' => 'Маршруты пациентов',
    'base_url' => '', // Например: '' для корня или '/routeguard' для подпапки.
    'timezone' => 'Asia/Yekaterinburg',
    'installed' => false,
    'install_token' => 'ЗАМЕНИТЕ_НА_СЛУЧАЙНУЮ_СТРОКУ_НЕ_КОРОЧЕ_24_СИМВОЛОВ',
    'maintenance_token' => 'ДРУГАЯ_СЛУЧАЙНАЯ_СТРОКА_НЕ_КОРОЧЕ_24_СИМВОЛОВ',
    'db' => [
        'host' => '',
        'port' => 3306,
        'name' => '',
        'user' => '',
        'password' => '',
        'prefix' => 'rg_',
    ],
    'demo_ttl_days' => 7,
    'demo_limit' => 1000,
];
