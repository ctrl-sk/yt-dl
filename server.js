const express = require('express');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});


app.get('/download', (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send('Missing url parameter');

  console.log('📥 Download request for:', videoUrl);

  const downloadsDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

  const fileName = 'video.mp4';
  const filePath = path.join(downloadsDir, fileName);

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  // Use local yt-dlp binary if it exists (Railway), otherwise use system yt-dlp
  const ytdlpPath = fs.existsSync(path.join(__dirname, 'yt-dlp'))
    ? path.join(__dirname, 'yt-dlp')
    : 'yt-dlp';

  // Try to use system ffmpeg first (Railway), fallback to ffmpeg-static
  let ffmpegPath = 'ffmpeg';
  try {
    // Check if system ffmpeg exists by trying to spawn it
    execSync('which ffmpeg', { stdio: 'ignore' });
    ffmpegPath = 'ffmpeg';
    console.log('Using system ffmpeg');
  } catch (error) {
    // System ffmpeg not found, use ffmpeg-static
    ffmpegPath = require('ffmpeg-static');
    console.log('Using ffmpeg-static');
  }

  console.log('Using yt-dlp at:', ytdlpPath);
  console.log('ffmpeg location:', ffmpegPath);

  const ytDlp = spawn(ytdlpPath, [
    videoUrl,
    '-f', 'bestvideo+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--ffmpeg-location', ffmpegPath,
    '-o', filePath,
    '--no-warnings'
  ]);

  let stderrOutput = '';

  ytDlp.stdout.on('data', (data) => {
    console.log(`yt-dlp stdout: ${data}`);
  });

  ytDlp.stderr.on('data', (data) => {
    const message = data.toString();
    stderrOutput += message;
    console.error(`yt-dlp stderr: ${message}`);
  });

  ytDlp.on('error', (error) => {
    console.error('Failed to start yt-dlp:', error);
    res.status(500).send(`Failed to start download: ${error.message}`);
  });

  ytDlp.on('close', (code) => {
    console.log(`yt-dlp exited with code: ${code}`);
    if (code === 0) {
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          console.log('✅ Download complete:', fileName);
          res.download(filePath, fileName, (err) => {
            if (!err) fs.unlinkSync(filePath);
            else console.error('Error sending file:', err);
          });
        } else {
          console.error('❌ File not found after download');
          res.status(500).send('File not found after download');
        }
      }, 500);
    } else {
      console.error('❌ Download failed with code:', code);
      console.error('stderr output:', stderrOutput);
      res.status(500).send(`Failed to download video. Error: ${stderrOutput || 'Unknown error'}`);
    }
  });
});

const PORT = process.env.PORT || 3000;

// Verify binaries on startup
const ytdlpPath = path.join(__dirname, 'yt-dlp');
console.log('Checking for yt-dlp binary...');
console.log('yt-dlp exists:', fs.existsSync(ytdlpPath));
console.log('ffmpeg-static path:', require('ffmpeg-static'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
