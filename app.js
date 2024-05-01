const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// MongoDB 연결
mongoose.connect('mongodb://localhost:27017/mydatabase', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// 정적 파일 제공을 위한 미들웨어 설정
app.use(express.static(path.join(__dirname, 'public')));

// 파일 업로드를 위한 multer 설정
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'uploads/'); // 업로드된 파일의 저장 경로
    },
    filename: function(req, file, cb) {
        cb(null, file.originalname); // 업로드된 파일의 원본 파일명 사용
    }
});
const upload = multer({ storage: storage });

// 파일 업로드 및 MongoDB 저장
app.post('/upload', upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }]), async (req, res) => {
    try {
        const { file1, file2 } = req.files;

        // MongoDB에 파일 정보 저장
        const File = mongoose.model('File', {
            filename: String,
            path: String
        });

        const newFile1 = new File({
            filename: file1[0].originalname,
            path: file1[0].path
        });

        const newFile2 = new File({
            filename: file2[0].originalname,
            path: file2[0].path
        });

        await newFile1.save();
        await newFile2.save();

        res.status(200).send('Files uploaded and saved to database.');
    } catch (error) {
        console.error('Error uploading files:', error);
        res.status(500).send('Error uploading files and saving to database.');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});