<?php
class Database {
    private static $pdo = null;
    private static $fallo = false;

    public static function config() {
        static $cfg = null;
        if ($cfg === null) {
            $archivo = file_exists(__DIR__ . '/config.php') ? __DIR__ . '/config.php' : __DIR__ . '/config.example.php';
            $cfg = require $archivo;
        }
        return $cfg;
    }

    private static function conectar() {
        $db = self::config()['db'];
        $dsn = "mysql:host={$db['host']};dbname={$db['nombre']};charset={$db['charset']}";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false, // Protección estricta contra SQL Injection
        ];
        return new PDO($dsn, $db['usuario'], $db['clave'], $options);
    }

    public static function getConnection() {
        if (self::$pdo === null) {
            try {
                self::$pdo = self::conectar();
            } catch (PDOException $e) {
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode([
                    'error' => 'Error de conexión a MySQL. Verifica que MySQL esté activo en XAMPP y hayas importado schema.sql.',
                    'detalle' => $e->getMessage()
                ]);
                exit;
            }
        }
        return self::$pdo;
    }

    /** Conexión no fatal: el proxy geoespacial sigue funcionando (sin caché) si MySQL no está disponible. */
    public static function tryConnection() {
        if (self::$pdo !== null) return self::$pdo;
        if (self::$fallo) return null;
        try {
            self::$pdo = self::conectar();
        } catch (PDOException $e) {
            self::$fallo = true;
            return null;
        }
        return self::$pdo;
    }
}
