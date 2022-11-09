const ws = require('ws').Server;
const wss = new ws({ port: 3000 });
const clients = [];
let playerCount = 0;
let activePlayers = 0;
let lobby = true;
let lobbyCountdown = false;
let lobbyTimer = undefined;
const timerLength = 5;
const tags = {"JOINED": 0, "MOVE": 1, "EGG": 2, "HEALTH": 3, "READY": 4, "STATUS": 5, "NEWPLAYER": 6, "JOINCONFIRM": 7, "PLAYERLEFT": 8, "EGGCONFIRM": 9, "BUMP": 10,
"ITEMSEND": 11, "ITEMDESTROY": 12, "FULL": 13, "LABEL": 14, "BEGIN": 15, "TARGETSTATUS": 16};

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
        if (!clients[ws.id]) return;
        console.log(`Player ${clients[ws.id].name} disconnected, code: ${code}, ${playerCount} players connected`);
        wss.broadcast(JSON.stringify({ tag: tags["PLAYERLEFT"], playerCount, id: ws.id }));
        if (playerCount < 1) endGame();
        else if (!lobby && clients[ws.id].active){
            clients[ws.id].active = false;
            activePlayers--;
            if (activePlayers < 1) endGame();   
        }
        else if (lobby){
            if (playerCount < 2) {
                lobbyCountdown = false;
                wss.broadcast(JSON.stringify({ tag: tags["LABEL"], label: "Waiting for more players...", timer: 0 }));
                if (lobbyTimer) clearTimeout(lobbyTimer);
            }
        }
        clients[ws.id] = undefined;
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

function beginGame(){
    if (lobbyCountdown){
        lobbyCountdown = false;
        wss.broadcast(JSON.stringify({ tag: tags["READY"] })); //send out a ready confirmation
        lobbyTimer = setTimeout(beginGame, 5000); // make set timeout that calls beginGame() after 5 seconds
        return;
    }
    // drop each player that isn't ready
    for (let i = 0; i < clients.length; i++){
        if (!clients[i]) continue;
        if (!clients[i].ready) clients[i].socket.close();
    }
    if (playerCount < 2) return;
    lobby = false;
    activePlayers = playerCount;
    wss.broadcast(JSON.stringify({ tag: tags["BEGIN"] }));
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
            if (lobby){
                if (playerCount < 2) wss.broadcast(JSON.stringify({ tag: tags["LABEL"], label: "Waiting for more players...", timer: 0 }));
                else{
                    wss.broadcast(JSON.stringify({ tag: tags["LABEL"], label: `Starting in ${timerLength} seconds!`, timer: timerLength }));
                    lobbyCountdown = true;
                    lobbyTimer = setTimeout(beginGame, timerLength * 1000); // make set timeout that calls beginGame() after x seconds
                }
            }
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
            if (json.health <= 0) {
                activePlayers--;
                client[id].active = false;
                if (activePlayers <= 1) endGame();
            }
            break;
        case tags["READY"]: //ready
            clients[id].ready = true;
            console.log(`${clients[id].name} is ready`);
            break;
        case tags["STATUS"]: //status
            wss.broadcastExcept(JSON.stringify({ tag: tags["STATUS"], id: id, powerup: json.powerup, scale: json.scale }), id);
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
        case tags["TARGETSTATUS"]: //target status
            if (!clients[json.target]) return;
            wss.sendTo(JSON.stringify({ tag: tags["TARGETSTATUS"], scale: clients[json.target].scale, x: clients[json.target].x, y: clients[json.target].y }), id);
            break;
    }
}

function endGame() {
    console.log("Game ended");
    lobby = true;
}