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
    wss.broadcast(JSON.stringify({ tag: 'newplayer', count: playerCount, id: id }));

    ws.on('message', message => {
        let data = JSON.parse(message);
        console.log(ws.id);
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

function receiver(ws, JSON) {
    const tag = JSON.tag;
    const id = ws.id;
    switch (tag) {
        case 'move':
            clients[id].x = JSON.x;
            clients[id].y = JSON.y;
            wss.sendTo(JSON.stringify({ tag: 'move', id: id, x: JSON.x, y: JSON.y }), id);
            break;
        case 'shoot':
            wss.sendTo(JSON.stringify({ tag: 'shoot', id: id, type: JSON.type, x: JSON.x, y: JSON.y }), id);
            break;
        case 'health':
            clients[id].health = JSON.health;
            wss.broadcastExcept(JSON.stringify({ tag: 'health', id: id, health: JSON.health }), id);
            break;
        case 'death':
            clients[id].health = 0;
            wss.broadcastExcept(JSON.stringify({ tag: 'death', id: id }), id);
            alivePlayers--;
            if (alivePlayers <= 1) endGame();
            break;
    }
}

function endGame() {

}