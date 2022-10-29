const ws = require('ws').Server;
const wss = new ws({ port: 3000 });
const clients = [];
let playerCount = 0;
let alivePlayers = 0;

console.log("server is running on port 3000");

wss.on('connection', ws => {
    if (playerCount > 12) {
        ws.send(JSON.stringify({ tag: 'full' }));
        ws.close();
        return;
    }
    playerCount++;
    const id = getID();
    initClient(ws, id);
    ws.send(JSON.stringify({ tag: 'id', id: id }));
    ws.id = id;
    // wss.broadcast(JSON.stringify({ tag: 'newplayer', count: playerCount, id: id }));

    ws.on('message', message => {
        receiver(ws, JSON.parse(message));
    });

    ws.on('close', code => {
        console.log(`Client ${id} disconnected, code: ${code}`);
        playerCount--;
        wss.broadcast(JSON.stringify({ tag: 'playerleft', count: playerCount, id: id }));
        clients[id] = null;
    });

});

wss.broadcast = msg => {
    wss.clients.forEach(client => {
        client.send(msg);
    });
}

wss.broadcastExcept = (msg, ignore) => {
     clients.forEach(client => {
        if (client.id !== ignore) client.socket.send(msg);
    })
}

wss.sendTo = (msg, id) => {
    if (!clients[id]) return;
    clients[id].socket.send(msg);
}

function initClient(ws, id) {
    clients[id] = {};
    clients[id].socket = ws;
    clients[id].id = id;
    clients[id].x = 0;
    clients[id].y = 0;
    clients[id].health = 5;
}

function getID() {
    let id = 0;
    while (clients[id]) id++;
    return id;
}

function receiver(ws, json) {
    const tag = json.tag;
    const id = ws.id;
    switch (tag) {
        case 0: //move
            clients[id].x = json.x;
            clients[id].y = json.y;
            wss.sendTo(JSON.stringify({ tag: 0, id: id, x: json.x, y: json.y }), json.target);
            break;
        case 1: //shoot
            wss.sendTo(JSON.stringify({ tag: 1, id: json.id, type: json.type, x: json.x, y: json.y, bltSpd: json.bltSpd, onPlayer: json.onPlayer }), json.target);
            break;
        case 2: //health
            clients[id].health = json.health;
            wss.broadcastExcept(JSON.stringify({ tag: 2, id: id, health: json.health }), id);
            break;
        case 3: //death
            clients[id].health = 0;
            wss.broadcastExcept(JSON.stringify({ tag: 3, id: id }), id);
            alivePlayers--;
            if (alivePlayers <= 1) endGame();
            break;
        case 4: //status
            wss.broadcastExcept(JSON.stringify({ tag: 4, id: id, powerup: json.powerup, size: json.size }), id);
            break;
    }
}

function endGame() {
    wss.broadcast(JSON.stringify({ tag: 'endgame' }));
    alivePlayers = 0;
}