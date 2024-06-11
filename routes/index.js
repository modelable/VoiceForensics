const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const router = express.Router();
const { ensureAuthenticated, forwardAuthenticated } = require('./auth');

// Use Models
const User = require('../models/User') 
const Result = require('../models/Result');
const CoeffieRecordAvg = require('../models/CoeffieRecordAvg');
const CoeffieControlAvg = require('../models/CoeffieControlAvg');

router.get('/', forwardAuthenticated, (req, res) => {
    res.render('index')
})

router.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.render('dashboard', {
        name: req.user.name,
        userId: req.user._id
    })
})

// HTML 페이지 렌더링 라우트 -> 라우트 페이지
router.get('/train_process', ensureAuthenticated, (req, res) => {
    res.render('train_process');
});

// SSE 이벤트 전송 라우트
router.get('/upload_wait_events', ensureAuthenticated, async (req, res) => {
    // SSE 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // 헤더를 즉시 전송

    const callFlaskRoutes = async () => {
        const flaskUrl = 'http://127.0.0.1:5000';
        const eng_steps = ['import_dataset', 'mfcc_bar_graph', 'mfcc_spectrum', 'fft_spectrum', 'label_setting', 'training', 'model_predict'];
        const kor_steps = ['음성 추출 데이터셋 불러오기', '음성 특징 평균값 시각화', 'MFCC 스펙트럼 시각화', '주파수 스펙트럼 시각화', '클러스트링(데이터 분류)', 'AI 모델 학습', '유사도 측정'];
        for (let i = 0; i < eng_steps.length; i++) {
            const response = await axios.get(`${flaskUrl}/${eng_steps[i]}`);
            console.log(`Response from '/${eng_steps[i]}':`, response.data);

            // 각 단계가 완료될 때마다 클라이언트에게 이벤트를 보냅니다.
            res.write(`data: ${kor_steps[i]}\n\n`);
        }
        // 모든 단계가 완료되면 연결 종료를 알리는 이벤트를 보냅니다.
        res.write('data: done\n\n');
    };

    // Flask 서버의 라우트를 호출합니다.
    await callFlaskRoutes();

    // 모든 데이터가 전송되었음을 알리고 연결을 종료합니다.
    res.end();
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
    //console.log(result.files_record_id)
    const recordAvg = await CoeffieRecordAvg.findOne({ files_record_id: result.files_record_id }).lean();
    const controlAvg = await CoeffieControlAvg.findOne({ files_control_id: result.files_control_id }).lean();
    console.log(result.files_control_id)

    // 결과가 있으면 결과 시각화 페이지 렌더링
    res.render('result_visual', {
        userId: req.user._id,
        result,
        recordAvg: recordAvg || {}, // recordAvg가 null이면 빈 객체를 할당
        controlAvg: controlAvg || {} // controlAvg가 null이면 빈 객체를 할당
    });
    
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

    const browser = await puppeteer.launch({ args: ['--font-render-hinting=none'] });
    const page = await browser.newPage();

    // 로그인 쿠키 가져오기
    const cookies = req.headers.cookie.split(';').map(cookie => {
        const [name, value] = cookie.split('=').map(c => c.trim());
        return {name, value, domain: 'localhost', url: 'http://localhost:3000'};
    });

    // Puppeteer에 쿠키 설정
    await page.setCookie(...cookies);

    await page.goto('http://localhost:3000/result_visual', { waitUntil: 'networkidle0' });

    // PDF로 렌더링
    const pdf = await page.pdf({ format: 'A4' });

    await browser.close();

    // PDF 파일을 클라이언트에게 제공
    res.contentType('application/pdf');
    res.send(pdf);
});

module.exports = router;