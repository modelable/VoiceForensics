// app.js
require('dotenv').config(); //DB 환경 변수 import
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const app = express();
const port = 3000;
const { spawn } = require('child_process');

// MongoDB 로컬에 연결
// mongoose.connect('mongodb://localhost:27017/mydatabase');

const db = mongoose.connection;

//수정 -> MongoDB Atlas(클라우드)에 연결
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

mongoose.connect(uri);

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// 정적 파일 제공을 위한 미들웨어 설정
app.use(express.static(path.join(__dirname, 'public')));

// 파일 업로드를 위한 multer 설정
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // 업로드된 파일의 저장 경로
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname); // 업로드된 파일의 원본 파일명 사용
    }
});
const upload = multer({ storage: storage });

// MongoDB 스키마 및 모델 정의
const FileControl = mongoose.model('FileControl', require('./models/FileControl'), 'file_control');
const FileRecord = mongoose.model('FileRecord', require('./models/FileRecord'), 'file_record');
const CoeffieControl = mongoose.model('CoeffieControl', require('./models/CoeffieControl'), 'coeffie_control');
const CoeffieRecord = mongoose.model('CoeffieRecord', require('./models/CoeffieRecord'), 'coeffie_record');

// 파일 업로드 및 MongoDB 저장(롤백)
app.post('/upload', upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }]), async (req, res) => {
    try {
        const { file1, file2 } = req.files;

        // 파일1을 files_control 테이블에 저장
        const newFile1 = new FileControl({
            filename: file1[0].originalname,
            path: file1[0].path
        });

        await newFile1.save();

        // 파일2를 files_record 테이블에 저장
        const newFile2 = new FileRecord({
            filename: file2[0].originalname,
            path: file2[0].path
        });

        await newFile2.save();

        const files = [file1[0], file2[0]];

        // mfcc 벡터 추출 값 정의
        const mfccResults = await Promise.all(files.map(file => {
            return new Promise((resolve, reject) => {
                const childProcess = spawn('node', ['mfcc.js', '-w', file.path, '-n', '256']);
                let outputData = [];
        
                childProcess.stdout.on('data', (data) => {
                    const values = data.toString().trim().split('\n').map(line =>
                        line.split(',').map(val => parseFloat(val))
                    );
                    outputData = outputData.concat(values);
                });
        
                childProcess.stderr.on('data', (data) => {
                    console.error(`Error from mfcc.js: ${data.toString()}`);
                    reject(new Error(`Error from mfcc.js: ${data.toString()}`)); // 오류가 발생하면 즉시 reject
                });
        
                childProcess.on('error', (error) => {
                    console.error(`Spawn error: ${error}`);
                    reject(error); // 오류 이벤트가 발생하면 reject 호출
                });
        
                childProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve(outputData); // 정상 종료
                    } else {
                        console.error(`mfcc.js exited with code ${code}`);
                        reject(new Error(`Process exited with code ${code}`)); // 비정상 종료
                    }
                });
            });
        }));

        for (let i = 0; i < files.length; i++) {
            await Promise.all(mfccResults[i].map(async (result) => {
                if (!result.slice(1, 13).every(item => item === 0)) {
                    var mfccDocument;
                    if (i == 0) {
                        const mfccData = {
                            MFCID: result[0], // 첫 열의 값을 MFCID로 사용
                            MFCC1: result[1], MFCC2: result[2], MFCC3: result[3], MFCC4: result[4],
                            MFCC5: result[5], MFCC6: result[6], MFCC7: result[7], MFCC8: result[8],
                            MFCC9: result[9], MFCC10: result[10], MFCC11: result[11], MFCC12: result[12],
                            files_control_id: newFile1._id // FileControl ID 참조
                        };
        
                        mfccDocument = new CoeffieControl(mfccData);
                        
                    } else {
                        const mfccData = {
                            MFCID: result[0], // 첫 열의 값을 MFCID로 사용
                            MFCC1: result[1], MFCC2: result[2], MFCC3: result[3], MFCC4: result[4],
                            MFCC5: result[5], MFCC6: result[6], MFCC7: result[7], MFCC8: result[8],
                            MFCC9: result[9], MFCC10: result[10], MFCC11: result[11], MFCC12: result[12],
                            files_record_id: newFile2._id // FileRecord ID 참조
                        };
        
                        mfccDocument = new CoeffieRecord(mfccData);
                    }
                    await mfccDocument.save();
                }
            }));
        }
        
        console.log('Files uploaded and MFCC data saved to database.');
        res.status(200).send('Files uploaded and MFCC data saved to database.');
    } catch (error) {
        console.error('Error processing files:', error);
        res.status(500).send('Error uploading files and saving to database.');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});