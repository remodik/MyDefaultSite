<?php
$data_file = 'stats_data.json';

function initData() {
    return [
        'views' => 0,
        'likes' => 0,
        'viewed_ips' => [],
        'liked_ips' => []
    ];
}

function getData() {
    global $data_file;
    
    if (!file_exists($data_file)) {
        $data = initData();
        file_put_contents($data_file, json_encode($data));
        return $data;
    }
    
    $content = file_get_contents($data_file);
    $data = json_decode($content, true);
    
    if (!$data) {
        $data = initData();
        file_put_contents($data_file, json_encode($data));
    }
    
    return $data;
}

function saveData($data) {
    global $data_file;
    file_put_contents($data_file, json_encode($data));
}

function getClientIP() {
    if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
        return $_SERVER['HTTP_CLIENT_IP'];
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        return $_SERVER['HTTP_X_FORWARDED_FOR'];
    } else {
        return $_SERVER['REMOTE_ADDR'];
    }
}

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

$ip = getClientIP();
$data = getData();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!in_array($ip, $data['viewed_ips'])) {
        $data['viewed_ips'][] = $ip;
        $data['views'] = count($data['viewed_ips']);
        saveData($data);
    }
    
    $hasLiked = in_array($ip, $data['liked_ips']);
    
    echo json_encode([
        'views' => $data['views'],
        'likes' => $data['likes'],
        'hasLiked' => $hasLiked
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (isset($input['action']) && $input['action'] === 'like') {
        if (in_array($ip, $data['liked_ips'])) {
            echo json_encode(['success' => false, 'message' => 'Already liked', 'likes' => $data['likes']]);
            exit;
        }
        
        $data['liked_ips'][] = $ip;
        $data['likes'] = count($data['liked_ips']);
        saveData($data);
        
        echo json_encode(['success' => true, 'likes' => $data['likes']]);
        exit;
    }
    
    echo json_encode(['success' => false, 'message' => 'Invalid action']);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Invalid request method']);
?>