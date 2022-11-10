const ws = require('ws').Server;
const wss = new ws({ port: 3000 });
const clients = [];
const version = "A_1.0";
let playerCount = 0;
let activePlayers = 0;
let lobby = true;
let lobbyCountdown = false; //initial lobby countdown, timer checks ready status when false and lobbyTimer is on
let lobbyTimer = undefined;
let idleTimer = undefined;
let endTimer = undefined;
const idleTime = 2000; //2 seconds
const timerLength = 5;
const tags = {"JOINED": 0, "MOVE": 1, "EGG": 2, "HEALTH": 3, "READY": 4, "STATUS": 5, "NEWPLAYER": 6, "JOINCONFIRM": 7, "PLAYERLEFT": 8, "EGGCONFIRM": 9, "BUMP": 10,
"ITEMSEND": 11, "ITEMDESTROY": 12, "FULL": 13, "LABEL": 14, "BEGIN": 15, "TARGETSTATUS": 16, "SPECTATE": 17, "IDLE": 18, "ENDGAME": 19, "LOBBYPLAYER": 20};

console.log("server is running on port 3000");

wss.on('connection', ws => {
    if (playerCount > 12) {
        ws.send(JSON.stringify({ tag: tags["FULL"] }));
        ws.close();
        return;
    }
    playerCount++;
    ws.send(JSON.stringify({ tag: tags["JOINED"], version }));

    ws.on('message', message => {
        receiver(ws, JSON.parse(message));
    });

    ws.on('close', code => {
        playerCount--;
        if (!clients[ws.id]) return;
        console.log(`Player ${clients[ws.id].name} disconnected, code: ${code}, ${playerCount} players connected`);
        wss.broadcast(JSON.stringify({ tag: tags["PLAYERLEFT"], playerCount, id: ws.id }));
        if (playerCount < 1){
            if (idleTimer){
                clearTimeout(idleTimer);
                idleTimer = undefined;
            }
            endGame();
        }
        else if (!lobby && clients[ws.id].active){
            clients[ws.id].active = false;
            activePlayers--;
            if (activePlayers < 1){
                clearTimeout(endTimer);
                endTimer = setTimeout(endGame, 10000);
            }
        }
        else if (lobby){
            if (playerCount < 2) {
                lobbyCountdown = false;
                wss.broadcast(JSON.stringify({ tag: tags["LABEL"], label: "Waiting for more players...", timer: 0 }));
                if (lobbyTimer){
                    clearTimeout(lobbyTimer);
                    lobbyTimer = undefined;
                }
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

function receiver(ws, json) {
    const tag = json.tag;
    const id = ws.id;
    switch (tag) {
        case tags["JOINED"]: //joined
            const assignedID = (clients[json.prefID] || !json.prefID) ? getID() : json.prefID;
            initClient(ws, assignedID, json.name);
            console.log(`${clients[assignedID].name} joined, ${playerCount} players connected`);
            ws.send(JSON.stringify({ tag: tags["JOINCONFIRM"], id: assignedID, name: clients[assignedID].name, nameMap: getPlayerNameList(), activeList: getPlayerActiveList(),
            lobby: lobby }));
            wss.broadcastExcept(JSON.stringify({ tag: tags["NEWPLAYER"], id: assignedID, name: clients[assignedID].name }), ws.id);
            if (lobby){
                if (idleTimer === undefined) idleTimer = setTimeout(idlePlayers, idleTime); //idle timer every 2 seconds
                if (playerCount < 2) wss.broadcast(JSON.stringify({ tag: tags["LABEL"], label: "Waiting for more players...", timer: 0 }));
                else{
                    wss.broadcast(JSON.stringify({ tag: tags["LABEL"], label: `Starting in ${timerLength} seconds!`, timer: timerLength }));
                    if (lobbyTimer == undefined){
                        lobbyCountdown = true;
                        lobbyTimer = setTimeout(beginGame, timerLength * 1000); //make set timeout that calls beginGame() after x seconds
                    }
                    else ws.send(JSON.stringify({ tag: tags["READY"] }));
                }
            }
            else{ //game in progress
                clients[assignedID].active = false;
            }
            break;
        case tags["MOVE"]: //move
            clients[id].x = json.x;
            clients[id].y = json.y;
            clients[id].velx = json.velx;
            clients[id].vely = json.vely;
            if (clients[id].idle < 6) wss.broadcastExcept(JSON.stringify({ tag: tags["IDLE"], id, idle: false }), id);
            clients[id].idle = 10;
            if (!lobby){
                if (clients[json.target]){
                    wss.sendTo(JSON.stringify({ tag: tags["MOVE"], id: id, x: json.x, y: json.y, velx: json.velx, vely: json.vely, grav: json.grav,
                    shoveCounter: json.shoveCounter, shoveVel: json.shoveVel, dir: json.dir }), json.target);
                }
                if (clients[id].spectators.length > 0){
                    clients[id].spectators.forEach(spectator => {
                        wss.sendTo(JSON.stringify({ tag: tags["MOVE"], id: id, x: json.x, y: json.y, velx: json.velx, vely: json.vely, grav: json.grav,
                        shoveCounter: json.shoveCounter, shoveVel: json.shoveVel, dir: json.dir }), spectator);
                    });
                }
            }
            else{
                wss.broadcastExcept(JSON.stringify({ tag: tags["MOVE"], id: id, x: json.x, y: json.y, velx: json.velx, vely: json.vely, grav: json.grav,
                shoveCounter: json.shoveCounter, shoveVel: json.shoveVel, dir: json.dir }), id);
            }
            break;
        case tags["EGG"]: //EGG
            if (json.target != 99 && clients[json.target]){
                wss.sendTo(JSON.stringify({ tag: tags["EGG"], id: json.id, type: json.type, x: json.x, y: json.y, bltSpd: json.bltSpd, sender: id, toPlayer: json.toPlayer }),
                json.target);
            }
            if (clients[id].spectators.length > 0){
                clients[id].spectators.forEach(spectator => {
                    wss.sendTo(JSON.stringify({ tag: tags["EGG"], id: json.id, type: json.type, x: json.x, y: json.y, bltSpd: json.bltSpd, sender: id, toPlayer: json.toPlayer }),
                    spectator);
                });
            }
            break;
        case tags["HEALTH"]: //health
            wss.broadcastExcept(JSON.stringify({ tag: tags["HEALTH"], id: json.id, lastHit: json.lastHit, health: json.health, eggId: json.eggId }), id);
            if (!clients[json.id]) return; //bot
            clients[id].health = json.health;
            if (json.health <= 0){
                activePlayers--;
                clients[id].active = false;
                if (activePlayers < 1){
                    clearTimeout(endTimer);
                    endTimer = setTimeout(endGame, 10000);
                }
                else{
                    clients[id].spectators = [];
                }
            }
            break;
        case tags["READY"]: //ready
            clients[id].ready = true;
            console.log(`${clients[id].name} is ready`);
            break;
        case tags["STATUS"]: //status
            wss.broadcastExcept(JSON.stringify({ tag: tags["STATUS"], id: json.id, powerup: json.powerup, scale: json.scale }), id);
            if (clients[json.id]) clients[json.id].scale = json.scale; //if not a bot
            break;
        case tags["EGGCONFIRM"]: //egg confirm
            wss.sendTo(JSON.stringify({ tag: tags["EGGCONFIRM"] }), json.target);
            break;
        case tags["BUMP"]: //bump
            wss.broadcast(JSON.stringify({ tag: tags["BUMP"], direction: json.direction, dirChange: json.dirChange, target: json.target }));
            break;
        case tags["ITEMSEND"]: //item send
            if (clients[json.target]){
                wss.sendTo(JSON.stringify({ tag: tags["ITEMSEND"], itemId: json.itemId, category: json.category, type: json.type, x: json.x,
                y: json.y, duration: json.duration }), json.target);
            }
            if (clients[id].spectators.length > 0){
                clients[id].spectators.forEach(spectator => {
                    wss.sendTo(JSON.stringify({ tag: tags["ITEMSEND"], itemId: json.itemId, category: json.category, type: json.type, x: json.x,
                    y: json.y, duration: json.duration }), spectator);
                });
            }
            break;
        case tags["ITEMDESTROY"]: //item destroy
            if (clients[json.target]){
                wss.sendTo(JSON.stringify({ tag: tags["ITEMDESTROY"], itemId: json.itemId, eat: json.eat }), json.target);
            }
            if (clients[id].spectators.length > 0){
                clients[id].spectators.forEach(spectator => {
                    wss.sendTo(JSON.stringify({ tag: tags["ITEMDESTROY"], itemId: json.itemId, eat: json.eat }), spectator);
                });
            }
            break;
        case tags["TARGETSTATUS"]: //target status
            if (!clients[json.target]) return;
            clients[id].socket.send(JSON.stringify({ tag: tags["TARGETSTATUS"], scale: clients[json.target].scale, x: clients[json.target].x.toString(),
            y: clients[json.target].y.toString() }));
            break;
        case tags["SPECTATE"]: //spectate
            if (!clients[json.target]) return;
            if (json.spectating){
                if (clients[json.target].spectators.includes(id) == false) clients[json.target].spectators.push(id);
            }
            else if (clients[json.target].spectators.includes(id)) clients[json.target].spectators.splice(clients[json.target].spectators.indexOf(id), 1);
            wss.sendTo(JSON.stringify({ tag: tags["SPECTATE"], spectated: json.spectating }), json.target);
            break;
        case tags["ENDGAME"]: //end game
            if (activePlayers < 2){
                clearTimeout(endTimer);
                endTimer = setTimeout(endGame(id), 10000);
            }
            break;
        case tags["LOBBYPLAYER"]: //player who exits from main game and goes back to lobby
            wss.broadcastExcept(JSON.stringify({ tag: tags["LOBBYPLAYER"], id }), id);
            break;
    }
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
    clients[id].idle = 10;
    refreshClient(id);
}

function getID(){
    let id = 0;
    while (clients[id]) id++;
    return id;
}

function getPlayerNameList(){
    let list = [];
    for (let i = 0; i < 12; i++) {
        if (clients[i]) list.push(clients[i].name);
        else list.push(null);
    }
    return list;
}

function getPlayerActiveList(){
    let list = [];
    for (let i = 0; i < 12; i++) {
        if (clients[i]) list.push(clients[i].active);
        else list.push(false);
    }
    return list;
}

function beginGame(){
    if (lobbyCountdown){
        lobbyCountdown = false;
        wss.broadcast(JSON.stringify({ tag: tags["READY"] })); //send out a ready confirmation
        if (lobbyTimer){
            clearTimeout(lobbyTimer);
            lobbyTimer = undefined;
        }
        lobbyTimer = setTimeout(beginGame, 3000); // make set timeout that calls beginGame() after 3 seconds
        return;
    }
    // drop each player that isn't ready
    activePlayers = playerCount;
    for (let i = 0; i < clients.length; i++){
        if (!clients[i]) continue;
        if (!clients[i].ready){
            clients[i].socket.close();
            activePlayers--;
        }
        else clients[i].active = true;
    }
    if (activePlayers < 2) return;
    lobby = false;
    clearTimeout(lobbyTimer);
    lobbyTimer = undefined;
    wss.broadcast(JSON.stringify({ tag: tags["BEGIN"] }));
}

function endGame(winner = 99) {
    console.log("Game ended");
    lobby = true;
    clearTimeout(endTimer);
    wss.broadcast(JSON.stringify({ tag: tags["ENDGAME"], winner }));
    if (playerCount > 0){
        for (let i = 0; i < clients.length; i++) {
            if (clients[i]) refreshClient(i);
        }
        if (playerCount < 2) wss.broadcast(JSON.stringify({ tag: tags["LABEL"], label: "Waiting for more players...", timer: 0 }));
        else{
            wss.broadcast(JSON.stringify({ tag: tags["LABEL"], label: `Starting in ${timerLength} seconds!`, timer: timerLength }));
            lobbyCountdown = true;
            lobbyTimer = setTimeout(beginGame, timerLength * 1000); //make set timeout that calls beginGame() after x seconds
        }
    }
}

function idlePlayers(){
    for (let i = 0; i < clients.length; i++) {
        if (clients[i]){
            clients[i].idle --;
            // if (clients[i].idle == 5) console.log(`${clients[i].name} is idle`);
            if (clients[i].idle == 5) wss.broadcast(JSON.stringify({ tag: tags["IDLE"], id: i, idle: true }));
            //else if (clients[i].idle < 1) clients[i].socket.close();
        }
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(idlePlayers, idleTime);
}

function refreshClient(id){
    clients[id].x = 0;
    clients[id].y = 0;
    clients[id].health = 5;
    clients[id].scale = ".6";
    clients[id].active = false;
    clients[id].ready = false;
    clients[id].spectators = [];
}