import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import cron from 'node-cron';
import path from 'path';
import webp from 'webp-converter';
import Ffmpeg from 'fluent-ffmpeg';

const imageUrl = 'https://www.webcam-unna.de/video.jpg';

async function cropAndSaveImage() {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = await Buffer.from(response.data, 'binary');

    const { data, info } = await sharp(imageBuffer)
      .extract({ left: 80, top: 80, width: 639, height: 479 })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let faultyPixelCount = 0;
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r === 128 && g === 128 && b === 128) {
        faultyPixelCount++;
      }
    }

    if (faultyPixelCount > 2000) {
      console.log('Image is faulty:', faultyPixelCount);
      return;
    }
    else {
      await sharp(data, { raw: { width: 639, height: 479, channels: 3 } })
        .toFile(`./output/${Date.now()}.webp`);
    }
  }
  catch (error) {
    console.log('Error while cropping and saving image:', error);
  }
}

function moveImagesAndCreateLapses() {
  try {
    const currentDate = new Date();
    const dateFolder = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}`;
    const outputFolder = `./output/${dateFolder}`;
    const outputFileName = `./lapses/${dateFolder}`;

    // Create the output and lapses folder if they don't exist
    if (!fs.existsSync('./output')) {
      fs.mkdirSync('./output');
    }

    if (!fs.existsSync('./lapses')) {
      fs.mkdirSync('./lapses');
    }

    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder);
    }

    // Move all images to the date folder
    const files = fs.readdirSync('./output');
    for (const file of files) {
      if (file.endsWith('.webp')) {
        fs.renameSync(`./output/${file}`, `${outputFolder}/${file}`);
      }
    }

    let filelist = fs.readdirSync(outputFolder)
      .filter(file => path.extname(file).toLowerCase() === '.webp');

    // Erstelle die Eingabe für webpmux_animate
    const inputFramesWebp = filelist.map((file, index) => {
      return { path: path.join(outputFolder, file), offset: "+50" };
    });

    console.log("Building lapses... WEBP");

    // Erstelle das animierte WEBP
    webp.webpmux_animate(inputFramesWebp, outputFileName + ".webp", "0", '255,255,255,255', (status, error) => {
      if (error) {
        console.error('Fehler beim Erstellen des animierten WEBP:', error);
      } else {
        console.log('Animiertes WEBP erfolgreich erstellt:', outputFileName);
      }
    });

    console.log("Building lapses... MP4");

    const command = Ffmpeg()
      .renice(15)
      .addInput(`./output/${dateFolder}/*.webp`)
      .inputOptions('-pattern_type glob')
      .size('640x480')
      .videoCodec('libx264')
      .videoBitrate(4096)
      .fps(24)
      .output(`${outputFileName}.mp4`);

    command.on("start", function (commandLine) {
      console.log("Spawned Ffmpeg with command: " + commandLine);
    });

    command.on("error", function (err, stdout, stderr) {
      console.log("Cannot process video: " + err.message);
    });

    command.on("end", function (stdout, stderr) {
      console.log("Transcoding succeeded !");
    });

    command.run();

  } catch (error) {
    console.log('Error while moving images and creating lapses:', error);
  }
}

// only move images into another folder
function moveImages() {
  try {
    const currentDate = new Date();
    const dateFolder = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}`;
    const outputFolder = `./output/${dateFolder}`;

    // Create the date folder if it doesn't exist
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder);
    }

    // Move all images to the date folder
    const files = fs.readdirSync('./output');
    for (const file of files) {
      if (file.endsWith('.jpg')) {
        fs.renameSync(`./output/${file}`, `${outputFolder}/${file}`);
      }
    }

    console.log('Images moved successfully');
  } catch (error) {
    console.log('Error while moving images:', error);
  }
}

// Schedule the task to run every minute
cron.schedule('* * * * *', cropAndSaveImage);

// Schedule the task to run at the end of the day
cron.schedule('30 59 23 * * *', moveImagesAndCreateLapses);

// moveImagesAndCreateLapses();