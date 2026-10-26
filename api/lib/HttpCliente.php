<?php
/**
 * Cliente HTTP del proxy: cURL + caché en MySQL (tabla api_cache).
 *
 * Flujo de cada petición:
 *   1. Se calcula la llave sha1(fuente|url) y se busca en api_cache.
 *   2. HIT vigente  → se devuelve sin tocar la red.
 *   3. MISS/expirado → cURL a la API externa (en paralelo con curl_multi cuando hay varias).
 *   4. Respuesta 2xx → se guarda en api_cache con su TTL.
 *   5. Error de red/HTTP con copia expirada → se sirve la copia vieja (STALE, "stale-if-error").
 */
class ApiCache {
    public static function clave($fuente, $url) {
        return sha1($fuente . '|' . $url);
    }

    public static function leer($clave) {
        $pdo = Database::tryConnection();
        if (!$pdo) return null;
        try {
            $stmt = $pdo->prepare("SELECT respuesta, expira_en, (expira_en > NOW()) AS vigente FROM api_cache WHERE cache_key = ?");
            $stmt->execute([$clave]);
            $fila = $stmt->fetch();
            return $fila ?: null;
        } catch (PDOException $e) {
            return null;
        }
    }

    public static function registrarHit($clave) {
        $pdo = Database::tryConnection();
        if (!$pdo) return;
        try {
            $pdo->prepare("UPDATE api_cache SET hits = hits + 1, ultimo_acceso = NOW() WHERE cache_key = ?")->execute([$clave]);
        } catch (PDOException $e) {}
    }

    public static function guardar($clave, $fuente, $url, $cuerpo, $ttl, $httpCode) {
        $pdo = Database::tryConnection();
        if (!$pdo) return;
        try {
            $stmt = $pdo->prepare("
                INSERT INTO api_cache (cache_key, fuente, url, respuesta, http_code, bytes, creado_en, expira_en, ultimo_acceso, hits)
                VALUES (?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND), NOW(), 0)
                ON DUPLICATE KEY UPDATE respuesta = VALUES(respuesta), http_code = VALUES(http_code), bytes = VALUES(bytes),
                                        creado_en = NOW(), expira_en = VALUES(expira_en), ultimo_acceso = NOW()
            ");
            $stmt->execute([$clave, $fuente, mb_substr($url, 0, 1000), $cuerpo, $httpCode, strlen($cuerpo), (int)$ttl]);
        } catch (PDOException $e) {}
    }
}

class HttpCliente {
    private static function opcionesCurl($ch, $url) {
        $cfg = Database::config();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_TIMEOUT        => $cfg['curl']['timeout'],
            CURLOPT_CONNECTTIMEOUT => $cfg['curl']['connect_timeout'],
            CURLOPT_ENCODING       => '',
            CURLOPT_HTTPHEADER     => ['Accept: application/json, image/png;q=0.9, */*;q=0.5'],
            CURLOPT_USERAGENT      => 'Observatorio-Cultivos-P06/1.0' . ($cfg['contacto'] ? ' (' . $cfg['contacto'] . ')' : ''),
        ]);
    }

    /**
     * Ejecuta varias peticiones GET, usando caché y curl_multi para las que falten.
     * $peticiones = [id => ['fuente' => 'nasa_power', 'url' => '...', 'ttl' => 3600, 'binario' => false]]
     * Devuelve [id => ['ok', 'datos', 'cache' => HIT|MISS|STALE|ERROR, 'http', 'error', 'ms']]
     */
    public static function multi(array $peticiones) {
        $resultados = [];
        $pendientes = [];
        $copiasViejas = [];

        foreach ($peticiones as $id => $p) {
            $clave = ApiCache::clave($p['fuente'], $p['url']);
            $peticiones[$id]['clave'] = $clave;
            $fila = ApiCache::leer($clave);
            if ($fila && (int)$fila['vigente'] === 1) {
                ApiCache::registrarHit($clave);
                $resultados[$id] = self::empaquetar($p, $fila['respuesta'], 200, 'HIT', null, 0);
            } else {
                if ($fila) $copiasViejas[$id] = $fila['respuesta'];
                $pendientes[$id] = $p;
            }
        }

        if ($pendientes) {
            $mh = curl_multi_init();
            $handles = [];
            foreach ($pendientes as $id => $p) {
                $ch = curl_init();
                self::opcionesCurl($ch, $p['url']);
                curl_multi_add_handle($mh, $ch);
                $handles[$id] = $ch;
            }
            do {
                $estado = curl_multi_exec($mh, $activos);
                if ($activos) curl_multi_select($mh, 1.0);
            } while ($activos && $estado === CURLM_OK);

            foreach ($handles as $id => $ch) {
                $p = $peticiones[$id];
                $cuerpo = curl_multi_getcontent($ch);
                $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $ms = (int)round(curl_getinfo($ch, CURLINFO_TOTAL_TIME) * 1000);
                $errorCurl = curl_error($ch);
                curl_multi_remove_handle($mh, $ch);
                curl_close($ch);

                $valido = !$errorCurl && $http >= 200 && $http < 300 && $cuerpo !== '' && $cuerpo !== false;
                if ($valido && empty($p['binario']) && json_decode($cuerpo) === null) $valido = false;

                if ($valido) {
                    $almacenado = !empty($p['binario']) ? base64_encode($cuerpo) : $cuerpo;
                    ApiCache::guardar($p['clave'], $p['fuente'], $p['url'], $almacenado, $p['ttl'], $http);
                    $resultados[$id] = self::empaquetar($p, $almacenado, $http, 'MISS', null, $ms);
                } elseif (isset($copiasViejas[$id])) {
                    $resultados[$id] = self::empaquetar($p, $copiasViejas[$id], $http, 'STALE', $errorCurl ?: "HTTP $http", $ms);
                } else {
                    $resultados[$id] = [
                        'ok' => false, 'datos' => null, 'cache' => 'ERROR', 'http' => $http, 'ms' => $ms,
                        'error' => $errorCurl ?: "La API externa respondió HTTP $http",
                    ];
                }
            }
            curl_multi_close($mh);
        }
        return $resultados;
    }

    public static function get($fuente, $url, $ttl, $binario = false) {
        $r = self::multi(['x' => ['fuente' => $fuente, 'url' => $url, 'ttl' => $ttl, 'binario' => $binario]]);
        return $r['x'];
    }

    private static function empaquetar($p, $almacenado, $http, $cache, $error, $ms) {
        $datos = !empty($p['binario']) ? base64_decode($almacenado) : json_decode($almacenado, true);
        return ['ok' => true, 'datos' => $datos, 'cache' => $cache, 'http' => $http, 'error' => $error, 'ms' => $ms];
    }
}
