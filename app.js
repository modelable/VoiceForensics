// app.js
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const app = express();
const port = 3000;
const { spawn } = require('child_process');
//const fs = require('fs');
//const { exec } = require('child_process');
//const { execFile } = require('child_process');

// MongoDB 로컬에 연결
// mongoose.connect('mongodb://localhost:27017/mydatabase');

const db = mongoose.connection;

//수정 -> MongoDB Atlas(클라우드)에 연결
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

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

// record 파일 업로드 및 MongoDB 저장
app.post('/upload_record', upload.single('record'), async (req, res) => {
    try {
        const record = req.file;

        // 원본 파일을 files_record 테이블에 저장
        const newFile = new FileRecord({
            filename: record.originalname,
            path: record.path
        });

        await newFile.save();

        // mfcc 벡터 추출 값 정의
        const mfccResults = await new Promise((resolve, reject) => {
            const childProcess = spawn('node', ['mfcc.js', '-w', record.path, '-n', '256']);
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

        // 파일에 대한 모든 MFCC 데이터를 저장
        mfccResults.forEach(async (result) => {
            if (!result.slice(1, 13).every(item => item === 0)) {
                const mfccData = {
                    MFCID: result[0], // 첫 열의 값을 MFCID로 사용
                    MFCC1: result[1], MFCC2: result[2], MFCC3: result[3], MFCC4: result[4],
                    MFCC5: result[5], MFCC6: result[6], MFCC7: result[7], MFCC8: result[8],
                    MFCC9: result[9], MFCC10: result[10], MFCC11: result[11], MFCC12: result[12],
                    files_record_id: newFile._id // FileRecord ID 참조
                };

                const mfccDocument = new CoeffieRecord(mfccData);
                await mfccDocument.save();
            }
        });
        console.log('Record file uploaded and MFCC data saved to database.');
        res.redirect('/upload_controls');
    } catch (error) {
        console.error('Error processing files:', error);
        res.status(500).send('Error uploading files and saving to database.');
    }
});

// control 파일 업로드 및 DB 저장
app.post('/upload_controls', upload.array('file'), async (req, res) => {
    try {
        const files = req.files;

        // 각 파일을 files_control 테이블에 저장하고 MFCC 데이터 추출
        const mfccResults = await Promise.all(files.map(file => {
            const newFile = new FileControl({
                filename: file.originalname,
                path: file.path
            });
            return newFile.save().then(() => {
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
                        reject(new Error(`Error from mfcc.js: ${data.toString()}`));
                    });

                    childProcess.on('error', (error) => {
                        console.error(`Spawn error: ${error}`);
                        reject(error);
                    });

                    childProcess.on('close', (code) => {
                        if (code === 0) {
                            resolve(outputData);
                        } else {
                            console.error(`mfcc.js exited with code ${code}`);
                            reject(new Error(`Process exited with code ${code}`));
                        }
                    });
                });
            });
        }));

        // MFCC 데이터를 데이터베이스에 저장
        mfccResults.forEach((results, index) => {
            results.forEach(async (result) => {
                if (!result.slice(1, 13).every(item => item === 0)) {
                    const mfccData = {
                        MFCID: result[0],
                        MFCC1: result[1], MFCC2: result[2], MFCC3: result[3], MFCC4: result[4],
                        MFCC5: result[5], MFCC6: result[6], MFCC7: result[7], MFCC8: result[8],
                        MFCC9: result[9], MFCC10: result[10], MFCC11: result[11], MFCC12: result[12],
                        files_record_id: files[index]._id
                    };

                    const mfccDocument = new CoeffieControl(mfccData);
                    await mfccDocument.save();
                }
            });
        });
        console.log('All Control files uploaded and MFCC data saved to database.');
    } catch (error) {
        console.error('Error processing files:', error);
        res.status(500).send('Error uploading files and saving to database.');
    }
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload_record.html'));
});

// 원본 음성 업로드 -> 비교 음성 업로드
app.get('/upload_controls', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload_controls.html'));
});
