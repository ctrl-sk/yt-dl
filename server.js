const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/download', (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send('Missing url parameter');

  const downloadsDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

  const fileName = 'video.mp4';
  const filePath = path.join(downloadsDir, fileName);

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  const ytDlp = spawn('yt-dlp', [
    videoUrl,
    '-f', 'bestvideo+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--ffmpeg-location', require('ffmpeg-static'),
    '-o', filePath,
    '--no-warnings'
  ]);

  ytDlp.stdout.on('data', (data) => {
    console.log(`yt-dlp: ${data}`);
  });

  ytDlp.stderr.on('data', (data) => {
    console.error(`yt-dlp error: ${data}`);
  });

  ytDlp.on('close', (code) => {
    if (code === 0) {
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          console.log('Download complete:', fileName);
          res.download(filePath, fileName, (err) => {
            if (!err) fs.unlinkSync(filePath);
            else console.error('Error sending file:', err);
          });
        } else {
          res.status(500).send('File not found after download');
        }
      }, 500);
    } else {
      res.status(500).send('Failed to download video');
    }
  });
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
