const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let ws;
let playerId;
let players = {};
let bullets = [];
let keys = {};

let xp = 0;
let xpToNextLevel = 100;
let level = 0; 
let xpCollectRadius = 30; 
let XPperSecond = 10;  
let xpOrbs = [];  

let xpAreas = [];

let hp = 80;
let maxHp = 100;
let HPRegen = 1; 
let bulletSpeed = 2.5;
let playerSpeed = 2;
let bulletMaxDistance = 150;

let worldWidth = 2000;
let worldHeight = 2000;

let upgradeOptionsForLevel = null; 
let upgradeTimer = 0; 
let autoUpgradeMessage = null;
let messageTimer = 0; 

let upgradeOptions = [
    { name: "Move Speed", stat: "speed", value: 0.2 },
    { name: "Bullet Speed", stat: "bulletSpeed", value: 0.5 },
    { name: "Max HP", stat: "maxHp", value: 10 },
    { name: "HP Regen", stat: "HPRegen", value: 0.1 },
    { name: "Bullet Range", stat: "bulletMaxDistance", value: 20 }
];

function connect() {
    let sessionID = localStorage.getItem('sessionID');
    if (!sessionID) {
        sessionID = prompt("Enter session ID (or leave empty for new):") || randString(8);
        localStorage.setItem('sessionID', sessionID);
    }

    ws = new WebSocket(`ws://localhost:8080/ws?session=${sessionID}`);

    ws.onopen = () => {
        console.log('Connected to server');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'id') {
            playerId = data.id;
            playerSession = data.session;
            players[playerId] = { x: 400, y: 300, angle: 0, vx: 0, vy: 0, hp: maxHp, maxHp: maxHp };
        } else if (data.type === 'sessionState') {
            const session = data.session;
            worldWidth = session.worldWidth;
            worldHeight = session.worldHeight;

            for (let id in session.players) {
                if (id !== playerId) {
                    players[id] = session.players[id];
                }
            }

            xpOrbs = Object.values(session.xpItems);

            xpAreas = Object.values(session.xpAreas);
        } else if (data.type === 'move') {
            if (data.id !== playerId && players[data.id]) {
                players[data.id].x = data.x;
                players[data.id].y = data.y;
                players[data.id].angle = data.angle;
            }
        } else if (data.type === 'bullet') {
            bullets.push(data.bullet);
        }
    };

    ws.onclose = () => {
        console.log('Disconnected from server');
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function randString(n) {
    const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s = "";
    for (let i = 0; i < n; i++) {
        s += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return s;
}

function generateXpOrbs(count) {
    for (let i = 0; i < count; i++) {
        xpOrbs.push({
            x: Math.random() * worldWidth,
            y: Math.random() * worldHeight,
            value: Math.floor(Math.random() * 61) + 20
        });
    }
}


function generateXpAreas(count) {
    for (let i = 0; i < count; i++) {
        xpAreas.push({
            x: Math.random() * worldWidth,
            y: Math.random() * worldHeight,
            width: 60,
            height: 60,
            xpPerSecond: 5,
            active: false,
            timeInArea: 0,
            maxTime: 5,
            actionRadius: 90
        });
    }
}

function drawCheckerboard(offsetX, offsetY) {
    const size = 40;

    const startX = Math.floor(offsetX / size) * size;
    const startY = Math.floor(offsetY / size) * size;
    const endX = startX + canvas.width + size;
    const endY = startY + canvas.height + size;

    for (let x = startX; x < endX; x += size) {
        for (let y = startY; y < endY; y += size) {
            const worldX = x;
            const worldY = y;

            if (worldX >= 0 && worldX < worldWidth && worldY >= 0 && worldY < worldHeight) {
                if ((Math.floor(worldX / size) + Math.floor(worldY / size)) % 2 === 0) {
                    ctx.fillStyle = '#333';
                } else {
                    ctx.fillStyle = '#222';
                }
                ctx.fillRect(x - offsetX, y - offsetY, size, size);
            } else {
                if ((Math.floor(worldX / size) + Math.floor(worldY / size)) % 2 === 0) {
                    ctx.fillStyle = '#333';
                } else {
                    ctx.fillStyle = '#222';
                }
                ctx.fillRect(x - offsetX, y - offsetY, size, size);

                ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                ctx.fillRect(x - offsetX, y - offsetY, size, size);
            }
        }
    }

    const borderLeft = 0 - offsetX;
    const borderTop = 0 - offsetY;
    const borderRight = worldWidth - offsetX;
    const borderBottom = worldHeight - offsetY;

    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(borderLeft, borderTop, borderRight - borderLeft, borderBottom - borderTop);
    ctx.stroke();
}

function drawMinimap(player) {
    const mapSize = 150;
    const padding = 10;
    const x = canvas.width - mapSize - padding;
    const y = padding;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x, y, mapSize, mapSize);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, mapSize, mapSize);

    for (let orb of xpOrbs) {
        const scaledX = x + (orb.x / worldWidth) * mapSize;
        const scaledY = y + (orb.y / worldHeight) * mapSize;

        ctx.beginPath();
        ctx.arc(scaledX, scaledY, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#3399ff';
        ctx.fill();
    }

    for (let area of xpAreas) {
        const scaledX = x + (area.x / worldWidth) * mapSize;
        const scaledY = y + (area.y / worldHeight) * mapSize;

        ctx.beginPath();
        ctx.rect(scaledX - 3, scaledY - 3, 6, 6);
        ctx.fillStyle = area.active ? '#00ff00' : '#800080';
        ctx.fill();
    }

    const playerScaledX = x + (player.x / worldWidth) * mapSize;
    const playerScaledY = y + (player.y / worldHeight) * mapSize;

    ctx.beginPath();
    ctx.arc(playerScaledX, playerScaledY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#33cc33';
    ctx.fill();
}

function drawTank(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-10, 10);
    ctx.closePath();

    ctx.fillStyle = '#33cc33';
    ctx.fill();

    ctx.restore();
}

function drawBullet(bulletX, bulletY) {
    ctx.beginPath();
    ctx.arc(bulletX, bulletY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcc00';
    ctx.fill();
}

function applyUpgrade(option) {
    switch (option.stat) {
        case "speed":
            playerSpeed += option.value;
            break;
        case "bulletSpeed":
            bulletSpeed += option.value;
            break;
        case "maxHp":
            maxHp += option.value;
            hp = maxHp;
            break;
        case "HPRegen":
            HPRegen += option.value;
            break;
        case "bulletMaxDistance":
            bulletMaxDistance += option.value;
            break;
    }
}

function renderAutoUpgradeMessage() {
    if (!autoUpgradeMessage || messageTimer <= 0) return;

    const padding = 10;
    const msgWidth = 250;
    const msgHeight = 40;
    const x = canvas.width - msgWidth - padding;
    const y = canvas.height - msgHeight - padding;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, y, msgWidth, msgHeight);

    ctx.fillStyle = '#00ff00';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(autoUpgradeMessage, x + msgWidth / 2, y + msgHeight / 2 + 5);
}

function renderUpgrades() {
    if (!upgradeOptionsForLevel || upgradeTimer <= 0) return;

    const padding = 10;
    const winWidth = 300;
    const winHeight = 150;

    const x = 10;
    const y = padding;

    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, winWidth, winHeight);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, winWidth, winHeight);

    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Choose an Upgrade (Time left: ${(upgradeTimer / 60).toFixed(1)}s)`, x + 10, y + 30);

    ctx.font = '14px Arial';
    for (let i = 0; i < upgradeOptionsForLevel.length; i++) {
        const option = upgradeOptionsForLevel[i];
        const optionY = y + 60 + i * 30;

        ctx.fillStyle = '#444';
        ctx.fillRect(x + 20, optionY, winWidth - 40, 25);

        ctx.fillStyle = 'white';
        ctx.fillText(`${option.name}: +${option.value}`, x + 30, optionY + 18);
    }
}

function render() {
    const player = players[playerId];
    if (!player) return;

    const offsetX = player.x - canvas.width / 2;
    const offsetY = player.y - canvas.height / 2;

    drawCheckerboard(offsetX, offsetY);

    for (let b of bullets) {
        if (isNaN(b.x) || isNaN(b.y)) continue;
        drawBullet(b.x - offsetX, b.y - offsetY);
    }

    let orbsDrawn = 0;
    for (let orb of xpOrbs) {
        if (isNaN(orb.x) || isNaN(orb.y) || isNaN(orb.value)) continue;

        ctx.beginPath();
        ctx.arc(orb.x - offsetX, orb.y - offsetY, xpCollectRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(51, 153, 255, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#3399ff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(orb.x - offsetX, orb.y - offsetY, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#3399ff';
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(Math.floor(orb.value), orb.x - offsetX, orb.y - offsetY - 15);

        orbsDrawn++;
    }

    if (orbsDrawn === 0 && xpOrbs.length > 0) {
        console.log("Warning: xpOrbs array has items, but none were drawn. Check NaN or visibility.");
    }

    for (let area of xpAreas) {
        if (isNaN(area.x) || isNaN(area.y) || isNaN(area.width) || isNaN(area.actionRadius)) continue;

        ctx.beginPath();
        ctx.arc(area.x - offsetX, area.y - offsetY, area.actionRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(128, 0, 128, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#800080';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = area.active ? '#00ff00' : '#800080';
        ctx.fillRect(
            area.x - area.width / 2 - offsetX,
            area.y - area.height / 2 - offsetY,
            area.width,
            area.height
        );

        if (!area.active) {
            const progress = area.timeInArea / area.maxTime;
            ctx.fillStyle = 'rgba(255, 255, 0, 0.6)';
            ctx.fillRect(
                area.x - area.width / 2 - offsetX,
                area.y - area.height / 2 - offsetY,
                area.width * progress,
                area.height
            );
        }
    }

    for (let id in players) {
        const p = players[id];
        if (isNaN(p.x) || isNaN(p.y)) continue;
        drawTank(p.x - offsetX, p.y - offsetY, p.angle);
    }

    drawMinimap(player);
    drawXpBar();
    drawHpBar();
    drawDebug();
    renderUpgrades();
    renderAutoUpgradeMessage();
}

function drawDebug() {
    const player = players[playerId];
    if (!player) return;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 250, 100);

    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';

    // ID
    ctx.fillText(`ID: ${playerId || 'N/A'}`, 60, 30);

    // X, Y
    ctx.fillText(`X: ${Math.round(player.x)}, Y: ${Math.round(player.y)}`, 60, 50);

    // Угол
    ctx.fillText(`Angle: ${player.angle.toFixed(2)} rad`, 60, 70);

    // Пули
    ctx.fillText(`Bullets: ${bullets.length}`, 60, 90);
}

function drawXpBar() {
    const barWidth = 300;
    const barHeight = 20;
    const x = canvas.width / 2 - barWidth / 2;
    const y = canvas.height - 30;

    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#00cc00';
    ctx.fillRect(x, y, (xp / xpToNextLevel) * barWidth, barHeight);

    ctx.strokeStyle = '#fff';
    ctx.strokeRect(x, y, barWidth, barHeight);

    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Level ${level} (${Math.floor(xp)}/${xpToNextLevel})`, canvas.width / 2, y + barHeight / 2 + 5);
}

function drawHpBar() {
    const barWidth = 300;
    const barHeight = 20;
    const x = canvas.width / 2 - barWidth / 2;
    const y = canvas.height - 60;

    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#cc0000';
    ctx.fillRect(x, y, (hp / maxHp) * barWidth, barHeight);

    ctx.strokeStyle = '#fff';
    ctx.strokeRect(x, y, barWidth, barHeight);

    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`HP: ${Math.floor(hp)}/${maxHp}`, canvas.width / 2, y + barHeight / 2 + 5);
}

function gameLoop() {
    if (!playerId || !players[playerId]) {
        console.log("Player not ready yet");
        requestAnimationFrame(gameLoop);
        return;
    }

    const player = players[playerId];

    if (keys['w'] || keys['W']) player.vy = -playerSpeed;
    else if (keys['s'] || keys['S']) player.vy = playerSpeed;
    else player.vy = 0;

    if (keys['a'] || keys['A']) player.vx = -playerSpeed;
    else if (keys['d'] || keys['D']) player.vx = playerSpeed;
    else player.vx = 0;

    player.x += player.vx;
    player.y += player.vy;

    if (player.x < 0) player.x = 0;
    if (player.x > worldWidth) player.x = worldWidth;
    if (player.y < 0) player.y = 0;
    if (player.y > worldHeight) player.y = worldHeight;

    ws.send(JSON.stringify({
        type: 'move',
        id: playerId,
        x: player.x,
        y: player.y,
        angle: player.angle
    }));

    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];

        if (b.dist === undefined) {
            b.dist = 0;
        }
        let dx = b.vx;
        let dy = b.vy;
        b.dist += Math.sqrt(dx * dx + dy * dy);

        b.x += b.vx;
        b.y += b.vy;

        if (b.dist > bulletMaxDistance) {
            bullets.splice(i, 1);
        }
    }

    for (let i = xpOrbs.length - 1; i >= 0; i--) {
        const orb = xpOrbs[i];
        const dx = player.x - orb.x;
        const dy = player.y - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < xpCollectRadius && orb.value > 0) { 
            orb.value -= (XPperSecond / 60);
            xp += (XPperSecond / 60);

            if (orb.value <= 0) {
                xpOrbs.splice(i, 1);

                ws.send(JSON.stringify({
                    type: 'orbCollected',
                    id: orb.id 
                }));
            }
        }
    }

    for (let area of xpAreas) {
        const dx = player.x - area.x;
        const dy = player.y - area.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < area.actionRadius) {
            if (!area.active) {
                area.timeInArea += 1 / 60;

                if (area.timeInArea >= area.maxTime) {
                    area.active = true;
                    area.timeInArea = 0;
                }
            }

            if (area.active) {
                xp += (area.xpPerSecond / 60);
            }
        } else {
            area.active = false;
            area.timeInArea = 0;
        }
    }

    while (xp >= xpToNextLevel) {
        level++;
        xp -= xpToNextLevel;
        xpToNextLevel = Math.floor(xpToNextLevel * 1.5);

        const shuffled = [...upgradeOptions].sort(() => 0.5 - Math.random());
        upgradeOptionsForLevel = shuffled.slice(0, 3);
        upgradeTimer = 180;
    }

    if (upgradeTimer > 0) {
        upgradeTimer--;
        if (upgradeTimer === 0) {
            const randomUpgrade = upgradeOptionsForLevel[Math.floor(Math.random() * 3)];
            applyUpgrade(randomUpgrade);

            autoUpgradeMessage = `Auto-applied: ${randomUpgrade.name} +${randomUpgrade.value}`;
            messageTimer = 180;

            upgradeOptionsForLevel = null;
        }
    }

    if (hp < maxHp) {
        hp += (HPRegen / 60); // 60 FPS
        if (hp > maxHp) hp = maxHp;
    }

    if (messageTimer > 0) {
        messageTimer--;
    }

    if (playerId && players[playerId]) {
        const player = players[playerId];

        if (keys['w'] || keys['W']) player.vy = -playerSpeed;
        else if (keys['s'] || keys['S']) player.vy = playerSpeed;
        else player.vy = 0;

        if (keys['a'] || keys['A']) player.vx = -playerSpeed;
        else if (keys['d'] || keys['D']) player.vx = playerSpeed;
        else player.vx = 0;

        player.x += player.vx;
        player.y += player.vy;

        if (player.x < 0) player.x = 0;
        if (player.x > worldWidth) player.x = worldWidth;
        if (player.y < 0) player.y = 0;
        if (player.y > worldHeight) player.y = worldHeight;

        ws.send(JSON.stringify({
            type: 'move',
            id: playerId,
            x: player.x,
            y: player.y,
            angle: player.angle
        }));
    }



    render();
    requestAnimationFrame(gameLoop);
}

canvas.addEventListener('mousemove', (e) => {
    if (!playerId || !players[playerId]) return;

    const rect = canvas.getBoundingClientRect();
    const player = players[playerId];

    const offsetX = player.x - canvas.width / 2;
    const offsetY = player.y - canvas.height / 2;

    const worldMouseX = e.clientX - rect.left + offsetX;
    const worldMouseY = e.clientY - rect.top + offsetY;

    const dx = worldMouseX - player.x;
    const dy = worldMouseY - player.y;
    player.angle = Math.atan2(dy, dx);
});

canvas.addEventListener('click', (e) => {
    if (!playerId || !players[playerId]) return;

    if (upgradeOptionsForLevel && upgradeTimer > 0) {
        const padding = 10;
        const winWidth = 300;
        const x = 10;
        const y = padding;

        for (let i = 0; i < upgradeOptionsForLevel.length; i++) {
            const optionY = y + 60 + i * 30;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            if (mouseX > x + 20 && mouseX < x + winWidth - 20 && mouseY > optionY && mouseY < optionY + 25) {
                applyUpgrade(upgradeOptionsForLevel[i]);
                upgradeOptionsForLevel = null;
                upgradeTimer = 0;
                return;
            }
        }
    }

    const player = players[playerId];
    const bullet = {
        x: player.x + Math.cos(player.angle) * 20,
        y: player.y + Math.sin(player.angle) * 20,
        vx: Math.cos(player.angle) * bulletSpeed,
        vy: Math.sin(player.angle) * bulletSpeed,
    };

    bullets.push(bullet);

    ws.send(JSON.stringify({
        type: 'shoot',
        id: playerId,
        bullet: bullet
    }));
});

document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

window.onload = () => {
    connect();
    gameLoop();
};