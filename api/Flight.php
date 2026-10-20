<?php
/**
 * Micro-núcleo compatible con FlightPHP para ejecución directa en XAMPP
 * Soporta sintaxis oficial: Flight::route(), Flight::json(), Flight::request(), Flight::start()
 */
class FlightRequest {
    public $data;
    public $query;
    public function __construct() {
        $raw = file_get_contents('php://input');
        $decoded = json_decode($raw, true);
        $this->data = is_array($decoded) ? (object)$decoded : (object)$_POST;
        $this->query = (object)$_GET;
    }
    public function getBody() {
        return file_get_contents('php://input');
    }
}

class Flight {
    private static $routes = [];
    private static $requestInstance = null;

    public static function route($pattern, $callback) {
        self::$routes[] = ['pattern' => $pattern, 'callback' => $callback];
    }

    public static function request() {
        if (!self::$requestInstance) {
            self::$requestInstance = new FlightRequest();
        }
        return self::$requestInstance;
    }

    public static function json($data, $code = 200) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function start() {
        $method = $_SERVER['REQUEST_METHOD'];
        if ($method === 'OPTIONS') {
            http_response_code(200);
            exit;
        }

        // Obtiene la ruta desde ?route=/... o desde PATH_INFO / REQUEST_URI
        $uri = '/';
        if (!empty($_GET['route'])) {
            $uri = '/' . ltrim($_GET['route'], '/');
        } elseif (!empty($_SERVER['PATH_INFO'])) {
            $uri = $_SERVER['PATH_INFO'];
        } else {
            $reqUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
            $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
            $uri = '/' . ltrim(str_replace([$scriptDir, '/index.php'], '', $reqUri), '/');
        }

        foreach (self::$routes as $r) {
            $parts = explode(' ', trim($r['pattern']), 2);
            $routeMethod = count($parts) === 2 ? strtoupper($parts[0]) : 'ANY';
            $routePath = count($parts) === 2 ? $parts[1] : $parts[0];

            if ($routeMethod !== 'ANY' && $routeMethod !== $method) {
                continue;
            }

            // Convierte parámetros @id en expresiones regulares
            $regex = preg_replace('/@([a-zA-Z0-9_]+)/', '(?P<$1>[^/]+)', $routePath);
            $regex = '#^' . $regex . '$#';

            if (preg_match($regex, $uri, $matches)) {
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                call_user_func_array($r['callback'], array_values($params));
                return;
            }
        }

        self::json(['error' => 'Ruta no encontrada en la API FlightPHP', 'uri' => $uri], 404);
    }
}