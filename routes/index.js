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

router.get('/', (req, res) => {
    // if (req.isAuthenticated()) {
    //     res.render('index', {
    //         isAuthenticated: req.isAuthenticated()
    //     });  // 인증된 사용자는 인덱스 페이지로 렌더링
    // } else {
    //     res.render('index');  // 인증되지 않은 사용자는 인덱스 페이지로 렌더링
    // }
    res.render('index', {
        isAuthenticated: req.isAuthenticated()
    });  // 인증된 사용자는 인덱스 페이지로 렌더링
});

router.get('/dashboard_forensic', ensureAuthenticated, (req, res) => {
    res.render('dashboard', {
        name: req.user.name,
        userId: req.user._id,
        imgPath: "./asset/forensic.png",
        menu: "forensic",
        title: "음성 위변조 탐지 대시보드"
    })
})

router.get('/dashboard_ai_singer', ensureAuthenticated, (req, res) => {
    res.render('dashboard', {
        name: req.user.name,
        userId: req.user._id,
        imgPath: "./asset/ai_singer.png",
        menu: "ai_singer",
        title: "AI 가수 목소리 탐지 대시보드"
    })
})

router.get('/dashboard_announce', ensureAuthenticated, (req, res) => {
    res.render('dashboard', {
        name: req.user.name,
        userId: req.user._id,
        imgPath: "./asset/announce.png",
        menu: "announce",
        title: "발성 연습 및 교정 대시보드"
    })
})

router.get('/upload_forensic', ensureAuthenticated, (req, res) => {
    res.render('upload', {
        userId: req.user._id,
        flag : 1,
        imgPath: "./asset/forensic.png"
    })
})

router.get('/upload_ai_singer', ensureAuthenticated, (req, res) => {
    res.render('upload', {
        userId: req.user._id,
        flag: 2,
        imgPath: "./asset/ai_singer.png"
    })
})

router.get('/upload_announce', ensureAuthenticated, (req, res) => {
    res.render('upload', {
        userId: req.user._id,
        flag: 3,
        imgPath: "./asset/announce.png"
    })
})


// HTML 페이지 렌더링 라우트 -> 라우트 페이지
router.get('/train_process', ensureAuthenticated, (req, res) => {
    res.render('train_process', {
        flag: req.query.flag
    });
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

//result 값 1/2/3 확인 -> 0802 수정
async function checkUserResult(userId, flag) {
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

        if (!result) {
            return { error: "Results not found", status: 204 };
        }

        /*let ret; -> 굳이 필요없음, 그냥 result만 넘겨줘도 됨
        //flag에 해당하지 않는 정확도는 어차피 null로 설정해놓음
        if (flag === 1) {
            ret = result.result_MAE_similarity;
            console.log('flag 1')
        } else if (flag === 2) {
            ret = result.ai_voice_MAE_similarity;
            console.log('flag 2')
        } else if (flag === 3) {
            ret = result.announcer_MAE_similarity;
            console.log('flag 3')
        } else {
            return { error: "Invalid flag", status: 400 };
        }*/

        return { result: result, error: null, status: 200 };

    } catch (error) {
        console.error("Error fetching result:", error);
        return { error: "Server error", status: 500 };
    }
}


// 결과 페이지 라우트
router.get('/result', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id, 1);
    //const { result, error, status } = await checkUserResult(req.user._id);

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

// 결과 페이지 라우트
router.get('/result_forensic', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id, 1);

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    // 결과가 있으면 결과 페이지 렌더링
    res.render('result_forensic', {
        userId: req.user._id,
        result
    })
});

// 결과 페이지 라우트
router.get('/result_ai_singer', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id, 2);

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    // 결과가 있으면 결과 페이지 렌더링
    res.render('result_ai_singer', {
        userId: req.user._id,
        result
    })
});

// 결과 페이지 라우트
router.get('/result_announce', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id, 3);
    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    // 결과가 있으면 결과 페이지 렌더링
    res.render('result_announce', {
        userId: req.user._id,
        result
    })
});



// 결과 시각화 페이지 라우트
router.get('/result_visual', ensureAuthenticated, async (req, res) => {

    const { result, error, status } = await checkUserResult(req.user._id, 1);
    //const { result, error, status } = await checkUserResult(req.user._id);

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }
    
    const recordAvg = await CoeffieRecordAvg.findOne({ files_record_id: result.files_record_id }).lean();
    const controlAvg = await CoeffieControlAvg.findOne({ files_control_id: result.files_control_id }).lean();

    // 결과가 있으면 결과 시각화 페이지 렌더링
    res.render('result_visual', {
        userId: req.user._id,
        result,
        recordAvg: recordAvg || {}, // recordAvg가 null이면 빈 객체를 할당
        controlAvg: controlAvg || {} // controlAvg가 null이면 빈 객체를 할당
    });
});

/**
 *  아나운서 결과 페이지 라우트
 */
router.get('/announcer_result', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id, 3);

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    // 결과가 있으면 결과 페이지 렌더링
    res.render('announcer_result', {
        userId: req.user._id,
        result
    })
});

/**
 *  아나운서 상세보기 페이지 라우트
 */
router.get('/announcer_result_detail', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id, 3);

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    // 결과가 있으면 결과 페이지 렌더링
    res.render('result_detail_announce', {
        userId: req.user._id,
        result
    })
});

/**
 *  아나운서 개선연습 페이지 라우트
 */
router.get('/announcer_improvements', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id, 3);

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    var mfccDescriptions = [
        {name: "음성의 피치 변화", mfcc: "MFCC2", value: result.mfcc_acc_list[0]},
        {name: "발음의 정확성", mfcc: "MFCC3", value: result.mfcc_acc_list[1]},
        {name: "특정 음소의 발음 전달", mfcc: "MFCC5", value: result.mfcc_acc_list[2]},
        {name: "발음의 연결성", mfcc: "MFCC6", value: result.mfcc_acc_list[3]},
        {name: "발음 속도", mfcc: "MFCC8", value: result.mfcc_acc_list[4]}
      ];
      var excellent = [];
      var good = [];
      var poor = [];
      var poor_mfccs = [];
      var thresholds = [95, 80];  // 우수: 95 이상, 양호: 80-94, 미흡: 80 미만
      var i = 0;
      var mfcc = ["mfcc2", "mfcc3", "mfcc5", ,"mfcc6", "mfcc8"];
      mfccDescriptions.forEach(desc => {
        if (desc.value >= thresholds[0]) {
          excellent.push(`${desc.name}(${desc.mfcc})`);
        } else if (desc.value >= thresholds[1]) {
          good.push(`${desc.name}(${desc.mfcc})`);
        } else {
          poor.push(`${desc.name}(${desc.mfcc})`);
          poor_mfccs.push(mfcc[i])
        }
        i++;
      });
      console.log(poor_mfccs)
    // 결과가 있으면 결과 페이지 렌더링
    res.render('improvements_announce', {
        userId: req.user._id,
        result, 
        excellent,
        good,
        poor,
        poor_mfccs,
    })
});

router.get('/forensic_result_detail', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id, 1);

    const recordAvg = await CoeffieRecordAvg.findOne({ files_record_id: result.files_record_id }).lean();
    const controlAvg = await CoeffieControlAvg.findOne({ files_control_id: result.files_control_id }).lean();
    
    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    // 결과가 있으면 결과 페이지 렌더링
    res.render('result_detail_forensic', {
        userId: req.user._id,
        result,
        recordAvg: recordAvg || {}, // recordAvg가 null이면 빈 객체를 할당
        controlAvg: controlAvg || {} // controlAvg가 null이면 빈 객체를 할당
    })
});

router.get('/result_detail_ai_singer', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id, 2);
    
    const recordAvg = await CoeffieRecordAvg.findOne({ files_record_id: result.files_record_id }).lean();
    const controlAvg = await CoeffieControlAvg.findOne({ files_control_id: result.files_control_id }).lean();

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    // 결과가 있으면 결과 페이지 렌더링
    res.render('result_detail_ai_singer', {
        userId: req.user._id,
        result,
        recordAvg: recordAvg || {}, // recordAvg가 null이면 빈 객체를 할당
        controlAvg: controlAvg || {} // controlAvg가 null이면 빈 객체를 할당
    })
});

router.get('/result_overall_ai_singer', ensureAuthenticated, async (req, res) => {
    
    const { result, error, status } = await checkUserResult(req.user._id, 2);

    if (error) {
        if (status === 404 || status === 500) {
            return res.status(status).send(error);
        }
        // 결과가 없는 경우
        return res.render('no_result', { message: error });
    }

    const recordAvg = await CoeffieRecordAvg.findOne({ files_record_id: result.files_record_id }).lean();
    const controlAvg = await CoeffieControlAvg.findOne({ files_control_id: result.files_control_id }).lean();

    //0803 sohee 추가 시작
    const mfccIndices = [2, 3, 4, 8, 9, 11];
    const mfccDescriptions = [" ", " ", "에너지 집중도가 ", "특정 발음 패턴의 강조도가 ", "중주파수 대역에서 주파수 변동성 및 음성의 질감 정도가 ",
        " ", " ", " ", "고주파수 대역에서 미세한 발음 변화가 ", "고주파수 대역에서 강세 위치가 ", " ", "고주파수 대역에서 끝맺음 발음이 "]

    let maxDifference = 0;
    let maxDifferenceIndex = 2;

    mfccIndices.forEach(index => {
        const recordValue = recordAvg[`MFCC${index}`];
        const controlValue = controlAvg[`MFCC${index}`];
        const difference = Math.abs(recordValue - controlValue);
    
        if (difference > maxDifference) {
            maxDifference = difference;
            maxDifferenceIndex = index;
        }
    });

    var des = mfccDescriptions[maxDifferenceIndex];

    console.log(`가장 큰 절댓값 차이를 가진 MFCC 계수: MFCC${maxDifferenceIndex}`);
    console.log(`그 절댓값 차이: ${maxDifference}`);
    //0802 sohee 추가 끝

    // 결과가 있으면 결과 페이지 렌더링
    res.render('result_overall_ai_singer', {
        userId: req.user._id,
        result,
        maxDifference,
        maxDifferenceIndex,
        des
    })
});

// router.post('/file_download', ensureAuthenticated, async (req, res) => {
//     const { flag } = req.body;
//     const { result, error, status } = await checkUserResult(req.user._id, flag);

//     if (error) {
//         if (status === 404 || status === 500) {
//             return res.status(status).send(error);
//         }
//         // 결과가 없는 경우
//         return res.render('no_result', { message: error });
//     }

//     const browser = await puppeteer.launch({ args: ['--font-render-hinting=none'] });
//     const page = await browser.newPage();

//     // 로그인 쿠키 가져오기
//     const cookies = req.headers.cookie.split(';').map(cookie => {
//         const [name, value] = cookie.split('=').map(c => c.trim());
//         return {name, value, domain: 'localhost', url: 'http://localhost:3000'};
//     });

//     // Puppeteer에 쿠키 설정
//     await page.setCookie(...cookies);

//     switch(flag) {
//         case 1: await page.goto('http://localhost:3000/result_visual', { waitUntil: 'networkidle0' }); break;
//         // case 2: await page.goto('http://localhost:3000/singer_result_detail', { waitUntil: 'networkidle0' }); break;
//         // case 3: await page.goto('http://localhost:3000/announcer_result_detail', { waitUntil: 'networkidle0' }); break;
//         default: console.log('flag error in index.js');
//     }
    

//     // PDF로 렌더링
//     const pdf = await page.pdf({ format: 'A4' });

//     await browser.close();

//     // PDF 파일을 클라이언트에게 제공
//     res.contentType('application/pdf');
//     res.send(pdf);
// });

router.post('/file_download_forensic', ensureAuthenticated, async (req, res) => {
    const { flag } = req.body;
    const { result, error, status } = await checkUserResult(req.user._id, flag);

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

    switch(flag) {
        case 1: await page.goto('http://localhost:3000/result_visual', { waitUntil: 'networkidle0' }); break;
        // case 2: await page.goto('http://localhost:3000/singer_result_detail', { waitUntil: 'networkidle0' }); break;
        // case 3: await page.goto('http://localhost:3000/announcer_result_detail', { waitUntil: 'networkidle0' }); break;
        default: console.log('flag error in index.js');
    }
    

    // PDF로 렌더링
    const pdf = await page.pdf({ format: 'A4' });

    await browser.close();

    // PDF 파일을 클라이언트에게 제공
    res.contentType('application/pdf');
    res.send(pdf);
});

router.post('/file_download_ai_singer', ensureAuthenticated, async (req, res) => {
    const { flag } = req.body;
    const { result, error, status } = await checkUserResult(req.user._id, flag);

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

    switch(flag) {
        case 1: await page.goto('http://localhost:3000/result_visual', { waitUntil: 'networkidle0' }); break;
        // case 2: await page.goto('http://localhost:3000/singer_result_detail', { waitUntil: 'networkidle0' }); break;
        // case 3: await page.goto('http://localhost:3000/announcer_result_detail', { waitUntil: 'networkidle0' }); break;
        default: console.log('flag error in index.js');
    }
    

    // PDF로 렌더링
    const pdf = await page.pdf({ format: 'A4' });

    await browser.close();

    // PDF 파일을 클라이언트에게 제공
    res.contentType('application/pdf');
    res.send(pdf);
});

router.post('/file_download_announce', ensureAuthenticated, async (req, res) => {
    const { flag } = req.body;
    const { result, error, status } = await checkUserResult(req.user._id, flag);

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

    switch(flag) {
        case 1: await page.goto('http://localhost:3000/result_visual', { waitUntil: 'networkidle0' }); break;
        // case 2: await page.goto('http://localhost:3000/singer_result_detail', { waitUntil: 'networkidle0' }); break;
        // case 3: await page.goto('http://localhost:3000/announcer_result_detail', { waitUntil: 'networkidle0' }); break;
        default: console.log('flag error in index.js');
    }
    

    // PDF로 렌더링
    const pdf = await page.pdf({ format: 'A4' });

    await browser.close();

    // PDF 파일을 클라이언트에게 제공
    res.contentType('application/pdf');
    res.send(pdf);
});


module.exports = router;