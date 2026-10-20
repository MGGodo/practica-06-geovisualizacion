<?php
class Database {
    private static $pdo = null;

    public static function getConnection() {
        if (self::$pdo === null) {
            $host = '127.0.0.1';
            $db   = 'practica05_bioinformatica';
            $user = 'root';
            $pass = ''; // En XAMPP por defecto es vacío
            $charset = 'utf8mb4';

            $dsn = "mysql:host=$host;dbname=$db;charset=$charset";
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false, // Protección estricta contra SQL Injection
            ];

            try {
                self::$pdo = new PDO($dsn, $user, $pass, $options);
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
}