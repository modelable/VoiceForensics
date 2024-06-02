require('dotenv').config(); // DB 환경 변수 import
const express = require('express');
const multer = require('multer');
const axios = require('axios'); //flask 라우터 호출하기 위한 모듈
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const flash = require('express-flash');
const session = require('express-session');
const passport = require('passport');
const User = require('./models/User');

const app = express();
const port = 3000;
const server = http.createServer(app);
const io = require('socket.io')(server);

const userSockets = new Map();

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

//====================multer 선언부======================//
//images dir에 flask에서 호출한 이미지들을 저장 
const imageStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'images/');
    },
    filename: function(req, file, cb) {
        cb(null, file.originalname);
    }
});

const images_load = multer({storage: imageStorage});

// 음성 파일 업로드를 위한 multer 설정
const audiostorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // 업로드된 파일의 저장 경로
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname); // 업로드된 파일의 원본 파일명 사용
    }
});
const upload = multer({ storage: audiostorage });
//===========================================================//

// socket.io 클라이언트 스크립트를 제공하는 정적 파일 경로 설정
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules', 'socket.io/client-dist')));

// WebSocket 연결 및 userId를 이용한 소켓 등록
io.on('connection', socket => {
    socket.on('register', userId => {
        userSockets.set(userId, socket);
        console.log(`Socket registered for userId ${userId}`);

        socket.on('disconnect', () => {
            userSockets.delete(userId);
            console.log(`Socket disconnected and removed for userId ${userId}`);
        });
    });
});

// Passport config
const initializePassport = require('./passport-config');
initializePassport(passport);

// Views in pug
app.set('views', './views');
app.set('view engine', 'pug');

// BodyParser
app.use(express.urlencoded({ extended: false }));

// Express Session
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Express flash
app.use(flash());

// Global variables
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    next();
});

// MongoDB 로컬에 연결
// mongoose.connect('mongodb://localhost:27017/mydatabase');

const db = mongoose.connection;

// 수정 -> MongoDB Atlas(클라우드)에 연결
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

mongoose.connect(uri);

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// MongoDB 스키마 및 모델 정의
const FileControl = mongoose.model('FileControl', require('./models/FileControl'), 'file_control');
const FileRecord = mongoose.model('FileRecord', require('./models/FileRecord'), 'file_record');
const CoeffieControl = mongoose.model('CoeffieControl', require('./models/CoeffieControl'), 'coeffie_control');
const CoeffieRecord = mongoose.model('CoeffieRecord', require('./models/CoeffieRecord'), 'coeffie_record');

// 파일 업로드 및 MongoDB 저장
app.post('/upload', upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }]), async (req, res) => {
    try {
        const { file1, file2 } = req.files;
        const userId = req.user._id.toString();
        const socket = userSockets.get(userId); // 맵에서 사용자의 소켓 가져오기

        if (!socket) {
            console.error('User socket not found for userId:', userId);
            return res.json({ message: "User socket not found." });
        }

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

        // 사용자의 파일 ID 정보 업데이트
        await User.findByIdAndUpdate(userId, {
            $set: {
                files_control_id: newFile1._id,
                files_record_id: newFile2._id
            }
        });

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

        let totalCount = mfccResults.flat().length;
        let processedCount = 0;
        let progress = 0.0;
        
        // MFCC 데이터를 데이터베이스에 저장
        for (let i = 0; i < files.length; i++) {
            for (let result of mfccResults[i]) {
                if (!result.slice(1, 13).every(item => item === 0)) {
                    let mfccDocument;
                    if (i == 0) {
                        mfccDocument = new CoeffieControl({
                            MFCID: result[0],
                            MFCC1: result[1], MFCC2: result[2], MFCC3: result[3], MFCC4: result[4],
                            MFCC5: result[5], MFCC6: result[6], MFCC7: result[7], MFCC8: result[8],
                            MFCC9: result[9], MFCC10: result[10], MFCC11: result[11], MFCC12: result[12],
                            files_control_id: newFile1._id
                        });
                    } else {
                        mfccDocument = new CoeffieRecord({
                            MFCID: result[0],
                            MFCC1: result[1], MFCC2: result[2], MFCC3: result[3], MFCC4: result[4],
                            MFCC5: result[5], MFCC6: result[6], MFCC7: result[7], MFCC8: result[8],
                            MFCC9: result[9], MFCC10: result[10], MFCC11: result[11], MFCC12: result[12],
                            files_record_id: newFile2._id
                        });
                    }

                    await mfccDocument.save();
                    processedCount++;
                    let progress = Math.floor((processedCount / totalCount) * 100);
                    socket.emit('uploadProgress', { progress });
                }
            }
        }
        
        // 변경: 클라이언트에 JSON 응답 보내기
        res.json({ message: "Files uploaded and MFCC data saved to database.", redirectTo: '/upload_wait' });
        console.log("Files uploaded and MFCC data saved to database.");

    } catch (error) {
        console.error('Error processing files:', error);
        res.status(500).json({ message: 'Error uploading files and saving to database.' });
    }
});

// 이미지 파일을 업로드하는 라우터
app.post('/upload_image', images_load.single('image'), (req, res) => {
    try {
        console.log('Image uploaded successfully:', req.file);
        res.status(200).send('Image uploaded successfully');
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).send('Error uploading image');
    }
});

// URL(GET METHOD)
const users = require('./routes/users');
const index = require('./routes/index');

app.use('/users', users);
app.use('/', index);
