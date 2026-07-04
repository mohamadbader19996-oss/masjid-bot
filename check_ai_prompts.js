const fs = require('fs');

function show(file, start, end) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  console.log('\n========== ' + file + ' (lines ' + start + '-' + Math.min(end, lines.length) + ' of ' + lines.length + ' total) ==========');
  for (let i = start; i <= end && i <= lines.length; i++) {
    console.log(i + ': ' + lines[i - 1]);
  }
}

show('src/services/gemini.js', 1, 90);
show('src/services/gemini.js', 150, 330);
show('src/handlers/ai.js', 60, 170);
show('src/handlers/voiceHandler.js', 1, 130);
show('src/handlers/imageHandler.js', 1, 150);
show('src/handlers/scholar_panel.js', 220, 280);
