const ws = require('ws').Server;
const wss = new ws({ port: 3000 });
const clients = [];
let playerCount = 0;
let alivePlayers = 0;
let lobby = true;
// enum tags {JOINED, MOVE, EGG, HEALTH, DEATH, STATUS, NEWPLAYER, JOINCONFIRM}
const tags = {"JOINED": 0, "MOVE": 1, "EGG": 2, "HEALTH": 3, "READY": 4, "STATUS": 5, "NEWPLAYER": 6, "JOINCONFIRM": 7, "PLAYERLEFT": 8, "EGGCONFIRM": 9, "BUMP": 10,
"ITEMSEND": 11, "ITEMDESTROY": 12, "FULL": 13};

console.log("server is running on port 3000");

wss.on('connection', ws => {
    if (playerCount > 12) {
        ws.send(JSON.stringify({ tag: tags["FULL"] }));
        ws.close();
        return;
    }
    playerCount++;
    ws.send(JSON.stringify({ tag: tags["JOINED"]}));

    ws.on('message', message => {
        receiver(ws, JSON.parse(message));
    });

    ws.on('close', code => {
        playerCount--;
        if (clients[ws.id].active){
            activePlayers--;
            if (activePlayers === 0) endGame();   
        }
        if (clients[ws.id]) {
            console.log(`Player ${clients[ws.id].name} disconnected, code: ${code}, ${playerCount} players connected`);
            wss.broadcast(JSON.stringify({ tag: tags["PLAYERLEFT"], playerCount, id: ws.id }));
            clients[ws.id] = undefined;
        }
    });

});

wss.broadcast = msg => {
    wss.clients.forEach(client => {
        client.send(msg);
    });
}

wss.broadcastExcept = (msg, ignore) => {
     clients.forEach(client => {
        if (client && client.id !== ignore) client.socket.send(msg);
    })
}

wss.sendTo = (msg, id) => {
    if (!clients[id]) return;
    clients[id].socket.send(msg);
}

function initClient(ws, id, name) {
    if (name === 'You') name = 'Chicken' + id;
    for (let i = 0; i < clients.length; i++){
        if (!clients[i]) continue;
        if (clients[i].name === name){
            name += id;
            break;
        }
    }
    ws.id = id;
    clients[id] = {};
    clients[id].name = name;
    clients[id].socket = ws;
    clients[id].id = id;
    clients[id].x = 0;
    clients[id].y = 0;
    clients[id].health = 5;
    clients[id].scale = ".6";
    clients[id].active = false;
    clients[id].ready = false;
}

function getID() {
    let id = 0;
    while (clients[id]) id++;
    return id;
}

function getPlayerNameList() {
    let list = [];
    for (let i = 0; i < 12; i++) {
        if (clients[i]) list.push(clients[i].name);
        else list.push(null);
    }
    return list;
}

function receiver(ws, json) {
    const tag = json.tag;
    const id = ws.id;
    switch (tag) {
        case tags["JOINED"]: //joined
            const assignedID = (clients[json.prefID] || !json.prefID) ? getID() : json.prefID;
            initClient(ws, assignedID, json.name);
            console.log(`${clients[assignedID].name} joined, ${playerCount} players connected`);
            ws.send(JSON.stringify({ tag: tags["JOINCONFIRM"], id: assignedID, name: clients[assignedID].name, nameMap: getPlayerNameList(), lobby: lobby }));
            wss.broadcastExcept(JSON.stringify({ tag: tags["NEWPLAYER"], id: assignedID, name: clients[assignedID].name }), ws.id);
            break;
        case tags["MOVE"]: //move
            clients[id].x = json.x;
            clients[id].y = json.y;
            clients[id].velx = json.velx;
            clients[id].vely = json.vely;
            if (!lobby){
                wss.sendTo(JSON.stringify({ tag: tags["MOVE"], id: id, x: json.x, y: json.y, velx: json.velx, vely: json.vely, grav: json.grav,
                shoveCounter: json.shoveCounter, shoveVel: json.shoveVel, dir: json.dir }), json.target);
            }
            else{
                wss.broadcastExcept(JSON.stringify({ tag: tags["MOVE"], id: id, x: json.x, y: json.y, velx: json.velx, vely: json.vely, grav: json.grav,
                shoveCounter: json.shoveCounter, shoveVel: json.shoveVel, dir: json.dir }), id);
            }
            break;
        case tags["EGG"]: //EGG
            wss.sendTo(JSON.stringify({ tag: tags["EGG"], id: json.id, type: json.type, x: json.x, y: json.y, bltSpd: json.bltSpd, sender: id, toPlayer: json.toPlayer }), json.target);
            break;
        case tags["HEALTH"]: //health
            clients[id].health = json.health;
            wss.broadcastExcept(JSON.stringify({ tag: tags["HEALTH"], id: id, lastHit: json.lastHit, health: json.health, eggId: json.eggId }), id);
            if (health <= 0) {
                activePlayers--;
                if (alivePlayers <= 1) endGame();
            }
            break;
        case tags["READY"]: //ready
            clients[id].ready = true;
            break;
        case tags["STATUS"]: //status
            if (json.powerup !== "none") wss.broadcastExcept(JSON.stringify({ tag: tags["STATUS"], id: id, powerup: json.powerup, scale: json.scale }), id);
            else wss.sendTo(JSON.stringify({ tag: tags["STATUS"], id: id, powerup: json.powerup, scale: json.scale }), json.target); //just send size to target
            clients[id].scale = json.scale;
            break;
        case tags["EGGCONFIRM"]: //egg confirm
            wss.sendTo(JSON.stringify({ tag: tags["EGGCONFIRM"] }), json.target);
            break;
        case tags["BUMP"]: //bump
            wss.broadcast(JSON.stringify({ tag: tags["BUMP"], direction: json.direction, dirChange: json.dirChange, target: json.target }));
            break;
        case tags["ITEMSEND"]: //item send
            wss.sendTo(JSON.stringify({ tag: tags["ITEMSEND"], itemId: json.itemId, category: json.category, type: json.type, x: json.x, y: json.y, duration: json.duration }), json.target);
            break;
        case tags["ITEMDESTROY"]: //item destroy
            wss.sendTo(JSON.stringify({ tag: tags["ITEMDESTROY"], itemId: json.itemId, eat: json.eat }), json.target);
            break;
    }
}

function endGame() {
    wss.broadcast(JSON.stringify({ tag: 'endgame' }));
    alivePlayers = 0;
}