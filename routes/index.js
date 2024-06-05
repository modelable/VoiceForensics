const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('./auth');

// Use Models
const User = require('../models/User') 
const Result = require('../models/Result')

router.get('/', forwardAuthenticated, (req, res) => {
    res.render('index')
})

router.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.render('dashboard', {
        name: req.user.name,
        userId: req.user._id
    })
})

router.get('/upload_wait', ensureAuthenticated, async (req, res) => {
    // 클라이언트에 train_progress 페이지를 렌더링
    res.render('train_progress');

    // Flask 서버의 라우트를 호출하는 함수
    const callFlaskRoutes = async () => {
        const flaskUrl = 'http://127.0.0.1:5000';  // Flask 서버의 URL
        try {
            // '/' 라우터 호출
            let response = await axios.get(`${flaskUrl}/`);
            console.log("Response from '/':", response.data);
    
            // '/import_dataset' 라우터 호출
            response = await axios.get(`${flaskUrl}/import_dataset`);
            console.log("Response from '/import_dataset':", response.data);

            // '/mfcc_bar_graph' 라우터 호출
            response = await axios.get(`${flaskUrl}/mfcc_bar_graph`);
            console.log("Response from '/mfcc_bar_graph':", response.data);

            // '/mfcc_spectrum' 라우터 호출
            response = await axios.get(`${flaskUrl}/mfcc_spectrum`);
            console.log("Response from '/mfcc_spectrum':", response.data);
    
            // '/label_setting' 라우터 호출
            response = await axios.get(`${flaskUrl}/label_setting`);
            console.log("Response from '/label_setting':", response.data);
    
            // '/training' 라우터 호출
            response = await axios.get(`${flaskUrl}/training`);
            console.log("Response from '/training':", response.data);

            // '/model_predict' 라우터 호출
            response = await axios.get(`${flaskUrl}/model_predict`);
            console.log("Response from '/model_predict':", response.data);
    
            // '/visual_result' 라우터 호출 (이미지 생성 및 전송) 
            //response = await axios.get(`${flaskUrl}/visual_result`);
            //console.log("Response from '/visual_result':", response.data);

            } catch (error) {
                console.error('Error calling Flask routes:', error);
            }
        };
    
        // Flask 서버의 라우트를 호출합니다.
        await callFlaskRoutes();
});


router.get('/upload', ensureAuthenticated, (req, res) => {
    res.render('upload', {
        userId: req.user._id
    })
})

async function checkUserResult(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return { error: "User not found", status: 404 };
        }

        const result = await Result.findOne({
            $or: [
                { files_control_id: user.files_control_id.toString() },
                { files_record_id: user.files_record_id.toString() }
            ]
        });

        return result ? { result } : { error: '아직 결과가 출력되지 않았습니다.', status: 204 };
    } catch (error) {
        console.error("Error fetching result:", error);
        return { error: "Server error", status: 500 };
    }
}

// 결과 페이지 라우트
router.get('/result', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id);

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    // 결과가 있으면 결과 페이지 렌더링
    res.render('result', {
        userId: req.user._id,
        result
    })
});

// 결과 시각화 페이지 라우트
router.get('/result_visual', ensureAuthenticated, async (req, res) => {
    const { result, error, status } = await checkUserResult(req.user._id);

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    // 결과가 있으면 결과 시각화 페이지 렌더링
    res.render('result_visual', {
        userId: req.user._id,
        result
    })
});

router.get('/file_download', ensureAuthenticated, async (req, res) => {
    const { result, error, status } = await checkUserResult(req.user._id);

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // 로그인 쿠키 가져오기
    const cookies = req.headers.cookie.split(';').map(cookie => {
        const [name, value] = cookie.split('=').map(c => c.trim());
        return {name, value, domain: 'localhost', url: 'http://localhost:3000'};
    });

    // Puppeteer에 쿠키 설정
    await page.setCookie(...cookies);

    await page.goto('http://localhost:3000/result_visual', { waitUntil: 'networkidle2' });

    // PDF로 렌더링
    const pdf = await page.pdf({ format: 'A4' });

    await browser.close();

    // PDF 파일을 클라이언트에게 제공
    res.contentType('application/pdf');
    res.send(pdf);
});

module.exports = router;