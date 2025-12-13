import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcrypt';  
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { createClient } from "@deepgram/sdk"
import { User, Transcription } from './schema.js'

const app = express()
dotenv.config()
app.use(express.json())

const storage = multer.memoryStorage();
const upload = multer({storage});

app.use(cors());

const PORT = process.env.PORT || 5000;
const MONGOURL = process.env.MONGODB_URL
const SECRET_KEY = process.env.SECRET_KEY
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

const deepgram = createClient(deepgramApiKey);

mongoose.connect(MONGOURL).then(()=> {
  console.log('DB is connected successfully');
}).catch((error)=> console.log(error))

app.get("/", (req, res) => {
  res.send("Backend is running");
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, SECRET_KEY, async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.id = payload.id
        next();
      }
    });
  }
};

app.post('/sign-in', async(request, response)=>{
  const {password, email} = request.body;
  const userExists = await User.findOne({email})
  if(userExists){
    response.status(400)
    response.send({message: 'User already exists'})
  }else{
    const hashedPassword = await bcrypt.hash(password, 10);
    const userData = new User({
      ...request.body,
      password: hashedPassword,
    }) 
    await userData.save();
    response.status(201).send({ message: "User created successfully" });
  }
})

app.post('/login', async(request, response)=>{
  const {email, password} = request.body;
  const userData = await User.findOne({email});
  if(userData === null){
    response.status(400);
    response.send({message: "User doesn't Exists"})
  }else{
    const isPasswordSame = await bcrypt.compare(password, userData.password)
    if(isPasswordSame){
      const payload = {
        id: userData._id, email: userData.email
      }
      const token = jwt.sign(payload, SECRET_KEY);
      response.status(200);
      response.send({jwtToken: token})
    }else{
      response.status(400);
      response.send({message: "Password didn't matched"})
    }
  }
})

const transcribeFile = async (file) => {
  try {
    const { buffer, mimetype } = file;
    if (!buffer || !mimetype) throw new Error("Invalid file data");

    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: "nova-3",
        smart_format: true,
        language: "en",
        mimetype,
      }
    );

    if (error) throw error;

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    return transcript;

  } catch (err) {
    console.error("Deepgram transcription error:", err.message);
    throw err;
  }
};

app.post("/upload-audio", authenticateToken, upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).send("No file uploaded");

      const transcriptionText = await transcribeFile(req.file);

      const transcriptionDoc = new Transcription({
        userId: req.id,
        audioFile: {
          data: req.file.buffer,
          contentType: req.file.mimetype,
        },
        transcriptionText,
      });

      await transcriptionDoc.save();

      res.status(200).json({
        message: "Audio and transcription stored successfully",
        transcriptionText,
      });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Failed to process audio" });
    }
  }
);

app.get('/transcriptions', authenticateToken, async(request, response)=>{
  try{
    const transcriptions = await Transcription.find({ userId: request.id })
    const formatted = transcriptions.map(transcription => ({
      id: transcription._id,
      text: transcription.transcriptionText,
      audio: `data:${transcription.audioFile.contentType};base64,${transcription.audioFile.data.toString('base64')}`,
      createdAt: transcription.createdAt,
    }));
    response.json(formatted);
  } catch (err) {
    console.error("Error fetching transcriptions:", err);
    res.status(500).json({ error: "Failed to load transcriptions" });
  }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app; 