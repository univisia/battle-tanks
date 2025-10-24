const socket = io();

const field = document.getElementById('field');

function createField() {
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.id = `cell-${x}-${y}`;
      field.appendChild(cell);
    }
  }
}

createField();

socket.on('update', (data) => {
  console.log('Game state update:', data);
  // Clear previous
  document.querySelectorAll('.tank, .bullet, .fire, .powerup').forEach(el => el.remove());
  document.querySelectorAll('.wall').forEach(cell => cell.classList.remove('wall'));
  document.querySelectorAll('.water').forEach(cell => cell.classList.remove('water'));

  // Add walls
  data.walls.forEach(wall => {
    const cell = document.getElementById(`cell-${wall.x}-${wall.y}`);
    cell.classList.add('wall');
  });

  // Add water
  data.water.forEach(water => {
    const cell = document.getElementById(`cell-${water.x}-${water.y}`);
    cell.classList.add('water');
  });

  // Add power-ups
  data.powerUps.forEach(powerUp => {
    const cell = document.getElementById(`cell-${powerUp.x}-${powerUp.y}`);
    const powerUpEl = document.createElement('div');
    powerUpEl.className = `powerup ${powerUp.type}`;
    cell.appendChild(powerUpEl);
  });

  // Add tanks
  data.tanks.forEach(tank => {
    const cell = document.getElementById(`cell-${tank.x}-${tank.y}`);
    const tankEl = document.createElement('div');
    tankEl.className = `tank ${tank.color}`;
    if (!tank.alive) {
      tankEl.className += ' dead';
    }
    if (tank.powerUp) {
      tankEl.className += ` ${tank.powerUp.type}`;
    }
    const angle = ['N', 'E', 'S', 'W'].indexOf(tank.dir) * 90;
    tankEl.style.transform = `rotate(${angle}deg)`;
    cell.appendChild(tankEl);

    if (!tank.alive) {
      const fireEl = document.createElement('div');
      fireEl.className = 'fire';
      cell.appendChild(fireEl);
    }
  });

  // Add bullets
  data.bullets.forEach(bullet => {
    const cell = document.getElementById(`cell-${bullet.x}-${bullet.y}`);
    const bulletEl = document.createElement('div');
    const tank = data.bots[bullet.owner];
    if (tank) {
      let className = `bullet ${tank.color}`;
      if (bullet.type === 'missile') {
        className += ' missile';
      }
      bulletEl.className = className;
      const angle = ['N', 'E', 'S', 'W'].indexOf(bullet.dir) * 90;
      bulletEl.style.transform = `rotate(${angle}deg)`;
      cell.appendChild(bulletEl);
    }
  });
});

socket.on('stats', (data) => {
  const tbody = document.querySelector('#statsTable tbody');
  tbody.innerHTML = '';
  
  // Calculate scores and sort by score descending
  const botsWithScore = data.bots.map(bot => ({
    ...bot,
    score: bot.kills - bot.deaths
  })).sort((a, b) => b.score - a.score);
  
  botsWithScore.forEach(bot => {
    const tr = document.createElement('tr');
    
    const tdBot = document.createElement('td');
    tdBot.className = 'd-flex align-items-center';
    
    const colorSpan = document.createElement('span');
    colorSpan.style.display = 'inline-block';
    colorSpan.style.width = '20px';
    colorSpan.style.height = '20px';
    colorSpan.style.backgroundColor = bot.color;
    colorSpan.style.border = '1px solid black';
    colorSpan.style.marginRight = '10px';
    tdBot.appendChild(colorSpan);
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = bot.name;
    tdBot.appendChild(nameSpan);
    
    tr.appendChild(tdBot);
    
    const tdScore = document.createElement('td');
    tdScore.textContent = bot.score;
    tr.appendChild(tdScore);
    
    const tdKills = document.createElement('td');
    tdKills.textContent = bot.kills;
    tr.appendChild(tdKills);
    
    const tdDeaths = document.createElement('td');
    tdDeaths.textContent = bot.deaths;
    tr.appendChild(tdDeaths);
    
    tbody.appendChild(tr);
  });

  // Update game number
  document.getElementById('gameNumber').textContent = `Game #${data.gameCounter}`;
});

socket.on('deployment', (data) => {
  const deploymentsDiv = document.getElementById('deployments');
  const deploymentItem = document.createElement('p');
  deploymentItem.textContent = `Game #${data.gameNumber} - Bot ${data.botName} deployed new version`;
  deploymentItem.style.fontSize = 'small';
  deploymentItem.style.margin = '0';
  deploymentItem.style.padding = '0';
  deploymentsDiv.appendChild(deploymentItem);
  // Auto-scroll to bottom
  deploymentsDiv.scrollTop = deploymentsDiv.scrollHeight;
});